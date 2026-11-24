const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { getGameConfig, calculerProfondeurSecteur } = require('../config/gameConfig');
const { synchroniserHorlogeServeur } = require('../utils/gameEngine');

function getSessionUserId(req) {
    if (!req.session) return null;
    if (req.session.userId) return req.session.userId;
    if (req.session.user && req.session.user.id) return req.session.user.id;
    return null;
}

function requireAuth(req, res, next) {
    const uid = getSessionUserId(req);
    if (!uid) {
        return res.status(401).json({ error: 'Non connecté' });
    }
    req.session.userId = uid;
    next();
}

async function logJoueur(userId, username, category, details) {
    await pool.query(
        'INSERT INTO player_logs (user_id, username, category, details) VALUES ($1, $2, $3, $4)',
        [userId, username, category, details]
    );
}

// 1. ÉTAT COMPLET DU JEU, DU MARCHÉ, DES CLIENTS ET DU MARKETING COMPARATIF
router.get('/state', requireAuth, async (req, res) => {
    try {
        await synchroniserHorlogeServeur();
        const cfg = getGameConfig();

        const userRes = await pool.query('SELECT id, username, role FROM users WHERE id = $1', [req.session.userId]);
        const mineRes = await pool.query('SELECT * FROM mines WHERE user_id = $1', [req.session.userId]);
        const mktRes = await pool.query('SELECT * FROM market_state WHERE id = 1');
        const clientsRes = await pool.query('SELECT * FROM market_clients ORDER BY id ASC');
        const logsRes = await pool.query(
            'SELECT details, category, created_at FROM player_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 25',
            [req.session.userId]
        );

        const rankMktRes = await pool.query(`
            SELECT COALESCE(AVG(marketing_points), 10) AS moy_mkt, COALESCE(MAX(marketing_points), 10) AS max_mkt
            FROM mines
        `);
        const mine = mineRes.rows.at(0);
        const mkt = mktRes.rows.at(0);
        const moyMkt = parseFloat(rankMktRes.rows.at(0).moy_mkt) || 10;
        const maxMkt = parseFloat(rankMktRes.rows.at(0).max_mkt) || 10;
        const myMkt = parseFloat(mine.marketing_points) || 10;

        const ratioMarketing = +(myMkt / moyMkt).toFixed(2);
        const etudeDebloquee = myMkt >= (cfg.seuilEtudeMarche || 25);

        const clients = clientsRes.rows.map(c => ({
            id: c.id,
            nom: c.nom,
            type_client: c.type_client,
            secteur: c.secteur,
            demande_grammes: parseFloat(c.demande_grammes),
            prix_base_gramme: parseFloat(c.prix_base_gramme),
            expires_at: c.expires_at,
            marge_acceptee_max: etudeDebloquee ? parseFloat(c.marge_acceptee_max) : null
        }));

        const totalFleetCountRes = await pool.query('SELECT COUNT(*) FROM player_fleet WHERE owner_id = $1', [req.session.userId]);
        const nbTotalEngins = parseInt(totalFleetCountRes.rows.at(0).count) || 0;

        const fleetSectorRes = await pool.query(`SELECT * FROM player_fleet WHERE owner_id = $1 AND statut = 'ACTIF' ORDER BY id ASC`, [req.session.userId]);
        const rentalsSectorRes = await pool.query(`SELECT * FROM active_rentals WHERE renter_id = $1 AND statut = 'EN_COURS' ORDER BY id ASC`, [req.session.userId]);
        const prodAujRes = await pool.query(`
            SELECT details FROM player_logs
            WHERE user_id = $1
              AND category = 'MINE'
              AND details LIKE '%Extraction horaire%'
              AND created_at >= CURRENT_DATE
        `, [req.session.userId]);

        let orAujourdhui = 0;
        for (const r of prodAujRes.rows) {
            const m = r.details.match(/\+(\d+(?:\.\d+)?)g d'or/i);
            if (m) orAujourdhui += parseFloat(m.at(1)) || 0;
        }
        orAujourdhui = +orAujourdhui.toFixed(2);

         let forageTermineMaj = false;
        const parcellesNormalisees = (mine.parcelles || []).map((p, idx) => {
            const prof = parseInt(p.profondeurMetres) || calculerProfondeurSecteur(idx);
            if (!p.estSondee && p.enCoursForage && p.forageFinAt && Date.now() >= Number(p.forageFinAt)) {
                forageTermineMaj = true;
                const erreur = (Math.random() * 0.4) - 0.2;
                const estPurete = Math.max(1, +(p.pureteReelle * (1 + erreur)).toFixed(1));
                return {
                    ...p,
                    profondeurMetres: prof,
                    estSondee: true,
                    enCoursForage: false,
                    forageFinAt: null,
                    forageTotalMs: null,
                    estOuverte: false,
                    estDecapee: false,
                    estimationPurete: estPurete
                };
            }
            return {
                ...p,
                profondeurMetres: prof,
                estOuverte: p.estOuverte !== undefined ? p.estOuverte : (idx === 0 || idx === mine.parcelle_active)
            };
        });

        if (forageTermineMaj) {
            await pool.query('UPDATE mines SET parcelles = $1 WHERE user_id = $2', [JSON.stringify(parcellesNormalisees), req.session.userId]);
            const uName = userRes.rows.at(0)?.username || 'PDG';
            for (let i = 0; i < parcellesNormalisees.length; i++) {
                const av = (mine.parcelles || []).at(i);
                const ap = parcellesNormalisees.at(i);
                if (av && av.enCoursForage && ap.estSondee) {
                    await logJoueur(req.session.userId, uName, 'MINE', `🛢️ Carottage terminé sur ${ap.nom} (${ap.profondeurMetres} m) : teneur estimée ~${ap.estimationPurete} g/t !`);
                }
            }
        }

        const ordersRes = await pool.query(
            `SELECT * FROM market_sell_orders WHERE user_id = $1 AND statut = 'EN_ATTENTE' ORDER BY id ASC`,
            [req.session.userId]
        );

        res.json({
            user: userRes.rows.at(0),
            config: cfg,
            fleet: fleetSectorRes.rows,
            rentals: rentalsSectorRes.rows,
            mine: {
                jour: mine.jour,
                argent: parseFloat(mine.argent),
                stockOr: parseFloat(mine.stock_or),
                mineurs: mine.mineurs,
                conducteurs: parseInt(mine.conducteurs) || 0,
                mecaniciens: parseInt(mine.mecaniciens) || 0,
                chefsEquipe: parseInt(mine.chefs_equipe) || 0,
                cadres: Array.isArray(mine.cadres) ? mine.cadres : [],
                foreuses: nbTotalEngins,
                moral: parseFloat(mine.moral),
                usure: parseFloat(mine.usure),
                cadence: parseFloat(mine.cadence),
                marketingPoints: parseFloat(mine.marketing_points),
                parcelleActive: mine.parcelle_active,
                parcelles: parcellesNormalisees,
                pendingEvent: mine.pending_event,
                pendingOrders: ordersRes.rows,
                tutorialStep: mine.tutorial_step || 1,
                fraisSemaine: parseFloat(mine.frais_semaine_accumules) || 0,
                factureEnAttente: parseFloat(mine.facture_en_attente) || 0,
                orAujourdhui
            },
            market: {
                coursOr: parseFloat(mkt.cours_or),
                historique: mkt.historique_cours,
                lastMarketTick: mkt.last_market_tick,
                moyenneMarketingSecteur: +moyMkt.toFixed(1),
                leaderMarketingSecteur: +maxMkt.toFixed(1),
                ratioMarketing,
                etudeDebloquee,
                clients
            },
            logs: logsRes.rows
        });
    } catch (err) {
        console.error('Erreur GET /state :', err);
        res.status(500).json({ error: 'Erreur chargement partie' });
    }
});

// 2. ACTIONS DE GESTION DE LA MINE (AVEC VERROU SQL FOR UPDATE)
router.post('/action', requireAuth, async (req, res) => {
    const { type, payload } = req.body;
    const cfg = getGameConfig();
    const userId = req.session.userId;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const mineRes = await client.query('SELECT * FROM mines WHERE user_id = $1 FOR UPDATE', [userId]);
        const userRes = await client.query('SELECT username FROM users WHERE id = $1', [userId]);
        const mine = mineRes.rows.at(0);
        const username = userRes.rows.at(0).username;

        let argent = parseFloat(mine.argent);
        let mineurs = mine.mineurs;
        let usure = parseFloat(mine.usure);
        let moral = parseFloat(mine.moral);
        let cadence = parseFloat(mine.cadence);
        let marketingPoints = parseFloat(mine.marketing_points);
        let parcelleActive = mine.parcelle_active;
        let parcelles = mine.parcelles;
        let factureAttente = parseFloat(mine.facture_en_attente) || 0;
        let message = '';

        if (type === 'embaucher') {
            if (mineurs >= 10) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Plafond atteint : maximum 10 orpailleurs manuels (passez aux engins industriels !).' });
            }
            if (argent < cfg.coutMineur) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Trésorerie insuffisante' });
            }
            argent -= cfg.coutMineur;
            mineurs += 1;
            message = `Recrutement d'un orpailleur artisanal (${mineurs}/10) (-${cfg.coutMineur} €).`;
        } else if (type === 'reparer') {
            if (argent < cfg.coutRevision) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Trésorerie insuffisante' });
            }
            argent -= cfg.coutRevision;
            usure = Math.max(0, usure - 25);
            message = `Révision atelier effectuée (-25% usure / -${cfg.coutRevision} €).`;
        } else if (type === 'prime') {
            if (argent < cfg.coutPrime) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Trésorerie insuffisante' });
            }
            argent -= cfg.coutPrime;
            moral = Math.min(100, moral + 15);
            message = `Prime versée aux équipes (+15% moral / -${cfg.coutPrime} €).`;
        } else if (type === 'cadence') {
            const val = parseFloat(payload);
            if (isNaN(val) || val < 0.5 || val > 1.5) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Cadence invalide' });
            }
            cadence = val;
            message = `Cadence du chantier réglée sur ${Math.round(val * 100)}%.`;
        } else if (type === 'marketing') {
            if (argent < cfg.coutUniteMarketing) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Trésorerie insuffisante' });
            }
            argent -= cfg.coutUniteMarketing;
            marketingPoints += 10;
            message = `Campagne marketing lancée (+10 pts notoriété / -${cfg.coutUniteMarketing} €).`;
        } else if (type === 'parcelle') {
            const id = parseInt(payload);
            const p = parcelles.at(id);
            if (!p) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Parcelle invalide' });
            }

            if (!p.estSondee) {
                const profondeur = parseInt(p.profondeurMetres) || calculerProfondeurSecteur(id);
                const maxPetit = parseFloat(cfg.profondeurMaxForagePetit) || 20;
                const maxMoyen = parseFloat(cfg.profondeurMaxForageMoyen) || 40;
                const maxGeant = parseFloat(cfg.profondeurMaxForageGeant) || 60;

                const foreusesRes = await client.query(
                    `SELECT gabarit FROM player_fleet WHERE owner_id = $1 AND statut = 'ACTIF' AND LOWER(categorie) LIKE '%forage%'
                     UNION ALL
                     SELECT c.gabarit FROM active_rentals r JOIN equipment_catalog c ON c.id = r.catalog_id WHERE r.renter_id = $1 AND r.statut = 'EN_COURS' AND LOWER(r.categorie) LIKE '%forage%'`,
                    [userId]
                );

                let capaciteForageMax = 0;
                for (const f of foreusesRes.rows) {
                    const g = (f.gabarit || 'Petit').toLowerCase();
                    if (g.includes('g')) capaciteForageMax = Math.max(capaciteForageMax, maxGeant);
                    else if (g === 'moyen') capaciteForageMax = Math.max(capaciteForageMax, maxMoyen);
                    else capaciteForageMax = Math.max(capaciteForageMax, maxPetit);
                }

                if (capaciteForageMax < profondeur) {
                    const gabRequis = profondeur <= maxPetit
                        ? `Petit (jusqu'à ${maxPetit}m)`
                        : profondeur <= maxMoyen
                        ? `Moyen (jusqu'à ${maxMoyen}m)`
                        : `Géant (jusqu'à ${maxGeant}m)`;
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        error: `Foreuse insuffisante pour ${p.nom} (${profondeur} m de profondeur) ! Il faut une foreuse de gabarit ${gabRequis} en service.`
                    });
                }

                if (p.enCoursForage && p.forageFinAt && Date.now() < Number(p.forageFinAt)) {
                    const minsRest = Math.max(1, Math.ceil((Number(p.forageFinAt) - Date.now()) / 60000));
                    const hR = Math.floor(minsRest / 60);
                    const mR = minsRest % 60;
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: `Forage déjà en cours sur ${p.nom} (fin dans ${hR}h${String(mR).padStart(2, '0')}).` });
                }

                const hasGeologue = Array.isArray(mine.cadres) && mine.cadres.includes('GEOLOGUE');
                const coutCarottageReel = hasGeologue ? Math.round(cfg.coutCarottage * 0.7) : cfg.coutCarottage;
                if (argent < coutCarottageReel) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: 'Trésorerie insuffisante' });
                }

                const vitesseForage = Math.max(0.5, parseFloat(cfg.vitesseForageMetresHeure) || 5);
                let dureeHeures = Math.max(1, Math.ceil(profondeur / vitesseForage));
                if (hasGeologue) dureeHeures = Math.max(1, Math.ceil(dureeHeures * 0.7));
                const dureeMs = dureeHeures * 3600 * 1000;

                argent -= coutCarottageReel;
                p.profondeurMetres = profondeur;
                p.estSondee = false;
                p.enCoursForage = true;
                p.forageTotalMs = dureeMs;
                p.forageFinAt = Date.now() + dureeMs;
                p.estOuverte = false;
                p.estDecapee = false;

                message = `🛢️ Forage lancé sur ${p.nom} (${profondeur} m) : durée estimée ${dureeHeures}h (-${coutCarottageReel} €).`;
            } else if (!p.estOuverte && id !== 0 && id !== parcelleActive) {
                const maxActives = parseInt(cfg.maxConcessionsActives) || 5;
                const nbOuvertes = parcelles.filter((sec, sIdx) =>
                    (sec.estOuverte || sIdx === 0 || sIdx === parcelleActive) && (parseFloat(sec.reserveReelle) || 0) > 0
                ).length;

                if (nbOuvertes >= maxActives) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: `Limite atteinte : maximum ${maxActives} concessions ouvertes simultanément (épuisez d'abord une fosse active).` });
                }

                const mktRes = await client.query('SELECT cours_or FROM market_state WHERE id = 1');
                const coursOr = mktRes.rows.length > 0 ? parseFloat(mktRes.rows.at(0).cours_or) : parseFloat(cfg.coursOrInitial);
                const tauxOuverture = parseFloat(cfg.tauxOuvertureFossePct) || 0.30;
                const valeurOrEstimee = (parseFloat(p.reserveReelle) || 0) * (parseFloat(p.pureteReelle) || 0) * coursOr;
                const coutOuverture = Math.round(valeurOrEstimee * tauxOuverture);

                if (argent < coutOuverture) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: `Trésorerie insuffisante pour ouvrir la fosse (${coutOuverture.toLocaleString()} € requis = ${Math.round(tauxOuverture * 100)}% de la valeur en or).` });
                }

                argent -= coutOuverture;
                p.estOuverte = true;
                p.estDecapee = false;
                const ratioSteriles = parseFloat(cfg.ratioSterilesDecapage) || 0.15;
                p.sterilesTotal = Math.max(50, Math.round((parseFloat(p.reserveReelle) || 1000) * ratioSteriles));
                p.sterilesRestants = p.sterilesTotal;

                message = `⛏️ Fosse ouverte sur ${p.nom} (-${coutOuverture.toLocaleString()} €) ! Décapage requis : ${p.sterilesTotal} t de terres stériles (Bulldozer + Excavatrice + Camion benne).`;
            } else {
                if (id === parcelleActive) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: 'Les orpailleurs manuels travaillent déjà sur cette concession.' });
                }
                if (p.estDecapee === false && (parseFloat(p.sterilesRestants) || 0) > 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: `Décapage inachevé sur ${p.nom} (${Math.round(p.sterilesRestants)} t de stériles restantes) !` });
                }
                parcelleActive = id;
                message = `Équipe d'orpaillage manuel affectée sur ${p.nom} (teneur réelle : ${p.pureteReelle} g/t).`;
            }

        } else if (type === 'payer_facture') {
            if (factureAttente <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Aucune facture en attente de paiement.' });
            }
            if (argent < factureAttente) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Trésorerie insuffisante pour régler la facture.' });
            }
            argent -= factureAttente;
            message = `🧾 Facture hebdomadaire réglée (-${Math.round(factureAttente).toLocaleString()} €).`;
            factureAttente = 0;
        } else {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Action inconnue' });
        }

        await client.query(
            `UPDATE mines SET argent = $1, mineurs = $2, usure = $3, moral = $4,
             cadence = $5, marketing_points = $6, parcelle_active = $7, parcelles = $8,
             facture_en_attente = $9, updated_at = NOW()
             WHERE user_id = $10`,
            [argent, mineurs, usure, moral, cadence, marketingPoints, parcelleActive, JSON.stringify(parcelles), factureAttente, userId]
        );

        await client.query(
            'INSERT INTO player_logs (user_id, username, category, details) VALUES ($1, $2, $3, $4)',
            [userId, username, type === 'payer_facture' ? 'FINANCE' : (type === 'marketing' ? 'MARKETING' : 'MINE'), message]
        );

        await client.query('COMMIT');
        res.json({ success: true, message });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erreur POST /action :', err);
        res.status(500).json({ error: 'Erreur serveur action' });
    } finally {
        client.release();
    }
});

// 3. NÉGOCIATION & VENTE À UN CLIENT DU MARCHÉ
router.post('/sell-client', requireAuth, async (req, res) => {
    const { clientId, quantiteGrammes, margeDemandee } = req.body;
    const cfg = getGameConfig();
    const userId = req.session.userId;

    const margeMax = parseFloat(cfg.margeNegociationMax) || 0.15;
    const marge = Math.max(-margeMax, Math.min(margeMax, parseFloat(margeDemandee) || 0));
    const qte = Math.floor(parseFloat(quantiteGrammes) || 0);

    if (qte <= 0) return res.status(400).json({ error: 'Quantité invalide (minimum 1 g).' });

    const clientDb = await pool.connect();
    try {
        await clientDb.query('BEGIN');

        const mineRes = await clientDb.query('SELECT * FROM mines WHERE user_id = $1 FOR UPDATE', [userId]);
        const userRes = await clientDb.query('SELECT username FROM users WHERE id = $1', [userId]);
        const achRes = await clientDb.query('SELECT * FROM market_clients WHERE id = $1 FOR UPDATE', [clientId]);

        if (achRes.rows.length === 0) {
            await clientDb.query('ROLLBACK');
            return res.status(404).json({ error: 'Ce client n’est plus disponible sur le marché.' });
        }

        const mine = mineRes.rows.at(0);
        const acheteur = achRes.rows.at(0);
        const username = userRes.rows.at(0).username;
        const stockOr = parseFloat(mine.stock_or) || 0;
        const demande = parseFloat(acheteur.demande_grammes) || 0;

        if (qte > stockOr) {
            await clientDb.query('ROLLBACK');
            return res.status(400).json({ error: 'Stock d’or insuffisant dans votre coffre.' });
        }
        if (qte > demande) {
            await clientDb.query('ROLLBACK');
            return res.status(400).json({ error: `Ce client ne demande que ${demande} g maximum.` });
        }

        const dejaOffertRes = await clientDb.query(
            `SELECT COALESCE(SUM(quantite_grammes), 0) AS total FROM market_sell_orders WHERE user_id = $1 AND client_id = $2 AND statut = 'EN_ATTENTE'`,
            [userId, clientId]
        );
        const dejaOffert = parseFloat(dejaOffertRes.rows.at(0).total) || 0;
        if ((dejaOffert + qte) > demande) {
            await clientDb.query('ROLLBACK');
            return res.status(400).json({ error: `Vous avez déjà ${dejaOffert} g en attente pour ce client (limite max : ${demande} g).` });
        }

        const prixUnitaire = +(parseFloat(acheteur.prix_base_gramme) * (1 + marge)).toFixed(2);
        const newStock = +(stockOr - qte).toFixed(1);

        await clientDb.query('UPDATE mines SET stock_or = $1 WHERE user_id = $2', [newStock, userId]);
        await clientDb.query(
            `INSERT INTO market_sell_orders (user_id, client_id, client_nom, quantite_grammes, prix_unitaire, marge_demandee, statut)
             VALUES ($1, $2, $3, $4, $5, $6, 'EN_ATTENTE')`,
            [userId, clientId, acheteur.nom, qte, prixUnitaire, marge]
        );

        const detailLog = `📋 Offre de vente déposée pour ${acheteur.nom} : ${qte}g à ${prixUnitaire} €/g (${marge >= 0 ? '+' : ''}${Math.round(marge * 100)}%) — en attente de la clôture 4h.`;
        await clientDb.query(
            `INSERT INTO player_logs (user_id, username, category, details) VALUES ($1, $2, 'FINANCE', $3)`,
            [userId, username, detailLog]
        );

        await clientDb.query('COMMIT');
        res.json({ success: true, message: detailLog });
    } catch (err) {
        await clientDb.query('ROLLBACK');
        console.error('Erreur POST /sell-client :', err);
        res.status(500).json({ error: 'Erreur lors du dépôt de l’offre : ' + err.message });
    } finally {
        clientDb.release();
    }
});

router.post('/cancel-order', requireAuth, async (req, res) => {
    const { orderId } = req.body;
    const userId = req.session.userId;

    const clientDb = await pool.connect();
    try {
        await clientDb.query('BEGIN');
        await clientDb.query('SELECT user_id FROM mines WHERE user_id = $1 FOR UPDATE', [userId]);
        const userRes = await clientDb.query('SELECT username FROM users WHERE id = $1', [userId]);
        const ordRes = await clientDb.query(
            `SELECT * FROM market_sell_orders WHERE id = $1 AND user_id = $2 AND statut = 'EN_ATTENTE' FOR UPDATE`,
            [orderId, userId]
        );

        if (ordRes.rows.length === 0) {
            await clientDb.query('ROLLBACK');
            return res.status(404).json({ error: 'Offre introuvable ou déjà traitée.' });
        }

        const ord = ordRes.rows.at(0);
        const qte = parseFloat(ord.quantite_grammes) || 0;

        await clientDb.query('UPDATE mines SET stock_or = stock_or + $1 WHERE user_id = $2', [qte, userId]);
        await clientDb.query(`DELETE FROM market_sell_orders WHERE id = $1`, [orderId]);

        const msg = `↩️ Offre de vente annulée (${qte}g pour ${ord.client_nom}) : or restitué dans votre coffre.`;
        await clientDb.query(
            `INSERT INTO player_logs (user_id, username, category, details) VALUES ($1, $2, 'FINANCE', $3)`,
            [userId, userRes.rows.at(0).username, msg]
        );

        await clientDb.query('COMMIT');
        res.json({ success: true, message: msg });
    } catch (err) {
        await clientDb.query('ROLLBACK');
        res.status(500).json({ error: 'Erreur lors de l’annulation de l’offre' });
    } finally {
        clientDb.release();
    }
});


// 4. RÉSOUDRE UN ÉVÉNEMENT QUOTIDIEN EN ATTENTE
router.post('/event-choice', requireAuth, async (req, res) => {
    const { choiceId } = req.body;
    const userId = req.session.userId;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const mineRes = await client.query('SELECT * FROM mines WHERE user_id = $1 FOR UPDATE', [userId]);
        const userRes = await client.query('SELECT username FROM users WHERE id = $1', [userId]);
        const mine = mineRes.rows.at(0);
        const ev = mine.pending_event;

        if (!ev) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Aucun événement en attente' });
        }
        const choix = ev.choix.find(c => c.id === choiceId) || ev.choix.at(0);

        const argent = parseFloat(mine.argent) + (choix.effet.argent || 0);
        const moral = Math.max(0, Math.min(100, parseFloat(mine.moral) + (choix.effet.moral || 0)));
        const deltaUsure = parseFloat(choix.effet.usure) || 0;
        const usure = Math.max(0, Math.min(100, parseFloat(mine.usure) + deltaUsure));
        const stockOr = parseFloat(mine.stock_or) + (choix.effet.bonusOr || 0);

        if (deltaUsure !== 0) {
            await client.query(
                `UPDATE player_fleet SET usure_actuelle = GREATEST(0, LEAST(99, usure_actuelle + $1)) WHERE owner_id = $2 AND statut = 'ACTIF'`,
                [deltaUsure, userId]
            );
        }

        await client.query(
            `UPDATE mines SET argent = $1, moral = $2, usure = $3, stock_or = $4, pending_event = NULL WHERE user_id = $5`,
            [argent, moral, usure, stockOr, userId]
        );

        await client.query(
            'INSERT INTO player_logs (user_id, username, category, details) VALUES ($1, $2, $3, $4)',
            [userId, userRes.rows.at(0).username, 'MINE', `Événement [${ev.titre}] -> ${choix.texte}`]
        );

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Erreur résolution événement' });
    } finally {
        client.release();
    }
});


// 5. CLASSEMENT DES COMPAGNIES MINIÈRES
router.get('/ranking', requireAuth, async (req, res) => {
    try {
        const mktRes = await pool.query('SELECT cours_or FROM market_state WHERE id = 1');
        const coursActuel = mktRes.rows.length > 0 ? parseFloat(mktRes.rows.at(0).cours_or) : 60;

        const resRank = await pool.query(`
            SELECT u.username, m.jour, m.argent, m.stock_or,
                   (SELECT COUNT(*) FROM player_fleet f WHERE f.owner_id = u.id) AS foreuses,
                   m.marketing_points
            FROM mines m
            JOIN users u ON u.id = m.user_id
            WHERE u.is_banned = FALSE
            ORDER BY (m.argent + m.stock_or * $1) DESC
            LIMIT 15
        `, [coursActuel]);
        res.json(resRank.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur classement' });
    }
});

// 6. VALIDATION D'UNE ÉTAPE DU TUTORIEL & VERSEMENT DE LA RÉCOMPENSE
router.post('/claim-tutorial', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const cfg = getGameConfig();
    const primeBase = parseFloat(cfg.recompenseTutorielEtape);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const mineRes = await client.query('SELECT * FROM mines WHERE user_id = $1 FOR UPDATE', [userId]);
        const userRes = await client.query('SELECT username FROM users WHERE id = $1', [userId]);
        const mine = mineRes.rows.at(0);
        const step = parseInt(mine.tutorial_step) || 1;

        if (step > 5) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Vous avez déjà terminé toutes les missions du tutoriel !' });
        }

        let conditionRemplie = false;
        let nomMission = '';

        if (step === 1) {
            const nbSondees = mine.parcelles.filter(p => p.estSondee).length;
            conditionRemplie = nbSondees >= 2;
            nomMission = 'Prospection géologique (2 secteurs sondés)';
        } else if (step === 2) {
            conditionRemplie = parseInt(mine.mineurs) >= 6;
            nomMission = 'Recrutement d’équipe (6 mineurs actifs)';
        } else if (step === 3) {
            const fleetRes = await client.query('SELECT COUNT(*) FROM player_fleet WHERE owner_id = $1', [userId]);
            conditionRemplie = parseInt(fleetRes.rows.at(0).count) >= 2;
            nomMission = 'Équipement lourd (2 engins dans la flotte)';
        } else if (step === 4) {
            conditionRemplie = parseFloat(mine.marketing_points) >= 20;
            nomMission = 'Campagne commerciale (20 pts de notoriété)';
        } else if (step === 5) {
            const venteRes = await client.query(`SELECT COUNT(*) FROM player_logs WHERE user_id = $1 AND category = 'FINANCE' AND (details LIKE '💰 Vente%' OR details LIKE '📋 Offre de vente déposée%')`, [userId]);
            conditionRemplie = parseInt(venteRes.rows.at(0).count) >= 1;
            nomMission = 'Première offre de vente de lingots sur le marché';
        }

        if (!conditionRemplie) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Objectif de la mission non encore atteint !' });
        }

        const multiplicateurs = [1, 1, 1.5, 1.5, 2.5];
        const gain = Math.round(primeBase * (multiplicateurs.at(step - 1) || 1));

        await client.query(
            'UPDATE mines SET argent = argent + $1, tutorial_step = $2 WHERE user_id = $3',
            [gain, step + 1, userId]
        );

        const msg = `🎓 Tutoriel Étape ${step}/5 validée (${nomMission}) : +${gain.toLocaleString()} € !`;
        await client.query(
            `INSERT INTO player_logs (user_id, username, category, details) VALUES ($1, $2, 'TUTORIEL', $3)`,
            [userId, userRes.rows.at(0).username, msg]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: msg });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erreur claim-tutorial :', err);
        res.status(500).json({ error: 'Erreur lors de la validation du tutoriel' });
    } finally {
        client.release();
    }
});

module.exports = router;

