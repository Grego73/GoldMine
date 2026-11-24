const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { loadGameConfig } = require('../config/gameConfig');
const LINKS = require('../config/links');
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
    const { userId, amount, mode, goldAmount } = req.body;
    const val = parseFloat(amount);
    if (!isNaN(val)) {
        if (mode === 'SET') {
            await pool.query('UPDATE mines SET argent = $1 WHERE user_id = $2', [val, userId]);
            await logAdmin(req.adminUsername, `Définition trésorerie (${val} €) sur joueur #${userId}`);
        } else {
            await pool.query(
                `UPDATE mines SET argent = (CASE WHEN argent::text = 'NaN' THEN 0 ELSE argent END) + $1 WHERE user_id = $2`,
                [val, userId]
            );
            await logAdmin(req.adminUsername, `Ajustement trésorerie (${val} €) sur joueur #${userId}`);
        }
    }
    const gVal = parseFloat(goldAmount);
    if (!isNaN(gVal)) {
        if (mode === 'SET') {
            await pool.query('UPDATE mines SET stock_or = $1 WHERE user_id = $2', [gVal, userId]);
            await logAdmin(req.adminUsername, `Définition stock or (${gVal} g) sur joueur #${userId}`);
        } else {
            await pool.query(
                `UPDATE mines SET stock_or = (CASE WHEN stock_or::text = 'NaN' THEN 0 ELSE stock_or END) + $1 WHERE user_id = $2`,
                [gVal, userId]
            );
            await logAdmin(req.adminUsername, `Ajustement stock or (${gVal} g) sur joueur #${userId}`);
        }
    }
    res.json({ success: true });
});


router.post('/toggle-ban', requireAdmin, async (req, res) => {
    const { userId } = req.body;
    await pool.query('UPDATE users SET is_banned = NOT is_banned WHERE id = $1', [userId]);
    await logAdmin(req.adminUsername, `Bascule bannissement joueur #${userId}`);
    res.json({ success: true });
});

// 2. VARIABLES D'ÉQUILIBRAGE (LECTURE, MODIFICATION & CRÉATION DIRECTE)
router.get('/settings', requireAdmin, async (req, res) => {
    const result = await pool.query('SELECT * FROM game_settings ORDER BY key ASC');
    res.json(result.rows);
});

router.post('/settings', requireAdmin, async (req, res) => {
    const { key, value, label } = req.body;
    if (!key || value === undefined) return res.status(400).json({ error: 'Clé et valeur requises' });

    if (label && label.trim() !== '') {
        await pool.query(
            `INSERT INTO game_settings (key, value, label) VALUES ($1, $2, $3)
             ON CONFLICT (key) DO UPDATE SET value = $2, label = $3`,
            [key.trim(), parseFloat(value), label.trim()]
        );
        await logAdmin(req.adminUsername, `Création/MAJ variable [${key}] = ${value} (${label})`);
    } else {
        await pool.query('UPDATE game_settings SET value = $1 WHERE key = $2', [parseFloat(value), key.trim()]);
        await logAdmin(req.adminUsername, `Modification variable [${key}] = ${value}`);
    }

    await loadGameConfig();
    res.json({ success: true });
});

router.post('/settings-bulk', requireAdmin, async (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Aucune donnée valide à importer.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let count = 0;
        for (const item of items) {
            if (!item.key || !item.label || isNaN(parseFloat(item.value))) continue;
            await client.query(
                `INSERT INTO game_settings (key, value, label) VALUES ($1, $2, $3)
                 ON CONFLICT (key) DO UPDATE SET value = $2, label = $3`,
                [item.key.trim(), parseFloat(item.value), item.label.trim()]
            );
            count += 1;
        }
        await client.query('COMMIT');
        await logAdmin(req.adminUsername, `Import massif de ${count} variables d'équilibrage`);
        await loadGameConfig();
        res.json({ success: true, count });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erreur settings-bulk :', err);
        res.status(500).json({ error: 'Erreur lors de l’import en masse' });
    } finally {
        client.release();
    }
});

// 3. GESTION DU CATALOGUE DES ENGINS NEUFS (BOUTIQUE & LOCATION)
router.get('/equipment-catalog', requireAdmin, async (req, res) => {
    const result = await pool.query('SELECT * FROM equipment_catalog ORDER BY prix_neuf ASC');
    res.json(result.rows);
});

router.post('/equipment-catalog', requireAdmin, async (req, res) => {
    const { nom, categorie, gabarit, prix_neuf, vitesse_min_th, vitesse_max_th, carburant_jour, usure_jour, pieces_panne } = req.body;
    if (!nom || !categorie) return res.status(400).json({ error: 'Nom et catégorie requis' });

    const vMin = parseFloat(vitesse_min_th) || 30;
    const vMax = parseFloat(vitesse_max_th) || 60;
    const prod24h = Math.round(((vMin + vMax) / 2) * 24);

    await pool.query(
        `INSERT INTO equipment_catalog (nom, categorie, gabarit, prix_neuf, prod_tonnes, vitesse_min_th, vitesse_max_th, carburant_jour, usure_jour, pieces_panne, actif)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
         ON CONFLICT (nom) DO UPDATE SET
         categorie = $2, gabarit = $3, prix_neuf = $4, prod_tonnes = $5, vitesse_min_th = $6, vitesse_max_th = $7, carburant_jour = $8, usure_jour = $9, pieces_panne = $10, actif = TRUE`,
        [nom.trim(), categorie.trim(), (gabarit || 'Moyen').trim(), parseFloat(prix_neuf), prod24h, vMin, vMax, parseFloat(carburant_jour), parseFloat(usure_jour), parseInt(pieces_panne) || 1]
    );
    await logAdmin(req.adminUsername, `Ajout/MAJ engin catalogue : ${nom} (${vMin}-${vMax} t/h)`);
    res.json({ success: true });
});

router.post('/equipment-catalog-bulk', requireAdmin, async (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Aucune donnée à importer.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let count = 0;
        for (const it of items) {
            if (!it.nom || !it.categorie || isNaN(parseFloat(it.prix_neuf))) continue;
            const vMin = parseFloat(it.vitesse_min_th) || 30;
            const vMax = parseFloat(it.vitesse_max_th) || 60;
            const prod24h = Math.round(((vMin + vMax) / 2) * 24);

            await client.query(
                `INSERT INTO equipment_catalog (nom, categorie, gabarit, prix_neuf, prod_tonnes, vitesse_min_th, vitesse_max_th, carburant_jour, usure_jour, pieces_panne, actif)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
                 ON CONFLICT (nom) DO UPDATE SET
                 categorie = $2, gabarit = $3, prix_neuf = $4, prod_tonnes = $5, vitesse_min_th = $6, vitesse_max_th = $7, carburant_jour = $8, usure_jour = $9, pieces_panne = $10, actif = TRUE`,
                [it.nom.trim(), it.categorie.trim(), (it.gabarit || 'Moyen').trim(), parseFloat(it.prix_neuf), prod24h, vMin, vMax, parseFloat(it.carburant_jour), parseFloat(it.usure_jour), parseInt(it.pieces_panne) || 1]
            );
            count += 1;
        }
        await client.query('COMMIT');
        await logAdmin(req.adminUsername, `Import massif de ${count} engins à vitesse variable`);
        res.json({ success: true, count });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Erreur import engins' });
    } finally {
        client.release();
    }
});

router.delete('/equipment-catalog/:id', requireAdmin, async (req, res) => {
    await pool.query('DELETE FROM equipment_catalog WHERE id = $1', [req.params.id]);
    await logAdmin(req.adminUsername, `Suppression engin catalogue #${req.params.id}`);
    res.json({ success: true });
});


// 4. GESTION DU CATALOGUE CLIENTS
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

router.post('/clients-catalog-bulk', requireAdmin, async (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Aucune donnée client valide à importer.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let count = 0;
        for (const it of items) {
            if (!it.nom || !it.secteur || isNaN(parseFloat(it.min_gr)) || isNaN(parseFloat(it.max_gr))) continue;
            await client.query(
                `INSERT INTO clients_catalog (nom, type_client, secteur, min_gr, max_gr, bonus_min, bonus_max, poids_apparition, actif)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
                 ON CONFLICT (nom) DO UPDATE SET
                 type_client = $2, secteur = $3, min_gr = $4, max_gr = $5, bonus_min = $6, bonus_max = $7, poids_apparition = $8, actif = TRUE`,
                [
                    it.nom.trim(),
                    (it.type_client || 'Entreprise').trim(),
                    it.secteur.trim(),
                    parseFloat(it.min_gr),
                    parseFloat(it.max_gr),
                    parseFloat(it.bonus_min) || 0,
                    parseFloat(it.bonus_max) || 0.05,
                    parseInt(it.poids_apparition) || 10
                ]
            );
            count += 1;
        }
        await client.query('COMMIT');
        await logAdmin(req.adminUsername, `Import massif de ${count} clients acheteurs`);
        res.json({ success: true, count });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erreur clients-catalog-bulk :', err);
        res.status(500).json({ error: 'Erreur lors de l’import des clients' });
    } finally {
        client.release();
    }
});

router.delete('/clients-catalog/:id', requireAdmin, async (req, res) => {
    await pool.query('DELETE FROM clients_catalog WHERE id = $1', [req.params.id]);
    await logAdmin(req.adminUsername, `Suppression client catalogue #${req.params.id}`);
    res.json({ success: true });
});

// 5. TEXTES DU SITE
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

// 6. LOGS JOUEURS & LOGS ADMIN
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

// 6B. RÉCAPITULATIF COMPLET DES VENTES D'OR (EN ATTENTE, VENDUES, PARTIELLES, REFUSÉES)
router.get('/sales-recap', requireAdmin, async (req, res) => {
    try {
        const ordersRes = await pool.query(`
            SELECT o.*, u.username
            FROM market_sell_orders o
            JOIN users u ON u.id = o.user_id
            ORDER BY COALESCE(o.resolved_at, o.created_at) DESC
            LIMIT 200
        `);
        res.json(ordersRes.rows);
    } catch (err) {
        console.error('Erreur admin /sales-recap :', err);
        res.status(500).json({ error: 'Erreur lecture récapitulatif des ventes' });
    }
});

// 7. VÉRIFICATION DE VERSION (SERVEUR ACTIF VS DERNIER COMMIT GITHUB)
router.get('/version', requireAdmin, async (req, res) => {
    try {
        const pkg = require('../package.json');
        const serverCommit = (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || 'Local';
        const serverBranch = process.env.RENDER_GIT_BRANCH || 'main';

        let githubCommit = 'Inconnu';
        let githubDate = null;
        let githubMsg = '';

        try {
            const ghRes = await fetch(LINKS.githubCommitApiUrl, {
                headers: { 'User-Agent': 'GoldMine-Admin', 'Accept': 'application/vnd.github.v3+json' }
            });
            if (ghRes.ok) {
                const ghData = await ghRes.json();
                githubCommit = (ghData.sha || '').slice(0, 7);
                githubDate = ghData.commit?.author?.date || null;
                githubMsg = ghData.commit?.message || '';
            }
        } catch (e) {
            // Hors-ligne ou limite API GitHub atteinte
        }

        res.json({
            appVersion: pkg.version || '1.0.0',
            serverCommit,
            serverBranch,
            githubCommit,
            githubDate,
            githubMsg,
            isUpToDate: serverCommit === 'Local' || githubCommit === 'Inconnu' || serverCommit === githubCommit
        });
    } catch (err) {
        res.status(500).json({ error: 'Erreur lecture version' });
    }
});

module.exports = router;
