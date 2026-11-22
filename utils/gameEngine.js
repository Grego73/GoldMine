const { pool } = require('../config/db');
const { getGameConfig } = require('../config/gameConfig');
const { EVENTS_CATALOG } = require('../config/eventsCatalog');

// Tire un client pondéré selon son poids_apparition depuis la table clients_catalog
function tirerClientPondere(catalogue) {
    const totalPoids = catalogue.reduce((acc, c) => acc + (parseInt(c.poids_apparition) || 10), 0);
    let r = Math.random() * totalPoids;
    for (const item of catalogue) {
        r -= (parseInt(item.poids_apparition) || 10);
        if (r <= 0) return item;
    }
    return catalogue.at(0);
}

// Génère les N clients acheteurs actifs pour le cycle de X heures
async function genererClientsMarche(clientDb, coursOr, cfg) {
    const resCat = await clientDb.query('SELECT * FROM clients_catalog WHERE actif = TRUE');
    if (resCat.rows.length === 0) return;

    await clientDb.query('DELETE FROM market_clients');

    const nbClients = Math.max(1, Math.round(cfg.nbClientsMarche));
    const heuresCycle = Math.max(1, cfg.cycleMarcheHeures);
    const expiresAt = new Date(Date.now() + heuresCycle * 3600 * 1000);

    for (let i = 0; i < nbClients; i++) {
        const modele = tirerClientPondere(resCat.rows);
        const minGr = parseFloat(modele.min_gr);
        const maxGr = parseFloat(modele.max_gr);
        const demande = Math.round(minGr + Math.random() * (maxGr - minGr));

        const bMin = parseFloat(modele.bonus_min);
        const bMax = parseFloat(modele.bonus_max);
        const bonusPrix = bMin + Math.random() * (bMax - bMin);
        const prixBase = +(coursOr * (1 + bonusPrix)).toFixed(2);

        const margeMax = +(Math.random() * cfg.margeNegociationMax).toFixed(3);

        await clientDb.query(
            `INSERT INTO market_clients (nom, type_client, secteur, demande_grammes, prix_base_gramme, marge_acceptee_max, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [modele.nom, modele.type_client, modele.secteur, demande, prixBase, margeMax, expiresAt]
        );
    }
}

// Résout toutes les enchères et annonces brocante expirées
async function resoudreEncheresExpirees(clientDb, cfg) {
    const expiredRes = await clientDb.query(`
        SELECT a.*, f.nom FROM market_auctions a
        JOIN player_fleet f ON f.id = a.fleet_id
        WHERE a.expires_at <= NOW()
        FOR UPDATE OF a
    `);

    for (const auc of expiredRes.rows) {
        if (auc.mode_vente === 'ENCHERE' && auc.highest_bidder_id) {
            const prixFinal = parseFloat(auc.prix_actuel);
            const netVendeur = +(prixFinal * (1 - cfg.commissionBrocantePct)).toFixed(2);

            await clientDb.query('UPDATE mines SET argent = argent + $1, foreuses = GREATEST(0, foreuses - 1) WHERE user_id = $2', [netVendeur, auc.seller_id]);
            await clientDb.query('UPDATE mines SET foreuses = foreuses + 1 WHERE user_id = $1', [auc.highest_bidder_id]);
            await clientDb.query(`UPDATE player_fleet SET owner_id = $1, statut = 'ACTIF' WHERE id = $2`, [auc.highest_bidder_id, auc.fleet_id]);
        } else {
            await clientDb.query(`UPDATE player_fleet SET statut = 'ACTIF' WHERE id = $1`, [auc.fleet_id]);
        }
        await clientDb.query('DELETE FROM market_auctions WHERE id = $1', [auc.id]);
    }
}
// Vérifie et exécute : 1) Enchères expirées 2) Cycle marché (4h) 3) Clôture quotidienne (3h00)
async function synchroniserHorlogeServeur() {
    const cfg = getGameConfig();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 0. Résolution des enchères et annonces expirées
        await resoudreEncheresExpirees(client, cfg);

        const resMkt = await client.query('SELECT * FROM market_state WHERE id = 1 FOR UPDATE');
        if (resMkt.rows.length === 0) {
            await client.query('COMMIT');
            return;
        }
        const mkt = resMkt.rows.at(0);
        let coursOr = parseFloat(mkt.cours_or);
        let historique = Array.isArray(mkt.historique_cours) ? mkt.historique_cours : [];

        // A. CYCLE MARCHÉ (TOUTES LES X HEURES)
        const msCycle = cfg.cycleMarcheHeures * 3600 * 1000;
        const tempsEcouleMarche = Date.now() - new Date(mkt.last_market_tick).getTime();

        const resCountClients = await client.query('SELECT COUNT(*) FROM market_clients');
        const aucunClient = parseInt(resCountClients.rows.at(0).count) === 0;

        if (tempsEcouleMarche >= msCycle || aucunClient) {
            const variation = (Math.random() * 6 - 2.5) / 100;
            coursOr = Math.max(cfg.coursOrMin, Math.min(cfg.coursOrMax, +(coursOr * (1 + variation)).toFixed(2)));

            const heureLabel = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
            historique.push({ label: heureLabel, cours: coursOr });
            if (historique.length > 24) historique.shift();

            await genererClientsMarche(client, coursOr, cfg);
            await client.query(
                `UPDATE market_state SET cours_or = $1, historique_cours = $2, last_market_tick = NOW() WHERE id = 1`,
                [coursOr, JSON.stringify(historique)]
            );
        }

        // B. CLÔTURE QUOTIDIENNE À L'HEURE CONFIGURÉE (3H00 DU MATIN)
        const nowParis = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
        const heureCloture = Math.floor(cfg.heureClotureJour);

        const dateLogique = new Date(nowParis);
        if (nowParis.getHours() < heureCloture) {
            dateLogique.setDate(dateLogique.getDate() - 1);
        }
        const dateJourStr = dateLogique.toISOString().split('T').at(0);
        const lastDailyStr = new Date(mkt.last_daily_tick).toISOString().split('T').at(0);

        if (dateJourStr > lastDailyStr) {
            const resMines = await client.query(`
                SELECT m.*, u.username FROM mines m
                JOIN users u ON u.id = m.user_id
                WHERE u.is_banned = FALSE
            `);

            for (const mine of resMines.rows) {
                const parcelles = mine.parcelles;
                const pActive = parcelles.at(mine.parcelle_active) || parcelles.at(0);
                const cadence = parseFloat(mine.cadence) || 1.0;
                const mineurs = parseInt(mine.mineurs) || 0;

                let moral = Math.max(0, Math.min(100, parseFloat(mine.moral) - ((cadence - 1) * 20) + 2));
                const greve = moral < 25;
                const prodMineurs = greve ? 0 : (mineurs * cfg.prodMineurTonnes * cadence * (moral / 100));

                // 1. Calcul sur la flotte personnelle active (player_fleet)
                const fleetRes = await client.query(`SELECT * FROM player_fleet WHERE owner_id = $1 AND statut = 'ACTIF'`, [mine.user_id]);
                let prodEngins = 0;
                let coutCarburantTotal = 0;
                let pannesCount = 0;
                let sommeUsure = 0;

                for (const engin of fleetRes.rows) {
                    let usureEngin = Math.min(100, parseFloat(engin.usure_actuelle) + (parseFloat(engin.usure_jour) * cadence));
                    const panne = (Math.random() * 100) < usureEngin;
                    coutCarburantTotal += parseFloat(engin.carburant_jour);

                    if (panne) {
                        usureEngin = 0;
                        pannesCount += 1;
                    } else {
                        prodEngins += parseFloat(engin.prod_tonnes) * cadence;
                    }
                    sommeUsure += usureEngin;
                    await client.query('UPDATE player_fleet SET usure_actuelle = $1 WHERE id = $2', [usureEngin, engin.id]);
                }

                // 2. Calcul sur les engins loués par ce PDG (active_rentals)
                const rentalsRes = await client.query(`SELECT * FROM active_rentals WHERE renter_id = $1 AND statut = 'EN_COURS'`, [mine.user_id]);
                let coutLoyers = 0;
                let impayesCount = 0;
                let argentActuel = parseFloat(mine.argent);

                for (const loc of rentalsRes.rows) {
                    const loyer = parseFloat(loc.loyer_jour);
                    if (argentActuel - coutLoyers < loyer) {
                        // Impayé : résiliation immédiate et retour au propriétaire
                        impayesCount += 1;
                        if (loc.source_type === 'PDG' && loc.fleet_id) {
                            await client.query(`UPDATE player_fleet SET statut = 'ACTIF' WHERE id = $1`, [loc.fleet_id]);
                        }
                        await client.query('DELETE FROM active_rentals WHERE id = $1', [loc.id]);
                        continue;
                    }

                    coutLoyers += loyer;
                    coutCarburantTotal += parseFloat(loc.carburant_jour);
                    prodEngins += parseFloat(loc.prod_tonnes) * cadence;

                    if (loc.source_type === 'PDG' && loc.owner_id) {
                        const netProprio = +(loyer * (1 - cfg.commissionLocationPdgPct)).toFixed(2);
                        await client.query('UPDATE mines SET argent = argent + $1 WHERE user_id = $2', [netProprio, loc.owner_id]);
                        if (loc.fleet_id) {
                            const mult = cfg.usureLocataireMultiplicateur;
                            await client.query(
                                'UPDATE player_fleet SET usure_actuelle = LEAST(100, usure_actuelle + ($1 * $2)) WHERE id = $3',
                                [loc.usure_jour, mult, loc.fleet_id]
                            );
                        }
                    }

                    const restant = parseInt(loc.jours_restants) - 1;
                    if (restant <= 0) {
                        if (loc.source_type === 'PDG' && loc.fleet_id) {
                            await client.query(`UPDATE player_fleet SET statut = 'ACTIF' WHERE id = $1`, [loc.fleet_id]);
                        }
                        await client.query('DELETE FROM active_rentals WHERE id = $1', [loc.id]);
                    } else {
                        await client.query('UPDATE active_rentals SET jours_restants = $1 WHERE id = $2', [restant, loc.id]);
                    }
                }

                const rocheExtraite = Math.min(pActive.reserveReelle, prodMineurs + prodEngins);
                pActive.reserveReelle = Math.max(0, +(pActive.reserveReelle - rocheExtraite).toFixed(1));

                const orProduit = +(rocheExtraite * pActive.pureteReelle).toFixed(1);
                const stockOr = parseFloat(mine.stock_or) + orProduit;

                let couts = (mineurs * cfg.salaireMineurJour) + coutCarburantTotal + coutLoyers + (pannesCount * cfg.coutPanneForcee);
                let rapport = `Clôture J${mine.jour + 1} : +${Math.round(orProduit)}g d'or (${Math.round(rocheExtraite)}t) | Frais : -${Math.round(couts)} €`;

                if (greve) rapport += ' | ✊ GRÈVE (moral bas)';
                if (pannesCount > 0) rapport += ` | ⚠️ ${pannesCount} PANNE(S) (-${pannesCount * cfg.coutPanneForcee} €)`;
                if (impayesCount > 0) rapport += ` | 🚨 ${impayesCount} LOCATION(S) RÉSILIÉE(S) (impayé)`;

                const argentFinal = argentActuel - couts;
                const usureMoyenne = fleetRes.rows.length > 0 ? +(sommeUsure / fleetRes.rows.length).toFixed(1) : 0;
                const marketingPoints = Math.max(1, +(parseFloat(mine.marketing_points) * (1 - cfg.usureMarketingJour)).toFixed(1));

                let pendingEvent = mine.pending_event;
                if (!pendingEvent && Math.random() < cfg.chanceEvenement && EVENTS_CATALOG.length > 0) {
                    pendingEvent = EVENTS_CATALOG.at(Math.floor(Math.random() * EVENTS_CATALOG.length));
                }

                await client.query(
                    `UPDATE mines SET jour = jour + 1, argent = $1, stock_or = $2, moral = $3, usure = $4,
                     foreuses = $5, marketing_points = $6, parcelles = $7, pending_event = $8, updated_at = NOW()
                     WHERE user_id = $9`,
                    [argentFinal, stockOr, moral, usureMoyenne, fleetRes.rows.length, marketingPoints, JSON.stringify(parcelles), pendingEvent ? JSON.stringify(pendingEvent) : null, mine.user_id]
                );

                await client.query(
                    `INSERT INTO player_logs (user_id, username, category, details) VALUES ($1, $2, 'CLOTURE', $3)`,
                    [mine.user_id, mine.username, rapport]
                );
            }

            await client.query(`UPDATE market_state SET last_daily_tick = $1 WHERE id = 1`, [dateJourStr]);
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Erreur horloge serveur :', err);
    } finally {
        client.release();
    }
}

module.exports = { synchroniserHorlogeServeur };
