const express = require('express');
const { pool } = require('../config/db');
const { getGameConfig } = require('../config/gameConfig');
const { requireAuth } = require('../utils/authMiddleware');

const router = express.Router();

// 1. CHARGER LA MINE DU JOUEUR ET LES PARAMÈTRES DU JEU
router.get('/state', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM mines WHERE user_id = $1', [req.session.user.id]);
        const mine = result.rows.at(0);

        if (!mine) {
            return res.status(404).json({ error: "Aucune mine trouvée pour ce compte." });
        }

        res.json({
            user: req.session.user,
            config: getGameConfig(),
            mine: {
                jour: parseInt(mine.jour),
                argent: parseFloat(mine.argent),
                stockOr: parseFloat(mine.stock_or),
                coursOr: parseFloat(mine.cours_or),
                mineurs: parseInt(mine.mineurs),
                moral: parseInt(mine.moral),
                foreuses: parseInt(mine.foreuses),
                usure: parseFloat(mine.usure),
                parcelleActive: parseInt(mine.parcelle_active),
                parcelles: mine.parcelles_json
            }
        });
    } catch (err) {
        console.error("Erreur GET /api/game/state :", err);
        res.status(500).json({ error: "Erreur lors du chargement de la mine." });
    }
});

// 2. SAUVEGARDER LA MINE EN BASE DE DONNÉES
router.post('/save', requireAuth, async (req, res) => {
    const { etat, parcelles } = req.body;
    if (!etat || !parcelles) {
        return res.status(400).json({ error: "Données de sauvegarde manquantes." });
    }

    try {
        await pool.query(`
            UPDATE mines SET
                jour = $1,
                argent = $2,
                stock_or = $3,
                cours_or = $4,
                mineurs = $5,
                moral = $6,
                foreuses = $7,
                usure = $8,
                parcelle_active = $9,
                parcelles_json = $10,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $11
        `, [
            etat.jour,
            etat.argent,
            etat.stockOr,
            etat.coursOr,
            etat.mineurs,
            etat.moral,
            etat.foreuses,
            etat.usure,
            etat.parcelleActive,
            JSON.stringify(parcelles),
            req.session.user.id
        ]);

        res.json({ success: true });
    } catch (err) {
        console.error("Erreur POST /api/game/save :", err);
        res.status(500).json({ error: "Erreur lors de la sauvegarde en base." });
    }
});

// 3. CLASSEMENT DES COMPAGNIES MINIÈRES (TOP 10)
router.get('/ranking', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.username, m.jour, m.argent, m.stock_or, m.foreuses
            FROM mines m
            JOIN users u ON m.user_id = u.id
            WHERE u.is_banned = FALSE
            ORDER BY m.argent DESC
            LIMIT 10
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la récupération du classement." });
    }
});

module.exports = router;
