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

async function calculerDynamiqueMarche4h(clientDb, coursActuel, cfg) {
    const ventesRes = await clientDb.query(`
        SELECT details FROM player_logs
        WHERE category = 'FINANCE'
          AND details LIKE '💰 Vente de %'
          AND created_at >= NOW() - INTERVAL '4 hours'
    `);
    let orVendu4h = 0;
    for (const row of ventesRes.rows) {
        const match = row.details.match(/Vente de\s+(\d+(?:\.\d+)?)g/i);
        if (match) orVendu4h += parseFloat(match.at(1)) || 0;
    }

    const prodRes = await clientDb.query(`
        SELECT details FROM player_logs
        WHERE category = 'MINE'
          AND details LIKE '%Extraction horaire%'
          AND created_at >= NOW() - INTERVAL '4 hours'
    `);
    let orProduit4h = 0;
    for (const row of prodRes.rows) {
        const match = row.details.match(/\+(\d+(?:\.\d+)?)g d'or/i);
        if (match) orProduit4h += parseFloat(match.at(1)) || 0;
    }

    const achatsRes = await clientDb.query(`
        SELECT COUNT(*) AS nb FROM player_logs
        WHERE category IN ('MATERIEL', 'PROSPECTION')
          AND created_at >= NOW() - INTERVAL '4 hours'
    `);
    const nbAchats4h = parseInt(achatsRes.rows.at(0).nb) || 0;

    const stocksRes = await clientDb.query(`
        SELECT COALESCE(AVG(stock_or), 0) AS moy_stock
        FROM mines m JOIN users u ON u.id = m.user_id
        WHERE u.is_banned = FALSE
    `);
    const moyStock = parseFloat(stocksRes.rows.at(0).moy_stock) || 0;

    const ratioVenteSurProd = orProduit4h > 0 ? (orVendu4h / orProduit4h) : (orVendu4h > 0 ? 1.5 : 0.5);
    const effetVentes = (0.65 - Math.min(2.0, ratioVenteSurProd)) * 0.035;
    const effetInvestissement = Math.min(0.025, nbAchats4h * 0.004);
    const aleaMarche = (Math.random() * 0.024) - 0.012;

    const variationTotale = Math.max(-0.06, Math.min(0.06, effetVentes + effetInvestissement + aleaMarche));
    const nouveauCours = Math.max(
        cfg.coursOrMin || 35,
        Math.min(cfg.coursOrMax || 110, +(coursActuel * (1 + variationTotale)).toFixed(2))
    );

    const multDemande = Math.max(1.0, Math.min(4.0, 1 + (moyStock / 2500)));

    return { nouveauCours, multDemande };
}

async function genererClientsMarche(clientDb, coursOr, cfg, multDemande = 1.0) {
    const resCat = await clientDb.query('SELECT * FROM clients_catalog WHERE actif = TRUE');
    if (resCat.rows.length === 0) return;

    await clientDb.query('DELETE FROM market_clients');

    const nbClients = Math.max(1, Math.round(cfg.nbClientsMarche || 6));
    const heuresCycle = Math.max(1, cfg.cycleMarcheHeures || 4);
    const expiresAt = new Date(Date.now() + heuresCycle * 3600 * 1000);

    for (let i = 0; i < nbClients; i++) {
        const modele = tirerClientPondere(resCat.rows);
        const minGr = parseFloat(modele.min_gr) * multDemande;
        const maxGr = parseFloat(modele.max_gr) * multDemande;
        const demande = Math.round(minGr + Math.random() * (maxGr - minGr));

        const bMin = parseFloat(modele.bonus_min);
        const bMax = parseFloat(modele.bonus_max);
        const bonusPrix = bMin + Math.random() * (bMax - bMin);
        const prixBase = +(coursOr * (1 + bonusPrix)).toFixed(2);

        const margeMax = +(Math.random() * (cfg.margeNegociationMax || 0.15)).toFixed(3);

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
        LEFT JOIN player_fleet f ON f.id = a.fleet_id
        WHERE a.expires_at <= NOW()
        FOR UPDATE OF a
    `);

    for (const auc of expiredRes.rows) {
        if (auc.nom) {
            if (auc.mode_vente === 'ENCHERE' && auc.highest_bidder_id) {
                const prixFinal = parseFloat(auc.prix_actuel);
                const netVendeur = +(prixFinal * (1 - cfg.commissionBrocantePct)).toFixed(2);

                await clientDb.query('UPDATE mines SET argent = argent + $1 WHERE user_id = $2', [netVendeur, auc.seller_id]);
                await clientDb.query(`UPDATE player_fleet SET owner_id = $1, statut = 'ACTIF' WHERE id = $2`, [auc.highest_bidder_id, auc.fleet_id]);
            } else {
                await clientDb.query(`UPDATE player_fleet SET statut = 'ACTIF' WHERE id = $1`, [auc.fleet_id]);
            }
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

        // A. CYCLE MARCHÉ & PRIX CLIENTS DYNAMIQUES (TOUTES LES 4 HEURES)
        const heuresCycle = Math.max(1, cfg.cycleMarcheHeures || 4);
        const msCycle = heuresCycle * 3600 * 1000;
        const baseTickMarche = new Date(mkt.last_market_tick).getTime();
        const tempsEcouleMarche = Date.now() - baseTickMarche;

        const resCountClients = await client.query('SELECT COUNT(*) FROM market_clients');
        const aucunClient = parseInt(resCountClients.rows.at(0).count) === 0;

        if (tempsEcouleMarche >= msCycle || aucunClient) {
            const dyn = await calculerDynamiqueMarche4h(client, coursOr, cfg);
            coursOr = dyn.nouveauCours;

            const heureLabel = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
            historique.push({ label: heureLabel, cours: coursOr });
            if (historique.length > 24) historique.shift();

            await genererClientsMarche(client, coursOr, cfg, dyn.multDemande);

            const cyclesPasses = Math.max(1, Math.floor(tempsEcouleMarche / msCycle));
            const nouveauTickMarche = tempsEcouleMarche >= msCycle
                ? new Date(baseTickMarche + cyclesPasses * msCycle)
                : new Date();

            await client.query(
                `UPDATE market_state SET cours_or = $1, historique_cours = $2, last_market_tick = $3 WHERE id = 1`,
                [coursOr, JSON.stringify(historique), nouveauTickMarche]
            );
        }

        // B. EXTRACTION HORAIRE EN DIRECT (TOUTES LES HEURES PILES)
        const msHeure = 3600 * 1000;
        const baseTickHeure = new Date(mkt.last_hourly_tick || mkt.last_market_tick).getTime();
        const tempsEcouleHeure = Date.now() - baseTickHeure;

        if (tempsEcouleHeure >= msHeure) {
            const heuresEcoulees = Math.min(24, Math.floor(tempsEcouleHeure / msHeure));

            const resMines = await client.query(`
                SELECT m.*, u.username FROM mines m
                JOIN users u ON u.id = m.user_id
                WHERE u.is_banned = FALSE
                FOR UPDATE OF m
            `);

            for (const mine of resMines.rows) {
                const parcelles = mine.parcelles;
                const cadence = parseFloat(mine.cadence) || 1.0;

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

                const totalFleetRes = await client.query(`SELECT COUNT(*) FROM player_fleet WHERE owner_id = $1`, [mine.user_id]);
                const nbTotalPossedes = parseInt(totalFleetRes.rows.at(0).count) || 0;

                const fleetRes = await client.query(`SELECT * FROM player_fleet WHERE owner_id = $1 AND statut = 'ACTIF' FOR UPDATE`, [mine.user_id]);
                const rentalsRes = await client.query(`SELECT * FROM active_rentals WHERE renter_id = $1 AND statut = 'EN_COURS' FOR UPDATE`, [mine.user_id]);

                const nbEnginsActifs = fleetRes.rows.length + rentalsRes.rows.length;

                const tousEngins = [
                    ...fleetRes.rows.map(f => ({ ...f, _kind: 'FLEET' })),
                    ...rentalsRes.rows.map(r => ({ ...r, _kind: 'RENTAL' }))
                ].sort((a, b) => (parseFloat(b.vitesse_reglee_th) || 3) - (parseFloat(a.vitesse_reglee_th) || 3));

                const estInstallationFixe = (cat) => {
                    const c = (cat || '').toLowerCase();
                    return c.includes('trém') || c.includes('trem') || c.includes('convoy') || c.includes('traitement') || c.includes('lavage');
                };

                const nbEnginsRoulants = tousEngins.filter(e => !estInstallationFixe(e.categorie)).length;
                const nbInstallationsFixes = tousEngins.filter(e => estInstallationFixe(e.categorie)).length;

                // Mécaniciens : 1 par installation fixe + 1 pour 3 engins roulants
                const mecaFixesRequis = nbInstallationsFixes;
                const mecaAtelierRequis = nbEnginsRoulants > 0 ? Math.ceil(nbEnginsRoulants / (cfg.enginsParMecano || 3)) : 0;
                const mecaRequis = mecaFixesRequis + mecaAtelierRequis;

                const multUsureMecano = mecaniciens < mecaRequis ? (cfg.usureSansMecanoMult || 1.5) : 1.0;
                const multUsureCadre = hasMaintenance ? 0.75 : 1.0;

                const totalOuvriers = conducteurs + mecaniciens;
                const chefsRequis = totalOuvriers > 0 ? Math.ceil(totalOuvriers / (cfg.ouvriersParChef || 8)) : 0;
                const multProdChef = chefsEquipe < chefsRequis ? (1 - (cfg.malusManqueChefPct || 0.20)) : 1.0;

                const debitsSecteur = {};
                let conducteursDispo = conducteurs;
                let mecaniciensFixesDispo = mecaniciens;
                const reqParEnginDefaut = parseInt(cfg.conducteursRequisParEngin) || 2;

                let coutCarburantHoraire = 0;
                let coutLoyersHoraire = 0;
                let pannesCount = 0;
                let sommeUsure = 0;

                for (const item of tousEngins) {
                    const catLower = (item.categorie || '').toLowerCase();
                    const isFixe = estInstallationFixe(item.categorie);

                    let ratioHoraire = 0;
                    if (isFixe) {
                        // 1 mécanicien requis par installation fixe (Trémie, Convoyeur, Traitement, Lavage)
                        if (mecaniciensFixesDispo >= 1) {
                            mecaniciensFixesDispo -= 1;
                            ratioHoraire = 1;
                        }
                    } else {
                        // 2 conducteurs requis par engin roulant (Excavation, Transport, Chargement)
                        const affectes = Math.min(reqParEnginDefaut, conducteursDispo);
                        conducteursDispo -= affectes;
                        ratioHoraire = affectes / reqParEnginDefaut;
                    }

                    const vReglee = parseFloat(item.vitesse_reglee_th) || 3;
                    const vMax = parseFloat(item.vitesse_max_th) || 5;
                    const ratioVitesse = Math.max(0.1, vReglee / vMax);

                    if (item._kind === 'FLEET') {
                        const usureHoraireBase = (parseFloat(item.usure_jour) / 24) * heuresEcoulees;
                        const usureGagnee = usureHoraireBase * Math.pow(ratioVitesse, 1.6) * cadence * ratioHoraire * multUsureMecano * multUsureCadre;
                        const usureEngin = Math.min(100, parseFloat(item.usure_actuelle) + usureGagnee);

                        const panne = ratioHoraire > 0 && ((Math.random() * 100 * (24 / heuresEcoulees)) < usureEngin);

                        if (ratioHoraire > 0) {
                            coutCarburantHoraire += ((parseFloat(item.carburant_jour) / 24) * ratioVitesse * ratioHoraire) * heuresEcoulees;
                        }

                        if (panne) {
                            pannesCount += 1;
                            await client.query(`UPDATE player_fleet SET usure_actuelle = 100, statut = 'EN_PANNE' WHERE id = $1`, [item.id]);
                            sommeUsure += 100;
                        } else {
                            const sIdx = parseInt(item.parcelle_index) || 0;
                            if (!debitsSecteur[sIdx]) debitsSecteur[sIdx] = { Decapage: 0, Excavation: 0, Transport: 0, Chargement: 0, Tremie: 0, Convoyeur: 0, Traitement: 0, Lavage: 0 };
                            const debitEffectif = vReglee * ratioHoraire * cadence * heuresEcoulees;
                            if (catLower.includes('décap') || catLower.includes('decap')) debitsSecteur[sIdx].Decapage += debitEffectif;
                            else if (catLower.includes('transport')) debitsSecteur[sIdx].Transport += debitEffectif;
                            else if (catLower.includes('charg')) debitsSecteur[sIdx].Chargement += debitEffectif;
                            else if (catLower.includes('trém') || catLower.includes('trem')) debitsSecteur[sIdx].Tremie += debitEffectif;
                            else if (catLower.includes('convoy')) debitsSecteur[sIdx].Convoyeur += debitEffectif;
                            else if (catLower.includes('traitement')) debitsSecteur[sIdx].Traitement += debitEffectif;
                            else if (catLower.includes('lavage')) debitsSecteur[sIdx].Lavage += debitEffectif;
                            else debitsSecteur[sIdx].Excavation += debitEffectif;

                            sommeUsure += usureEngin;
                            await client.query('UPDATE player_fleet SET usure_actuelle = $1 WHERE id = $2', [usureEngin, item.id]);
                        }
                    } else {
                        const loyerHeure = (parseFloat(item.loyer_jour) / 24) * heuresEcoulees;
                        coutLoyersHoraire += loyerHeure;

                        if (ratioHoraire > 0) {
                            coutCarburantHoraire += ((parseFloat(item.carburant_jour) / 24) * ratioVitesse * ratioHoraire) * heuresEcoulees;
                            const sIdx = parseInt(item.parcelle_index) || 0;
                            if (!debitsSecteur[sIdx]) debitsSecteur[sIdx] = { Decapage: 0, Excavation: 0, Transport: 0, Chargement: 0, Tremie: 0, Convoyeur: 0, Traitement: 0, Lavage: 0 };
                            const debitEffectif = vReglee * ratioHoraire * cadence * heuresEcoulees;
                            if (catLower.includes('décap') || catLower.includes('decap')) debitsSecteur[sIdx].Decapage += debitEffectif;
                            else if (catLower.includes('transport')) debitsSecteur[sIdx].Transport += debitEffectif;
                            else if (catLower.includes('charg')) debitsSecteur[sIdx].Chargement += debitEffectif;
                            else if (catLower.includes('trém') || catLower.includes('trem')) debitsSecteur[sIdx].Tremie += debitEffectif;
                            else if (catLower.includes('convoy')) debitsSecteur[sIdx].Convoyeur += debitEffectif;
                            else if (catLower.includes('traitement')) debitsSecteur[sIdx].Traitement += debitEffectif;
                            else if (catLower.includes('lavage')) debitsSecteur[sIdx].Lavage += debitEffectif;
                            else debitsSecteur[sIdx].Excavation += debitEffectif;
                        }


                        if (item.source_type === 'PDG' && item.owner_id) {
                            const netProprio = +(loyerHeure * (1 - cfg.commissionLocationPdgPct)).toFixed(2);
                            await client.query('UPDATE mines SET argent = argent + $1 WHERE user_id = $2', [netProprio, item.owner_id]);
                            if (item.fleet_id && ratioHoraire > 0) {
                                const mult = cfg.usureLocataireMultiplicateur * multUsureMecano * multUsureCadre;
                                const usureLoc = ((parseFloat(item.usure_jour) / 24) * heuresEcoulees) * Math.pow(ratioVitesse, 1.6) * mult * ratioHoraire;
                                await client.query(
                                    'UPDATE player_fleet SET usure_actuelle = LEAST(100, usure_actuelle + $1) WHERE id = $2',
                                    [usureLoc, item.fleet_id]
                                );
                            }
                        }

                        if (new Date(item.created_at).getTime() + (parseInt(item.jours_restants) * 24 * 3600 * 1000) <= Date.now()) {
                            if (item.source_type === 'PDG' && item.fleet_id) {
                                await client.query(`UPDATE player_fleet SET statut = 'ACTIF' WHERE id = $1`, [item.fleet_id]);
                            }
                            await client.query('DELETE FROM active_rentals WHERE id = $1', [item.id]);
                        }
                    }
                }

                // 3. Chaîne en 6 étapes dans l'ordre minier : Excavation -> Transport -> Chargement -> Convoyage -> Traitement -> Lavage
                let orProduitTotal = 0;
                let rocheExtraiteTotale = 0;

                let multOr = 1.0;
                if (hasMetallurgiste) multOr += 0.10;
                if (trombinoscopeComplet) multOr += (cfg.bonusTrombinoscopeCompletPct || 0.15);

                for (let idx = 0; idx < parcelles.length; idx++) {
                    const p = parcelles.at(idx);
                    if (!p || !p.estSondee || p.reserveReelle <= 0) continue;

                    const d = debitsSecteur[idx] || { Decapage: 0, Excavation: 0, Transport: 0, Chargement: 0, Tremie: 0, Convoyeur: 0, Traitement: 0, Lavage: 0 };

                    // PHASE 1 : DÉCAPAGE DES TERRES STÉRILES (Bulldozer + Excavatrice + Camion benne)
                    if (p.estDecapee === false && (parseFloat(p.sterilesRestants) || 0) > 0) {
                        const debitDecapage = Math.min(d.Decapage, d.Excavation, d.Transport) * multProdChef;
                        if (debitDecapage > 0) {
                            const sterilesEvacues = Math.min(parseFloat(p.sterilesRestants), debitDecapage);
                            p.sterilesRestants = Math.max(0, +(parseFloat(p.sterilesRestants) - sterilesEvacues).toFixed(1));
                            if (p.sterilesRestants <= 0) {
                                p.estDecapee = true;
                            }
                        }
                        continue; // Pas d'extraction d'or tant que le décapage n'est pas terminé
                    }

                    // PHASE 2 : EXTRACTION D'OR (Chaîne 7 étapes : Excavation -> Transport -> Chargement -> Trémie -> Convoyeur -> Traitement -> Lavage)
                    const debitAmont = Math.min(d.Excavation, d.Transport, d.Chargement, d.Tremie, d.Convoyeur);
                    const debitTraitement = Math.min(debitAmont, d.Traitement);
                    const debitChaine = Math.min(debitTraitement, d.Lavage);

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
                    [stockOr, moral, usureMoyenne, nbTotalPossedes, marketingPoints, JSON.stringify(parcelles), pendingEvent ? JSON.stringify(pendingEvent) : null, fraisSemaine, mine.user_id]
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

            const nouveauTickHeure = new Date(baseTickHeure + heuresEcoulees * msHeure);
            await client.query(`UPDATE market_state SET last_hourly_tick = $1 WHERE id = 1`, [nouveauTickHeure]);
        }

        // C. FACTURE HEBDOMADAIRE (1 FOIS PAR SEMAINE = 7 JOURS)
        const msSemaine = 7 * 24 * 3600 * 1000;
        const baseTickSemaine = new Date(mkt.last_weekly_tick || mkt.last_hourly_tick).getTime();
        const tempsEcouleSemaine = Date.now() - baseTickSemaine;

        if (tempsEcouleSemaine >= msSemaine) {
            const resMinesWeek = await client.query(`
                SELECT m.user_id, m.jour, m.frais_semaine_accumules, m.facture_en_attente, u.username
                FROM mines m JOIN users u ON u.id = m.user_id
                WHERE u.is_banned = FALSE
                FOR UPDATE OF m
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
