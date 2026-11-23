const { pool } = require('../config/db');
const { getGameConfig } = require('../config/gameConfig');
const { EVENTS_CATALOG } = require('../config/eventsCatalog');

function tirerClientPondere(catalogue) {
    const totalPoids = catalogue.reduce((acc, c) => acc + (parseInt(c.poids_apparition) || 10), 0);
    let r = Math.random() * totalPoids;
    for (const item of catalogue) {
        r -= (parseInt(item.poids_apparition) || 10);
        if (r <= 0) return item;
    }
    return catalogue.at(0);
}

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

        // A. CYCLE MARCHÉ & CLIENTS (TOUTES LES 4 HEURES)
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

        // B. EXTRACTION HORAIRE EN DIRECT (TOUTES LES HEURES PILES)
        const msHeure = 3600 * 1000;
        const tempsEcouleHeure = Date.now() - new Date(mkt.last_hourly_tick || mkt.last_market_tick).getTime();

        if (tempsEcouleHeure >= msHeure) {
            const heuresEcoulees = Math.min(24, Math.floor(tempsEcouleHeure / msHeure));

            const resMines = await client.query(`
                SELECT m.*, u.username FROM mines m
                JOIN users u ON u.id = m.user_id
                WHERE u.is_banned = FALSE
            `);

            for (const mine of resMines.rows) {
                const parcelles = mine.parcelles;
                const cadence = parseFloat(mine.cadence) || 1.0;

                // Effectifs RH & Cadres Trombinoscope
                const mineurs = parseInt(mine.mineurs) || 0;
                const conducteurs = parseInt(mine.conducteurs) || 0;
                const mecaniciens = parseInt(mine.mecaniciens) || 0;
                const chefsEquipe = parseInt(mine.chefs_equipe) || 0;
                const cadres = Array.isArray(mine.cadres) ? mine.cadres : [];

                const hasMaintenance = cadres.includes('MAINTENANCE');
                const hasMetallurgiste = cadres.includes('METALLURGISTE');
                const hasHSE = cadres.includes('HSE');
                const hasRSE = cadres.includes('RSE');
                const trombinoscopeComplet = cadres.length >= 6;

                let moral = Math.max(0, Math.min(100, parseFloat(mine.moral) - (((cadence - 1) * 20) / 24 * heuresEcoulees) + ((hasRSE ? 4 : 2) / 24 * heuresEcoulees)));
                const greve = moral < 25;

                // Flotte active & Locations en cours
                const fleetRes = await client.query(`SELECT * FROM player_fleet WHERE owner_id = $1 AND statut = 'ACTIF' ORDER BY vitesse_reglee_th DESC`, [mine.user_id]);
                const rentalsRes = await client.query(`SELECT * FROM active_rentals WHERE renter_id = $1 AND statut = 'EN_COURS' ORDER BY vitesse_reglee_th DESC`, [mine.user_id]);

                const nbEnginsTotal = fleetRes.rows.length + rentalsRes.rows.length;

                // Ratios Mécaniciens (1 pour 3 engins) & Chefs d'équipe (1 pour 8 ouvriers)
                const mecaRequis = nbEnginsTotal > 0 ? Math.ceil(nbEnginsTotal / (cfg.enginsParMecano || 3)) : 0;
                const multUsureMecano = mecaniciens < mecaRequis ? (cfg.usureSansMecanoMult || 1.5) : 1.0;
                const multUsureCadre = hasMaintenance ? 0.75 : 1.0;

                const totalOuvriers = conducteurs + mecaniciens;
                const chefsRequis = totalOuvriers > 0 ? Math.ceil(totalOuvriers / (cfg.ouvriersParChef || 8)) : 0;
                const multProdChef = chefsEquipe < chefsRequis ? (1 - (cfg.malusManqueChefPct || 0.20)) : 1.0;

                // Débits par secteur (Excavation, Transport, Traitement, Lavage)
                const debitsSecteur = {};
                let conducteursDispo = conducteurs;
                const reqParEngin = parseInt(cfg.conducteursRequisParEngin) || 2;

                let coutCarburantHoraire = 0;
                let pannesCount = 0;
                let sommeUsure = 0;

                // 1. Calcul sur la flotte personnelle
                for (const engin of fleetRes.rows) {
                    const affectes = Math.min(reqParEngin, conducteursDispo);
                    conducteursDispo -= affectes;
                    const ratioHoraire = affectes / reqParEngin; // 1.0 (24h), 0.5 (12h) ou 0 (arrêt)

                    const vReglee = parseFloat(engin.vitesse_reglee_th) || 45;
                    const vMax = parseFloat(engin.vitesse_max_th) || 60;
                    const ratioVitesse = Math.max(0.1, vReglee / vMax);

                    // Usure non-linéaire selon la vitesse réglée (ratioVitesse^1.6)
                    const usureHoraireBase = (parseFloat(engin.usure_jour) / 24) * heuresEcoulees;
                    const usureGagnee = usureHoraireBase * Math.pow(ratioVitesse, 1.6) * cadence * ratioHoraire * multUsureMecano * multUsureCadre;
                    let usureEngin = Math.min(100, parseFloat(engin.usure_actuelle) + usureGagnee);

                    const panne = ratioHoraire > 0 && ((Math.random() * 100 * (24 / heuresEcoulees)) < usureEngin);

                    if (ratioHoraire > 0) {
                        coutCarburantHoraire += ((parseFloat(engin.carburant_jour) / 24) * ratioVitesse * ratioHoraire) * heuresEcoulees;
                    }

                    if (panne) {
                        pannesCount += 1;
                        await client.query(`UPDATE player_fleet SET usure_actuelle = 100, statut = 'EN_PANNE' WHERE id = $1`, [engin.id]);
                        sommeUsure += 100;
                    } else {
                        const sIdx = parseInt(engin.parcelle_index) || 0;
                        if (!debitsSecteur[sIdx]) debitsSecteur[sIdx] = { Excavation: 0, Transport: 0, Traitement: 0, Lavage: 0 };
                        const debitEffectif = vReglee * ratioHoraire * cadence * heuresEcoulees;
                        const cat = (engin.categorie || '').toLowerCase();
                        if (cat.includes('transport')) debitsSecteur[sIdx].Transport += debitEffectif;
                        else if (cat.includes('traitement')) debitsSecteur[sIdx].Traitement += debitEffectif;
                        else if (cat.includes('lavage')) debitsSecteur[sIdx].Lavage += debitEffectif;
                        else debitsSecteur[sIdx].Excavation += debitEffectif;

                        sommeUsure += usureEngin;
                        await client.query('UPDATE player_fleet SET usure_actuelle = $1 WHERE id = $2', [usureEngin, engin.id]);
                    }
                }

                // 2. Calcul sur les engins loués
                let coutLoyersHoraire = 0;
                for (const loc of rentalsRes.rows) {
                    const affectes = Math.min(reqParEngin, conducteursDispo);
                    conducteursDispo -= affectes;
                    const ratioHoraire = affectes / reqParEngin;

                    const vReglee = parseFloat(loc.vitesse_reglee_th) || 45;
                    const vMax = parseFloat(loc.vitesse_max_th) || 60;
                    const ratioVitesse = Math.max(0.1, vReglee / vMax);

                    const loyerHeure = (parseFloat(loc.loyer_jour) / 24) * heuresEcoulees;
                    coutLoyersHoraire += loyerHeure;

                    if (ratioHoraire > 0) {
                        coutCarburantHoraire += ((parseFloat(loc.carburant_jour) / 24) * ratioVitesse * ratioHoraire) * heuresEcoulees;
                        const sIdx = parseInt(loc.parcelle_index) || 0;
                        if (!debitsSecteur[sIdx]) debitsSecteur[sIdx] = { Excavation: 0, Transport: 0, Traitement: 0, Lavage: 0 };
                        const debitEffectif = vReglee * ratioHoraire * cadence * heuresEcoulees;
                        const cat = (loc.categorie || '').toLowerCase();
                        if (cat.includes('transport')) debitsSecteur[sIdx].Transport += debitEffectif;
                        else if (cat.includes('traitement')) debitsSecteur[sIdx].Traitement += debitEffectif;
                        else if (cat.includes('lavage')) debitsSecteur[sIdx].Lavage += debitEffectif;
                        else debitsSecteur[sIdx].Excavation += debitEffectif;
                    }

                    if (loc.source_type === 'PDG' && loc.owner_id) {
                        const netProprio = +(loyerHeure * (1 - cfg.commissionLocationPdgPct)).toFixed(2);
                        await client.query('UPDATE mines SET argent = argent + $1 WHERE user_id = $2', [netProprio, loc.owner_id]);
                        if (loc.fleet_id && ratioHoraire > 0) {
                            const mult = cfg.usureLocataireMultiplicateur * multUsureMecano * multUsureCadre;
                            const usureLoc = ((parseFloat(loc.usure_jour) / 24) * heuresEcoulees) * Math.pow(ratioVitesse, 1.6) * mult * ratioHoraire;
                            await client.query(
                                'UPDATE player_fleet SET usure_actuelle = LEAST(100, usure_actuelle + $1) WHERE id = $2',
                                [usureLoc, loc.fleet_id]
                            );
                        }
                    }

                    // Décompte durée location (en heures -> jours_restants)
                    if (new Date(loc.created_at).getTime() + (parseInt(loc.jours_restants) * 24 * 3600 * 1000) <= Date.now()) {
                        if (loc.source_type === 'PDG' && loc.fleet_id) {
                            await client.query(`UPDATE player_fleet SET statut = 'ACTIF' WHERE id = $1`, [loc.fleet_id]);
                        }
                        await client.query('DELETE FROM active_rentals WHERE id = $1', [loc.id]);
                    }
                }

                // 3. Production réelle secteur par secteur (Maillon le plus faible + mineurs manuels sur parcelle active)
                let orProduitTotal = 0;
                let rocheExtraiteTotale = 0;

                // Bonus Or Pur (Métallurgiste +10% & Trombinoscope complet +15%)
                let multOr = 1.0;
                if (hasMetallurgiste) multOr += 0.10;
                if (trombinoscopeComplet) multOr += (cfg.bonusTrombinoscopeCompletPct || 0.15);

                for (let idx = 0; idx < parcelles.length; idx++) {
                    const p = parcelles.at(idx);
                    if (!p || !p.estSondee || p.reserveReelle <= 0) continue;

                    const d = debitsSecteur[idx] || { Excavation: 0, Transport: 0, Traitement: 0, Lavage: 0 };
                    const debitChaine = Math.min(d.Excavation, d.Transport, d.Traitement, d.Lavage);

                    // Les mineurs manuels travaillent à la battée sur la parcelle active
                    let prodManuelle = 0;
                    if (idx === parseInt(mine.parcelle_active) && !greve) {
                        prodManuelle = ((mineurs * cfg.prodMineurTonnes) / 24) * heuresEcoulees * cadence * (moral / 100);
                    }

                    const extractionSecteur = (debitChaine + prodManuelle) * multProdChef;
                    if (extractionSecteur > 0) {
                        const roche = Math.min(p.reserveReelle, extractionSecteur);
                        p.reserveReelle = Math.max(0, +(p.reserveReelle - roche).toFixed(1));
                        rocheExtraiteTotale += roche;
                        orProduitTotal += roche * p.pureteReelle * multOr;
                    }
                }

                orProduitTotal = +orProduitTotal.toFixed(2);
                const stockOr = parseFloat(mine.stock_or) + orProduitTotal;

                // 4. Cumul des frais horaires dans la facture de la semaine
                const salairesHoraires = (((mineurs * cfg.salaireMineurJour)
                    + (conducteurs * cfg.salaireConducteurJour)
                    + (mecaniciens * cfg.salaireMecanoJour)
                    + (chefsEquipe * cfg.salaireChefJour)
                    + (cadres.length * cfg.salaireCadreJour)) / 24) * heuresEcoulees;

                const fraisHeure = +(salairesHoraires + coutCarburantHoraire + coutLoyersHoraire).toFixed(2);
                const fraisSemaine = +(parseFloat(mine.frais_semaine_accumules || 0) + fraisHeure).toFixed(2);

                const usureMoyenne = fleetRes.rows.length > 0 ? +(sommeUsure / fleetRes.rows.length).toFixed(1) : 0;
                const bonusMarketingRSE = hasRSE ? (2 / 24) * heuresEcoulees : 0;
                const marketingPoints = Math.max(1, +((parseFloat(mine.marketing_points) * Math.pow(1 - cfg.usureMarketingJour, heuresEcoulees / 24)) + bonusMarketingRSE).toFixed(1));

                const probaIncident = (hasHSE ? (cfg.chanceEvenement * 0.5) : cfg.chanceEvenement) / 24 * heuresEcoulees;
                let pendingEvent = mine.pending_event;
                if (!pendingEvent && Math.random() < probaIncident && EVENTS_CATALOG.length > 0) {
                    pendingEvent = EVENTS_CATALOG.at(Math.floor(Math.random() * EVENTS_CATALOG.length));
                }

                await client.query(
                    `UPDATE mines SET stock_or = $1, moral = $2, usure = $3, foreuses = $4,
                     marketing_points = $5, parcelles = $6, pending_event = $7,
                     frais_semaine_accumules = $8, updated_at = NOW()
                     WHERE user_id = $9`,
                    [stockOr, moral, usureMoyenne, fleetRes.rows.length, marketingPoints, JSON.stringify(parcelles), pendingEvent ? JSON.stringify(pendingEvent) : null, fraisSemaine, mine.user_id]
                );

                if (orProduitTotal > 0 || pannesCount > 0) {
                    let msgLog = `⏱️ Extraction horaire (+${heuresEcoulees}h) : +${orProduitTotal}g d'or (${Math.round(rocheExtraiteTotale)}t) | Frais cumulés semaine : ${Math.round(fraisSemaine).toLocaleString()} €`;
                    if (pannesCount > 0) msgLog += ` | 🚨 ${pannesCount} ENGIN(S) EN PANNE !`;
                    await client.query(
                        `INSERT INTO player_logs (user_id, username, category, details) VALUES ($1, $2, 'MINE', $3)`,
                        [mine.user_id, mine.username, msgLog]
                    );
                }
            }

            await client.query(`UPDATE market_state SET last_hourly_tick = NOW() WHERE id = 1`);
        }

        // C. FACTURE HEBDOMADAIRE (1 FOIS PAR SEMAINE = 7 JOURS)
        const msSemaine = 7 * 24 * 3600 * 1000;
        const tempsEcouleSemaine = Date.now() - new Date(mkt.last_weekly_tick || mkt.last_hourly_tick).getTime();

        if (tempsEcouleSemaine >= msSemaine) {
            const resMinesWeek = await client.query(`
                SELECT m.user_id, m.jour, m.frais_semaine_accumules, m.facture_en_attente, u.username
                FROM mines m JOIN users u ON u.id = m.user_id
                WHERE u.is_banned = FALSE
            `);

            for (const mw of resMinesWeek.rows) {
                const cumul = parseFloat(mw.frais_semaine_accumules) || 0;
                const nouvelleFacture = +(parseFloat(mw.facture_en_attente || 0) + cumul).toFixed(2);

                await client.query(
                    `UPDATE mines SET jour = jour + 7, frais_semaine_accumules = 0, facture_en_attente = $1 WHERE user_id = $2`,
                    [nouvelleFacture, mw.user_id]
                );

                if (cumul > 0) {
                    await client.query(
                        `INSERT INTO player_logs (user_id, username, category, details) VALUES ($1, $2, 'FINANCE', $3)`,
                        [mw.user_id, mw.username, `🧾 Facture hebdomadaire générée : ${Math.round(cumul).toLocaleString()} € (Total à régler : ${Math.round(nouvelleFacture).toLocaleString()} €).`]
                    );
                }
            }

            await client.query(`UPDATE market_state SET last_weekly_tick = NOW() WHERE id = 1`);
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
