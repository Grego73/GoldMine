const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { getGameConfig } = require('../config/gameConfig');

function requireAuth(req, res, next) {
    const uid = req.session && (req.session.userId || (req.session.user && req.session.user.id));
    if (!uid) return res.status(401).json({ error: 'Non connecté' });
    req.session.userId = uid;
    next();
}

const FAMILLES_MATERIEL = ['Forage', 'Levage', 'Décapage', 'Excavation', 'Transport', 'Chargement', 'Trémie', 'Convoyeur', 'Traitement', 'Lavage'];

function calculerPrixPiece(cfg, categorie, gabarit) {
    const cat = (categorie || '').toLowerCase();
    let base = parseFloat(cfg.prixPieceExcavation) || 500;
    if (cat.includes('forag')) base = parseFloat(cfg.prixPieceForage) || 550;
    else if (cat.includes('levag') || cat.includes('grue')) base = parseFloat(cfg.prixPieceLevage) || 650;
    else if (cat.includes('décap') || cat.includes('decap')) base = parseFloat(cfg.prixPieceDecapage) || 650;
    else if (cat.includes('transport')) base = parseFloat(cfg.prixPieceTransport) || 600;
    else if (cat.includes('charg')) base = parseFloat(cfg.prixPieceChargement) || 550;
    else if (cat.includes('trém') || cat.includes('trem')) base = parseFloat(cfg.prixPieceTremie) || 450;
    else if (cat.includes('convoy')) base = parseFloat(cfg.prixPieceConvoyeur) || 500;
    else if (cat.includes('traitement')) base = parseFloat(cfg.prixPieceTraitement) || 800;
    else if (cat.includes('lavage')) base = parseFloat(cfg.prixPieceLavage) || 900;

    const gab = (gabarit || 'Moyen').toLowerCase();
    let coeff = parseFloat(cfg.coeffPieceMoyen) || 2;
    if (gab === 'petit') coeff = parseFloat(cfg.coeffPiecePetit) || 1;
    else if (gab.includes('g')) coeff = parseFloat(cfg.coeffPieceGeant) || 4;

    return Math.round(base * coeff);
}

function niveauGabarit(gabarit) {
    const g = (gabarit || 'Moyen').toLowerCase();
    if (g === 'petit') return 1;
    if (g.includes('g')) return 3;
    return 2;
}

async function verifierGrueMaintenance(clientDb, userId, engin) {
    const catLower = (engin.categorie || '').toLowerCase();
    if (catLower.includes('levag') || catLower.includes('grue')) {
        return { ok: true, nivRequis: 0, nivGrueMax: 3 };
    }

    const nivRequis = niveauGabarit(engin.gabarit);
    const gruesRes = await clientDb.query(
        `SELECT gabarit FROM player_fleet WHERE owner_id = $1 AND statut = 'ACTIF' AND LOWER(categorie) LIKE '%levag%'
         UNION ALL
         SELECT c.gabarit FROM active_rentals r JOIN equipment_catalog c ON c.id = r.catalog_id WHERE r.renter_id = $1 AND r.statut = 'EN_COURS' AND LOWER(r.categorie) LIKE '%levag%'`,
        [userId]
    );
    let nivGrueMax = 0;
    for (const g of gruesRes.rows) {
        nivGrueMax = Math.max(nivGrueMax, niveauGabarit(g.gabarit));
    }
    return { ok: nivGrueMax >= nivRequis, nivRequis, nivGrueMax };
}

// =========================================================================
// 1. ÉTAT COMPLET DU MATÉRIEL (Ma Flotte, Boutique, Brocante/Enchères, Location)
// =========================================================================
router.get('/', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    try {
        const cfg = getGameConfig();

        const myFleetRes = await pool.query('SELECT * FROM player_fleet WHERE owner_id = $1 ORDER BY id ASC', [userId]);
        await pool.query('UPDATE mines SET foreuses = $1 WHERE user_id = $2', [myFleetRes.rows.length, userId]);

        const catalogRes = await pool.query('SELECT * FROM equipment_catalog WHERE actif = TRUE ORDER BY prix_neuf ASC');

        // Annonces Brocante & Enchères en cours
        const auctionsRes = await pool.query(`
            SELECT a.*, f.nom, f.categorie, f.prod_tonnes, f.vitesse_min_th, f.vitesse_max_th, f.carburant_jour, f.usure_jour, f.usure_actuelle,
                   u.username AS seller_name, hb.username AS bidder_name
            FROM market_auctions a
            JOIN player_fleet f ON f.id = a.fleet_id
            JOIN users u ON u.id = a.seller_id
            LEFT JOIN users hb ON hb.id = a.highest_bidder_id
            WHERE a.expires_at > NOW()
            ORDER BY a.expires_at ASC
        `);

        // Offres de location disponibles entre PDG + Locations actives du joueur
        const offersRes = await pool.query(`
            SELECT r.*, u.username AS owner_name, f.usure_actuelle
            FROM active_rentals r
            JOIN users u ON u.id = r.owner_id
            LEFT JOIN player_fleet f ON f.id = r.fleet_id
            WHERE r.statut = 'DISPONIBLE'
            ORDER BY r.loyer_jour ASC
        `);

        const myRentalsRes = await pool.query(`
            SELECT r.*, u.username AS owner_name
            FROM active_rentals r
            LEFT JOIN users u ON u.id = r.owner_id
            WHERE r.renter_id = $1 AND r.statut = 'EN_COURS'
            ORDER BY r.id ASC
        `, [userId]);

        const mineInfoRes = await pool.query('SELECT pieces_stock FROM mines WHERE user_id = $1', [userId]);
        const piecesStock = mineInfoRes.rows.at(0)?.pieces_stock || {};

        const tarifsPieces = {};
        for (const fam of FAMILLES_MATERIEL) {
            tarifsPieces[fam] = {
                Petit: calculerPrixPiece(cfg, fam, 'Petit'),
                Moyen: calculerPrixPiece(cfg, fam, 'Moyen'),
                Géant: calculerPrixPiece(cfg, fam, 'Géant')
            };
        }

        res.json({
            piecesStock,
            tarifsPieces,
            coeffLoyerJeu: parseFloat(cfg.coeffLoyerJeu) || 0.08,
            myFleet: myFleetRes.rows,
            catalog: catalogRes.rows,
            auctions: auctionsRes.rows,
            rentalOffers: offersRes.rows,
            myActiveRentals: myRentalsRes.rows
        });
    } catch (err) {
        console.error('Erreur GET /api/equipment :', err);
        res.status(500).json({ error: 'Erreur chargement module matériel' });
    }
});

// =========================================================================
// 2. BOUTIQUE NEUF : ACHAT D'UN ENGIN GARANTI 0% USURE
// =========================================================================
router.post('/buy-new', requireAuth, async (req, res) => {
    const { catalogId } = req.body;
    const userId = req.session.userId;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const catRes = await client.query('SELECT * FROM equipment_catalog WHERE id = $1 AND actif = TRUE', [catalogId]);
        if (catRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Engin introuvable dans le catalogue.' });
        }
        const item = catRes.rows.at(0);
        const prix = parseFloat(item.prix_neuf);

        const mineRes = await client.query('SELECT argent FROM mines WHERE user_id = $1 FOR UPDATE', [userId]);
        const userRes = await client.query('SELECT username FROM users WHERE id = $1', [userId]);
        const argent = parseFloat(mineRes.rows.at(0).argent);

        if (argent < prix) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Trésorerie insuffisante pour cet achat.' });
        }

        await client.query('UPDATE mines SET argent = argent - $1, foreuses = foreuses + 1 WHERE user_id = $2', [prix, userId]);
        const vMin = parseFloat(item.vitesse_min_th) || 30;
        const vMax = parseFloat(item.vitesse_max_th) || 60;
        const vDefaut = Math.round((vMin + vMax) / 2);

        await client.query(
            `INSERT INTO player_fleet (owner_id, catalog_id, nom, categorie, gabarit, prod_tonnes, vitesse_min_th, vitesse_max_th, vitesse_reglee_th, carburant_jour, usure_jour, pieces_panne, usure_actuelle, parcelle_index, statut)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, 0, 'ACTIF')`,
            [userId, item.id, item.nom, item.categorie, item.gabarit || 'Moyen', item.prod_tonnes, vMin, vMax, vDefaut, item.carburant_jour, item.usure_jour, item.pieces_panne || 1]
        );

        const msg = `Achat neuf : ${item.nom} (-${prix.toLocaleString()} €)`;
        await client.query(
            `INSERT INTO player_logs (user_id, username, category, details) VALUES ($1, $2, 'MATERIEL', $3)`,
            [userId, userRes.rows.at(0).username, msg]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: msg });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erreur buy-new :', err);
        res.status(500).json({ error: 'Erreur lors de l’achat neuf' });
    } finally {
        client.release();
    }
});

// =========================================================================
// 3. BROCANTE & ENCHÈRES : METTRE UN ENGIN EN VENTE (DURÉE LIBRE JUSQU'À 7J)
// =========================================================================
router.post('/list-sale', requireAuth, async (req, res) => {
    const { fleetId, modeVente, prixDepart, dureeHeures } = req.body;
    const userId = req.session.userId;
    const cfg = getGameConfig();

    const maxHeures = parseInt(cfg.dureeMaxEnchereHeures) || 168;
    const heures = Math.max(1, Math.min(maxHeures, parseInt(dureeHeures) || parseInt(cfg.dureeEnchereDefautHeures) || 4));
    const prix = Math.max(100, Math.round(parseFloat(prixDepart) || 0));
    const mode = modeVente === 'BROCANTE' ? 'BROCANTE' : 'ENCHERE';

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const fleetRes = await client.query(
            'SELECT * FROM player_fleet WHERE id = $1 AND owner_id = $2 FOR UPDATE',
            [fleetId, userId]
        );
        if (fleetRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Engin introuvable dans votre flotte.' });
        }
        const engin = fleetRes.rows.at(0);
        if (engin.statut !== 'ACTIF') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cet engin est déjà en vente ou en location.' });
        }

        const expiresAt = new Date(Date.now() + heures * 3600 * 1000);
        await client.query(`UPDATE player_fleet SET statut = 'EN_VENTE' WHERE id = $1`, [fleetId]);
        await client.query(
            `INSERT INTO market_auctions (fleet_id, seller_id, mode_vente, prix_depart, prix_actuel, expires_at)
             VALUES ($1, $2, $3, $4, $4, $5)`,
            [fleetId, userId, mode, prix, expiresAt]
        );

        await client.query('COMMIT');
        res.json({
            success: true,
            message: `${engin.nom} mis en ${mode === 'BROCANTE' ? 'vente directe' : 'enchères'} (${prix.toLocaleString()} € / ${heures}h).`
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erreur list-sale :', err);
        res.status(500).json({ error: 'Erreur mise en vente' });
    } finally {
        client.release();
    }
});

// =========================================================================
// 4. BROCANTE & ENCHÈRES : ACHETER DIRECTEMENT OU SURENCHÉRIR
// =========================================================================
router.post('/bid', requireAuth, async (req, res) => {
    const { auctionId, montantOffre } = req.body;
    const userId = req.session.userId;
    const cfg = getGameConfig();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const aucRes = await client.query(`
            SELECT a.*, f.nom FROM market_auctions a
            JOIN player_fleet f ON f.id = a.fleet_id
            WHERE a.id = $1 FOR UPDATE
        `, [auctionId]);

        if (aucRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Annonce terminée ou introuvable.' });
        }

        const auc = aucRes.rows.at(0);
        if (new Date(auc.expires_at) <= new Date()) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cette annonce vient d’expirer.' });
        }
        if (auc.seller_id === userId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Vous ne pouvez pas acheter votre propre engin.' });
        }

        const mineRes = await client.query('SELECT argent FROM mines WHERE user_id = $1 FOR UPDATE', [userId]);
        const argent = parseFloat(mineRes.rows.at(0).argent);
        const prixActuel = parseFloat(auc.prix_actuel);

        if (auc.mode_vente === 'BROCANTE') {
            if (argent < prixActuel) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Trésorerie insuffisante.' });
            }

            const comm = prixActuel * (parseFloat(cfg.commissionBrocantePct) || 0.05);
            const netVendeur = +(prixActuel - comm).toFixed(2);

            await client.query('UPDATE mines SET argent = argent - $1, foreuses = foreuses + 1 WHERE user_id = $2', [prixActuel, userId]);
            await client.query('UPDATE mines SET argent = argent + $1, foreuses = GREATEST(0, foreuses - 1) WHERE user_id = $2', [netVendeur, auc.seller_id]);
            await client.query(`UPDATE player_fleet SET owner_id = $1, statut = 'ACTIF', parcelle_index = 0 WHERE id = $2`, [userId, auc.fleet_id]);
            await client.query('DELETE FROM market_auctions WHERE id = $1', [auctionId]);

            await client.query('COMMIT');
            return res.json({ success: true, message: `Achat brocante réussi : ${auc.nom} pour ${prixActuel.toLocaleString()} € !` });
        }

        const pasMin = parseFloat(cfg.pasEnchereMinPct) || 0.05;
        const minimumRequis = auc.highest_bidder_id
            ? Math.ceil(prixActuel * (1 + pasMin))
            : Math.ceil(prixActuel);
        const offre = Math.round(parseFloat(montantOffre) || minimumRequis);

        if (offre < minimumRequis) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Enchère minimale requise : ${minimumRequis.toLocaleString()} €.` });
        }
        if (argent < offre) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Trésorerie insuffisante pour couvrir cette enchère.' });
        }

        if (auc.highest_bidder_id) {
            await client.query('UPDATE mines SET argent = argent + $1 WHERE user_id = $2', [prixActuel, auc.highest_bidder_id]);
        }

        await client.query('UPDATE mines SET argent = argent - $1 WHERE user_id = $2', [offre, userId]);
        await client.query(
            'UPDATE market_auctions SET prix_actuel = $1, highest_bidder_id = $2 WHERE id = $3',
            [offre, userId, auctionId]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: `Enchère placée : ${offre.toLocaleString()} € sur ${auc.nom} !` });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erreur bid :', err);
        res.status(500).json({ error: 'Erreur lors de la transaction' });
    } finally {
        client.release();
    }
});

// =========================================================================
// 5. LOCATION : PROPOSER SON PROPRE ENGIN AUX AUTRES PDG (1 À 7 JOURS MAX)
// =========================================================================
router.post('/offer-rental', requireAuth, async (req, res) => {
    const { fleetId, loyerJour, dureeJours } = req.body;
    const userId = req.session.userId;
    const cfg = getGameConfig();

    const maxJours = parseInt(cfg.dureeMaxLocationJours) || 7;
    const jours = Math.max(1, Math.min(maxJours, parseInt(dureeJours) || 3));
    const loyer = Math.max(50, Math.round(parseFloat(loyerJour) || 0));

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const fleetRes = await client.query(
            'SELECT * FROM player_fleet WHERE id = $1 AND owner_id = $2 FOR UPDATE',
            [fleetId, userId]
        );
        if (fleetRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Engin introuvable.' });
        }
        const engin = fleetRes.rows.at(0);
        if (engin.statut !== 'ACTIF') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cet engin n’est pas disponible.' });
        }

        await client.query(`UPDATE player_fleet SET statut = 'OFFRE_LOC' WHERE id = $1`, [fleetId]);
        await client.query(
            `INSERT INTO active_rentals (source_type, fleet_id, owner_id, nom, categorie, prod_tonnes, vitesse_min_th, vitesse_max_th, vitesse_reglee_th, carburant_jour, usure_jour, loyer_jour, jours_restants, statut)
             VALUES ('PDG', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'DISPONIBLE')`,
            [fleetId, userId, engin.nom, engin.categorie, engin.prod_tonnes, engin.vitesse_min_th, engin.vitesse_max_th, engin.vitesse_reglee_th, engin.carburant_jour, engin.usure_jour, loyer, jours]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: `${engin.nom} proposé en location (${loyer.toLocaleString()} €/j pendant ${jours}j).` });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erreur offer-rental :', err);
        res.status(500).json({ error: 'Erreur mise en location' });
    } finally {
        client.release();
    }
});

// =========================================================================
// 5B. LOCATION : RETIRER UNE OFFRE NON LOUÉE
// =========================================================================
router.post('/cancel-rental-offer', requireAuth, async (req, res) => {
    const { fleetId } = req.body;
    const userId = req.session.userId;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const fleetRes = await client.query(
            'SELECT * FROM player_fleet WHERE id = $1 AND owner_id = $2 FOR UPDATE',
            [fleetId, userId]
        );
        if (fleetRes.rows.length === 0 || fleetRes.rows.at(0).statut !== 'OFFRE_LOC') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Aucune offre de location annulable pour cet engin.' });
        }

        await client.query(`DELETE FROM active_rentals WHERE fleet_id = $1 AND statut = 'DISPONIBLE'`, [fleetId]);
        await client.query(`UPDATE player_fleet SET statut = 'ACTIF' WHERE id = $1`, [fleetId]);

        await client.query('COMMIT');
        res.json({ success: true, message: `${fleetRes.rows.at(0).nom} retiré des offres de location et remis en service.` });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Erreur annulation offre location' });
    } finally {
        client.release();
    }
});

// =========================================================================
// 6. LOCATION : LOUER UN ENGIN (PARC OFFICIEL OU OFFRE D'UN PDG)
// =========================================================================
router.post('/rent', requireAuth, async (req, res) => {
    const { sourceType, catalogId, rentalId, dureeJours } = req.body;
    const userId = req.session.userId;
    const cfg = getGameConfig();
    const maxJours = parseInt(cfg.dureeMaxLocationJours) || 7;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const mineRes = await client.query('SELECT argent, facture_en_attente FROM mines WHERE user_id = $1 FOR UPDATE', [userId]);
        const argent = parseFloat(mineRes.rows.at(0).argent) || 0;
        const factureAttente = parseFloat(mineRes.rows.at(0).facture_en_attente) || 0;

        if (factureAttente > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Réglez d’abord votre facture hebdomadaire en attente avant de louer du matériel.' });
        }

        const engRes = await client.query(`SELECT COALESCE(SUM(loyer_jour), 0) AS total_loyers FROM active_rentals WHERE renter_id = $1 AND statut = 'EN_COURS'`, [userId]);
        const loyersEngages = parseFloat(engRes.rows.at(0).total_loyers) || 0;

        if (sourceType === 'OFFICIEL') {
            const jours = Math.max(1, Math.min(maxJours, parseInt(dureeJours) || 1));
            const catRes = await client.query('SELECT * FROM equipment_catalog WHERE id = $1 AND actif = TRUE', [catalogId]);
            if (catRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Modèle introuvable.' });
            }
            const item = catRes.rows.at(0);
            const coeff = parseFloat(cfg.coeffLoyerJeu) || 0.08;
            const loyerJour = Math.round(parseFloat(item.prix_neuf) * coeff);

            if (argent < (loyersEngages + loyerJour)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Trésorerie insuffisante pour couvrir vos loyers quotidiens (${(loyersEngages + loyerJour).toLocaleString()} €/j requis).` });
            }

            const vMin = parseFloat(item.vitesse_min_th) || 30;
            const vMax = parseFloat(item.vitesse_max_th) || 60;
            const vDefaut = Math.round((vMin + vMax) / 2);

            await client.query(
                `INSERT INTO active_rentals (source_type, catalog_id, renter_id, nom, categorie, prod_tonnes, vitesse_min_th, vitesse_max_th, vitesse_reglee_th, carburant_jour, usure_jour, loyer_jour, jours_restants, parcelle_index, statut)
                 VALUES ('OFFICIEL', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, 'EN_COURS')`,
                [item.id, userId, item.nom, item.categorie, item.prod_tonnes, vMin, vMax, vDefaut, item.carburant_jour, item.usure_jour, loyerJour, jours]
            );

            await client.query('COMMIT');
            return res.json({ success: true, message: `Location officielle validée : ${item.nom} (${loyerJour.toLocaleString()} €/j pendant ${jours}j).` });
        }

        const rentRes = await client.query(
            `SELECT * FROM active_rentals WHERE id = $1 AND statut = 'DISPONIBLE' FOR UPDATE`,
            [rentalId]
        );
        if (rentRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Cette offre de location n’est plus disponible.' });
        }
        const offre = rentRes.rows.at(0);
        if (offre.owner_id === userId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Vous ne pouvez pas louer votre propre engin.' });
        }
        if (argent < (loyersEngages + parseFloat(offre.loyer_jour))) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Trésorerie insuffisante pour couvrir vos loyers quotidiens (${Math.round(loyersEngages + parseFloat(offre.loyer_jour)).toLocaleString()} €/j requis).` });
        }


        await client.query(`UPDATE active_rentals SET renter_id = $1, statut = 'EN_COURS' WHERE id = $2`, [userId, rentalId]);
        await client.query(`UPDATE player_fleet SET statut = 'LOUE' WHERE id = $1`, [offre.fleet_id]);

        await client.query('COMMIT');
        res.json({ success: true, message: `Contrat signé : ${offre.nom} loué pour ${offre.jours_restants}j (${offre.loyer_jour} €/j) !` });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erreur rent :', err);
        res.status(500).json({ error: 'Erreur lors de la location' });
    } finally {
        client.release();
    }
});

// =========================================================================
// 7. ATELIER : RÉVISER UN ENGIN PRÉCIS DE SA FLOTTE
// =========================================================================
router.post('/repair', requireAuth, async (req, res) => {
    const { fleetId } = req.body;
    const userId = req.session.userId;
    const cfg = getGameConfig();
    const cout = parseFloat(cfg.coutRevision);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const mineRes = await client.query('SELECT argent FROM mines WHERE user_id = $1 FOR UPDATE', [userId]);
        const fleetRes = await client.query('SELECT * FROM player_fleet WHERE id = $1 AND owner_id = $2 FOR UPDATE', [fleetId, userId]);

        if (fleetRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Engin introuvable.' });
        }
        const engin = fleetRes.rows.at(0);
        if (engin.statut === 'LOUE') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Impossible de réviser un engin actuellement loué.' });
        }

        const checkGrue = await verifierGrueMaintenance(client, userId, engin);
        if (!checkGrue.ok) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Grue Niveau ${checkGrue.nivRequis} requise pour réviser un engin de gabarit ${engin.gabarit || 'Moyen'} (votre grue max : Niveau ${checkGrue.nivGrueMax}).`
            });
        }

        if (parseFloat(mineRes.rows.at(0).argent) < cout) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Trésorerie insuffisante.' });
        }

        const newUsure = Math.max(0, parseFloat(engin.usure_actuelle) - 25);
        await client.query('UPDATE mines SET argent = argent - $1 WHERE user_id = $2', [cout, userId]);
        await client.query('UPDATE player_fleet SET usure_actuelle = $1 WHERE id = $2', [newUsure, fleetId]);

        await client.query('COMMIT');
        res.json({ success: true, message: `${engin.nom} révisé (-25% usure / -${cout} €).` });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Erreur révision engin' });
    } finally {
        client.release();
    }
});

// =========================================================================
// 8. CONCESSIONNAIRES : ACHETER UNE PIÈCE PAR FAMILLE & GABARIT
// =========================================================================
router.post('/buy-parts', requireAuth, async (req, res) => {
    const { categorie, gabarit } = req.body;
    const quantite = Math.max(1, Math.min(20, parseInt(req.body.quantite) || 1));
    const userId = req.session.userId;
    const cfg = getGameConfig();

    const famNorm = FAMILLES_MATERIEL.find(f => f.toLowerCase() === (categorie || '').toLowerCase());
    const gabNorm = ['Petit', 'Moyen', 'Géant'].find(g => g.toLowerCase() === (gabarit || '').toLowerCase());
    if (!famNorm || !gabNorm) return res.status(400).json({ error: 'Concessionnaire ou gabarit invalide.' });

    const prixUnitaire = calculerPrixPiece(cfg, famNorm, gabNorm);
    const total = prixUnitaire * quantite;
    const stockKey = `${famNorm}:${gabNorm}`;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const mineRes = await client.query('SELECT argent, pieces_stock FROM mines WHERE user_id = $1 FOR UPDATE', [userId]);
        if (parseFloat(mineRes.rows.at(0).argent) < total) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Trésorerie insuffisante chez le concessionnaire.' });
        }

        const stock = mineRes.rows.at(0).pieces_stock || {};
        stock[stockKey] = (parseInt(stock[stockKey]) || 0) + quantite;

        await client.query(
            'UPDATE mines SET argent = argent - $1, pieces_stock = $2 WHERE user_id = $3',
            [total, JSON.stringify(stock), userId]
        );
        await client.query('COMMIT');
        res.json({ success: true, message: `🏢 Concessionnaire ${famNorm} (${gabNorm}) : +${quantite} pièce(s) achetée(s) (-${total.toLocaleString()} €).` });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Erreur achat concessionnaire' });
    } finally {
        client.release();
    }
});

// =========================================================================
// 9. DÉPANNAGE : RÉPARER UN ENGIN EN PANNE AVEC LA PIÈCE DU CONCESSIONNAIRE
// =========================================================================
router.post('/fix-breakdown', requireAuth, async (req, res) => {
    const { fleetId } = req.body;
    const userId = req.session.userId;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const mineRes = await client.query('SELECT pieces_stock FROM mines WHERE user_id = $1 FOR UPDATE', [userId]);
        const fleetRes = await client.query('SELECT * FROM player_fleet WHERE id = $1 AND owner_id = $2 FOR UPDATE', [fleetId, userId]);

        if (fleetRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Engin introuvable.' });
        }

        const engin = fleetRes.rows.at(0);
        if (engin.statut !== 'EN_PANNE') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cet engin n’est pas en panne.' });
        }

        const checkGrue = await verifierGrueMaintenance(client, userId, engin);
        if (!checkGrue.ok) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Grue Niveau ${checkGrue.nivRequis} requise pour dépanner un engin de gabarit ${engin.gabarit || 'Moyen'} (votre grue max : Niveau ${checkGrue.nivGrueMax}).`
            });
        }

        const famNorm = FAMILLES_MATERIEL.find(f => (engin.categorie || '').toLowerCase().includes(f.toLowerCase())) || 'Excavation';
        const gabNorm = engin.gabarit || 'Moyen';
        const stockKey = `${famNorm}:${gabNorm}`;
        const piecesRequises = parseInt(engin.pieces_panne) || 1;

        const stock = mineRes.rows.at(0).pieces_stock || {};
        const dispo = parseInt(stock[stockKey]) || 0;

        if (dispo < piecesRequises) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Pièce manquante : il faut ${piecesRequises} pièce(s) [${famNorm} — ${gabNorm}] (en stock : ${dispo}).` });
        }

        stock[stockKey] = dispo - piecesRequises;
        await client.query('UPDATE mines SET pieces_stock = $1 WHERE user_id = $2', [JSON.stringify(stock), userId]);
        await client.query(`UPDATE player_fleet SET statut = 'ACTIF', usure_actuelle = 0 WHERE id = $1`, [fleetId]);

        await client.query('COMMIT');
        res.json({ success: true, message: `✅ ${engin.nom} réparé (${piecesRequises} pièce(s) ${famNorm} ${gabNorm}) et remis en service à 0% !` });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Erreur réparation panne' });
    } finally {
        client.release();
    }
});

// =========================================================================
// 10. VARIATEUR DE VITESSE : RÉGLER LE DÉBIT EN TONNES/HEURE (T/H)
// =========================================================================
router.post('/set-speed', requireAuth, async (req, res) => {
    const { targetType, targetId, vitesseTh } = req.body;
    const userId = req.session.userId;
    const val = parseFloat(vitesseTh);
    if (isNaN(val)) return res.status(400).json({ error: 'Vitesse invalide.' });

    try {
        const table = targetType === 'RENTAL' ? 'active_rentals' : 'player_fleet';
        const ownerCol = targetType === 'RENTAL' ? 'renter_id' : 'owner_id';

        const checkRes = await pool.query(`SELECT id, nom, vitesse_min_th, vitesse_max_th FROM ${table} WHERE id = $1 AND ${ownerCol} = $2`, [targetId, userId]);
        if (checkRes.rows.length === 0) return res.status(404).json({ error: 'Engin introuvable.' });

        const item = checkRes.rows.at(0);
        const vMin = parseFloat(item.vitesse_min_th) || 30;
        const vMax = parseFloat(item.vitesse_max_th) || 60;
        const vClamped = Math.max(vMin, Math.min(vMax, Math.round(val)));

        await pool.query(`UPDATE ${table} SET vitesse_reglee_th = $1 WHERE id = $2`, [vClamped, targetId]);
        res.json({ success: true, message: `⚙️ Régime de ${item.nom} réglé à ${vClamped} t/h (${Math.round((vClamped / vMax) * 100)}% de charge).` });
    } catch (err) {
        console.error('Erreur /set-speed :', err);
        res.status(500).json({ error: 'Erreur réglage vitesse' });
    }
});

// =========================================================================
// 11. CHANTIERS : AFFECTER UN ENGIN À UN SECTEUR SONDÉ (A À L)
// =========================================================================
router.post('/assign-sector', requireAuth, async (req, res) => {
    const { targetType, targetId, parcelleIndex } = req.body;
    const userId = req.session.userId;
    const pIdx = parseInt(parcelleIndex);
    if (isNaN(pIdx) || pIdx < 0 || pIdx > 11) return res.status(400).json({ error: 'Secteur invalide.' });

    try {
        const mineRes = await pool.query('SELECT parcelles FROM mines WHERE user_id = $1', [userId]);
        const parcelles = mineRes.rows.at(0)?.parcelles || [];
        const pCible = parcelles.at(pIdx);

        if (!pCible || !pCible.estSondee) {
            return res.status(400).json({ error: 'Vous devez d’abord sonder ce secteur avant d’y envoyer du matériel !' });
        }

        const table = targetType === 'RENTAL' ? 'active_rentals' : 'player_fleet';
        const ownerCol = targetType === 'RENTAL' ? 'renter_id' : 'owner_id';

        await pool.query(`UPDATE ${table} SET parcelle_index = $1 WHERE id = $2 AND ${ownerCol} = $3`, [pIdx, targetId, userId]);
        res.json({ success: true, message: `🗺️ Engin affecté au chantier ${pCible.nom} !` });
    } catch (err) {
        console.error('Erreur /assign-sector :', err);
        res.status(500).json({ error: 'Erreur affectation secteur' });
    }
});

module.exports = router;
