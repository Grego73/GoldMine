const express = require('express');
const { pool } = require('../config/db');
const { loadGameConfig } = require('../config/gameConfig');
const { requireAdmin } = require('../utils/authMiddleware');

const router = express.Router();

// 1. LISTE DES JOUEURS ET DE LEURS MINES
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.username, u.email, u.role, u.is_banned, m.jour, m.argent, m.stock_or, m.foreuses
            FROM users u
            LEFT JOIN mines m ON u.id = m.user_id
            ORDER BY u.id ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("Erreur admin /users :", err);
        res.status(500).json({ error: "Erreur lors de la récupération des joueurs." });
    }
});

// 2. AJUSTER LA TRÉSORERIE D'UN JOUEUR (Bonus ou amende)
router.post('/give-money', requireAdmin, async (req, res) => {
    const { userId, amount } = req.body;
    const montant = parseFloat(amount);
    if (!userId || isNaN(montant)) {
        return res.status(400).json({ error: "Montant invalide." });
    }

    try {
        await pool.query('UPDATE mines SET argent = GREATEST(0, argent + $1) WHERE user_id = $2', [montant, userId]);
        await pool.query(
            'INSERT INTO admin_logs (admin_username, action) VALUES ($1, $2)',
            [req.session.user.username, `Ajustement trésorerie de ${montant} € pour le joueur ID #${userId}`]
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Erreur admin /give-money :", err);
        res.status(500).json({ error: "Erreur lors de la modification de la trésorerie." });
    }
});

// 3. BANNIR / DÉBANNIR UN JOUEUR
router.post('/toggle-ban', requireAdmin, async (req, res) => {
    const { userId } = req.body;
    if (parseInt(userId) === req.session.user.id) {
        return res.status(400).json({ error: "Vous ne pouvez pas vous bannir vous-même." });
    }

    try {
        await pool.query('UPDATE users SET is_banned = NOT is_banned WHERE id = $1', [userId]);
        await pool.query(
            'INSERT INTO admin_logs (admin_username, action) VALUES ($1, $2)',
            [req.session.user.username, `Bascule bannissement pour le joueur ID #${userId}`]
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Erreur admin /toggle-ban :", err);
        res.status(500).json({ error: "Erreur lors du changement de statut." });
    }
});

// 4. LIRE LES 18 PARAMÈTRES D'ÉQUILIBRAGE (game_settings)
router.get('/settings', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT key, value, label FROM game_settings ORDER BY key ASC');
        res.json(result.rows);
    } catch (err) {
        console.error("Erreur admin GET /settings :", err);
        res.status(500).json({ error: "Erreur lecture des paramètres." });
    }
});

// 5. METTRE À JOUR UN PARAMÈTRE EN DIRECT
router.post('/settings', requireAdmin, async (req, res) => {
    const { key, value } = req.body;
    const val = parseFloat(value);
    if (!key || isNaN(val)) {
        return res.status(400).json({ error: "Valeur numérique invalide." });
    }

    try {
        await pool.query('UPDATE game_settings SET value = $1 WHERE key = $2', [val, key]);
        await loadGameConfig(); // Recharge immédiatement la nouvelle valeur en mémoire

        await pool.query(
            'INSERT INTO admin_logs (admin_username, action) VALUES ($1, $2)',
            [req.session.user.username, `Modification paramètre [${key}] -> ${val}`]
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Erreur admin POST /settings :", err);
        res.status(500).json({ error: "Erreur lors de la sauvegarde du paramètre." });
    }
});

// 6. LIRE LES DERNIERS LOGS ADMIN
router.get('/logs', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT 30');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Erreur lecture des logs." });
    }
});

module.exports = router;
