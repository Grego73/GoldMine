const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { loadGameConfig } = require('../config/gameConfig');

async function requireAdmin(req, res, next) {
    const uid = req.session && (req.session.userId || (req.session.user && req.session.user.id));
    if (!uid) return res.status(401).json({ error: 'Non connecté' });

    const resUser = await pool.query('SELECT username, role FROM users WHERE id = $1', [uid]);
    if (resUser.rows.length === 0 || resUser.rows.at(0).role !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    req.adminUsername = resUser.rows.at(0).username;
    next();
}

async function logAdmin(adminUsername, action) {
    await pool.query('INSERT INTO admin_logs (admin_username, action) VALUES ($1, $2)', [adminUsername, action]);
}

// 1. LISTE DES JOUEURS
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.username, u.email, u.role, u.is_verified, u.is_banned,
                   m.jour, m.argent, m.stock_or, m.foreuses, m.marketing_points
            FROM users u
            LEFT JOIN mines m ON u.id = m.user_id
            ORDER BY u.id ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur admin /users :', err);
        res.status(500).json({ error: 'Erreur lecture joueurs' });
    }
});

router.post('/give-money', requireAdmin, async (req, res) => {
    const { userId, amount } = req.body;
    await pool.query('UPDATE mines SET argent = argent + $1 WHERE user_id = $2', [parseFloat(amount), userId]);
    await logAdmin(req.adminUsername, `Ajustement trésorerie (${amount} €) sur joueur #${userId}`);
    res.json({ success: true });
});

router.post('/toggle-ban', requireAdmin, async (req, res) => {
    const { userId } = req.body;
    await pool.query('UPDATE users SET is_banned = NOT is_banned WHERE id = $1', [userId]);
    await logAdmin(req.adminUsername, `Bascule bannissement joueur #${userId}`);
    res.json({ success: true });
});

// 2. VARIABLES D'ÉQUILIBRAGE (25 PARAMÈTRES)
router.get('/settings', requireAdmin, async (req, res) => {
    const result = await pool.query('SELECT * FROM game_settings ORDER BY key ASC');
    res.json(result.rows);
});

router.post('/settings', requireAdmin, async (req, res) => {
    const { key, value } = req.body;
    await pool.query('UPDATE game_settings SET value = $1 WHERE key = $2', [parseFloat(value), key]);
    await loadGameConfig();
    await logAdmin(req.adminUsername, `Modification variable [${key}] = ${value}`);
    res.json({ success: true });
});

// 3. GESTION DU CATALOGUE CLIENTS (Particulier, Entreprise, Événementiel)
router.get('/clients-catalog', requireAdmin, async (req, res) => {
    const result = await pool.query('SELECT * FROM clients_catalog ORDER BY type_client ASC, nom ASC');
    res.json(result.rows);
});

router.post('/clients-catalog', requireAdmin, async (req, res) => {
    const { id, nom, type_client, secteur, min_gr, max_gr, bonus_min, bonus_max, poids_apparition, actif } = req.body;
    if (id) {
        await pool.query(
            `UPDATE clients_catalog SET nom=$1, type_client=$2, secteur=$3, min_gr=$4, max_gr=$5,
             bonus_min=$6, bonus_max=$7, poids_apparition=$8, actif=$9 WHERE id=$10`,
            [nom, type_client, secteur, min_gr, max_gr, bonus_min, bonus_max, poids_apparition, actif, id]
        );
        await logAdmin(req.adminUsername, `Modification client catalogue : ${nom} (${type_client})`);
    } else {
        await pool.query(
            `INSERT INTO clients_catalog (nom, type_client, secteur, min_gr, max_gr, bonus_min, bonus_max, poids_apparition, actif)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)`,
            [nom, type_client || 'Entreprise', secteur, min_gr, max_gr, bonus_min, bonus_max, poids_apparition || 10]
        );
        await logAdmin(req.adminUsername, `Ajout client catalogue : ${nom} (${type_client})`);
    }
    res.json({ success: true });
});

router.delete('/clients-catalog/:id', requireAdmin, async (req, res) => {
    await pool.query('DELETE FROM clients_catalog WHERE id = $1', [req.params.id]);
    await logAdmin(req.adminUsername, `Suppression client catalogue #${req.params.id}`);
    res.json({ success: true });
});

// 4. TEXTES DU SITE
router.get('/texts', requireAdmin, async (req, res) => {
    const result = await pool.query('SELECT * FROM site_texts ORDER BY key ASC');
    res.json(result.rows);
});

router.post('/texts', requireAdmin, async (req, res) => {
    const { key, title, content } = req.body;
    await pool.query('UPDATE site_texts SET title = $1, content = $2 WHERE key = $3', [title, content, key]);
    await logAdmin(req.adminUsername, `Modification texte [${key}]`);
    res.json({ success: true });
});

// 5. LOGS JOUEURS & LOGS ADMIN
router.get('/player-logs', requireAdmin, async (req, res) => {
    const username = req.query.username || '';
    const result = username
        ? await pool.query('SELECT * FROM player_logs WHERE username ILIKE $1 ORDER BY created_at DESC LIMIT 100', [`%${username}%`])
        : await pool.query('SELECT * FROM player_logs ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
});

router.get('/logs', requireAdmin, async (req, res) => {
    const result = await pool.query('SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT 50');
    res.json(result.rows);
});

module.exports = router;
