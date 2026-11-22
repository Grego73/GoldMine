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

// =========================================================================
// 1. ÉTAT COMPLET DU MATÉRIEL (Ma Flotte, Boutique, Brocante/Enchères, Location)
// =========================================================================
router.get('/', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    try {
        const cfg = getGameConfig();

        // Migration douce : si un joueur existant a des foreuses dans `mines` mais aucune ligne dans `player_fleet`
        const fleetCheck = await pool.query('SELECT COUNT(*) FROM player_fleet WHERE owner_id = $1', [userId]);
        if (parseInt(fleetCheck.rows.at(0).count) === 0) {
            const mineRes = await pool.query('SELECT foreuses, usure FROM mines WHERE user_id = $1', [userId]);
            const nbForeuses = parseInt(mineRes.rows.at(0)?.foreuses) || 0;
            const usureInit = parseFloat(mineRes.rows.at(0)?.usure) || 0;

            for (let i = 0; i < nbForeuses; i++) {
                await pool.query(
                    `INSERT INTO player_fleet (owner_id, nom, categorie, prod_tonnes, carburant_jour, usure_jour, usure_actuelle, statut)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIF')`,
                    [userId, 'Excavatrice Standard', 'Excavation', cfg.prodForeuseTonnes, cfg.carburantForeuseJour, cfg.usureParForeuse, usureInit]
                );
            }
        }

        const myFleetRes = await pool.query('SELECT * FROM player_fleet WHERE owner_id = $1 ORDER BY id ASC', [userId]);
        const catalogRes = await pool.query('SELECT * FROM equipment_catalog WHERE actif = TRUE ORDER BY prix_neuf ASC');

        // Annonces Brocante & Enchères en cours
        const auctionsRes = await pool.query(`
            SELECT a.*, f.nom, f.categorie, f.prod_tonnes, f.carburant_jour, f.usure_jour, f.usure_actuelle,
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

        res.json({
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
        await client.query(
            `INSERT INTO player_fleet (owner_id, catalog_id, nom, categorie, prod_tonnes, carburant_jour, usure_jour, usure_actuelle, statut)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'ACTIF')`,
            [userId, item.id, item.nom, item.categorie, item.prod_tonnes, item.carburant_jour, item.usure_jour]
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

        // CAS A : ACHAT IMMÉDIAT EN BROCANTE
        if (auc.mode_vente === 'BROCANTE') {
            if (argent < prixActuel) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Trésorerie insuffisante.' });
            }

            const comm = prixActuel * (parseFloat(cfg.commissionBrocantePct) || 0.05);
            const netVendeur = +(prixActuel - comm).toFixed(2);

            await client.query('UPDATE mines SET argent = argent - $1, foreuses = foreuses + 1 WHERE user_id = $2', [prixActuel, userId]);
            await client.query('UPDATE mines SET argent = argent + $1, foreuses = GREATEST(0, foreuses - 1) WHERE user_id = $2', [netVendeur, auc.seller_id]);
            await client.query(`UPDATE player_fleet SET owner_id = $1, statut = 'ACTIF' WHERE id = $2`, [userId, auc.fleet_id]);
            await client.query('DELETE FROM market_auctions WHERE id = $1', [auctionId]);

            await client.query('COMMIT');
            return res.json({ success: true, message: `Achat brocante réussi : ${auc.nom} pour ${prixActuel.toLocaleString()} € !` });
        }

        // CAS B : SURENCHÈRE
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

        // Rembourse l'ancien meilleur enchérisseur
        if (auc.highest_bidder_id) {
            await client.query('UPDATE mines SET argent = argent + $1 WHERE user_id = $2', [prixActuel, auc.highest_bidder_id]);
        }

        // Bloque les fonds du nouvel enchérisseur
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
            `INSERT INTO active_rentals (source_type, fleet_id, catalog_id, owner_id, nom, categorie, prod_tonnes, carburant_jour, usure_jour, loyer_jour, jours_restants, statut)
             VALUES ('PDG', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'DISPONIBLE')`,
            [fleetId, engin.catalog_id, userId, engin.nom, engin.categorie, engin.prod_tonnes, engin.carburant_jour, engin.usure_jour, loyer, jours]
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

            await client.query(
                `INSERT INTO active_rentals (source_type, catalog_id, renter_id, nom, categorie, prod_tonnes, carburant_jour, usure_jour, loyer_jour, jours_restants, statut)
                 VALUES ('OFFICIEL', $1, $2, $3, $4, $5, $6, $7, $8, $9, 'EN_COURS')`,
                [item.id, userId, item.nom, item.categorie, item.prod_tonnes, item.carburant_jour, item.usure_jour, loyerJour, jours]
            );

            await client.query('COMMIT');
            return res.json({ success: true, message: `Location officielle validée : ${item.nom} (${loyerJour.toLocaleString()} €/j pendant ${jours}j).` });
        }

        // Location d'une offre entre PDG
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

module.exports = router;
