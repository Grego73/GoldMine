const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { getGameConfig, genererParcellesInitiales } = require('../config/gameConfig');

const router = express.Router();

// 1. INSCRIPTION
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password || password.length < 6) {
        return res.status(400).json({ error: "Veuillez remplir tous les champs (mot de passe : 6 caractères minimum)." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const hash = await bcrypt.hash(password, 10);
        // Le premier inscrit devient automatiquement 'admin'
        const countRes = await client.query('SELECT COUNT(*) FROM users');
        const role = parseInt(countRes.rows.at(0).count) === 0 ? 'admin' : 'player';

        const userRes = await client.query(
            'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, role',
            [username.trim(), email.trim().toLowerCase(), hash, role]
        );
        const user = userRes.rows.at(0);

        // Lecture des paramètres d'équilibrage depuis la BDD
        const cfg = getGameConfig();
        const parcellesInit = genererParcellesInitiales();

        await client.query(
            'INSERT INTO mines (user_id, argent, cours_or, parcelles_json) VALUES ($1, $2, $3, $4)',
            [user.id, cfg.argentDepart, cfg.coursOrInitial, JSON.stringify(parcellesInit)]
        );

        await client.query('COMMIT');
        req.session.user = user;
        res.json({ success: true, user });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') {
            return res.status(400).json({ error: "Ce nom de PDG ou cet e-mail est déjà utilisé." });
        }
        console.error("Erreur inscription :", err);
        res.status(500).json({ error: "Erreur serveur lors de l'inscription." });
    } finally {
        client.release();
    }
});

// 2. CONNEXION
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Veuillez saisir votre identifiant et votre mot de passe." });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
        const user = result.rows.at(0);

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: "Identifiant ou mot de passe incorrect." });
        }
        if (user.is_banned) {
            return res.status(403).json({ error: "Votre compagnie a été suspendue par l'administration." });
        }

        req.session.user = { id: user.id, username: user.username, role: user.role };
        res.json({ success: true, user: req.session.user });
    } catch (err) {
        console.error("Erreur connexion :", err);
        res.status(500).json({ error: "Erreur serveur lors de la connexion." });
    }
});

// 3. MOT DE PASSE PERDU (Génération du code à 6 chiffres)
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Veuillez saisir votre adresse e-mail." });

    try {
        const result = await pool.query('SELECT id, username FROM users WHERE email = $1', [email.trim().toLowerCase()]);
        const user = result.rows.at(0);
        if (!user) return res.status(404).json({ error: "Aucun compte trouvé avec cet e-mail." });

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 15 * 60 * 1000); // Valable 15 minutes

        await pool.query('UPDATE users SET reset_code = $1, reset_expires = $2 WHERE id = $3', [code, expires, user.id]);

        // Affichage en console (en attendant le branchement Brevo)
        console.log(`🔑 [MOT DE PASSE PERDU] Code pour ${user.username} (${email}) : ${code}`);
        res.json({ success: true, message: "Un code de secours à 6 chiffres a été généré (voir console serveur en mode test)." });
    } catch (err) {
        console.error("Erreur forgot-password :", err);
        res.status(500).json({ error: "Erreur serveur." });
    }
});

// 4. RÉINITIALISATION DU MOT DE PASSE
router.post('/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "Veuillez remplir tous les champs (6 caractères minimum)." });
    }

    try {
        const result = await pool.query(
            'SELECT id FROM users WHERE email = $1 AND reset_code = $2 AND reset_expires > NOW()',
            [email.trim().toLowerCase(), code.trim()]
        );
        const user = result.rows.at(0);
        if (!user) return res.status(400).json({ error: "Code invalide ou expiré." });

        const hash = await bcrypt.hash(newPassword, 10);
        await pool.query(
            'UPDATE users SET password_hash = $1, reset_code = NULL, reset_expires = NULL WHERE id = $2',
            [hash, user.id]
        );
        res.json({ success: true, message: "Mot de passe modifié avec succès ! Vous pouvez vous connecter." });
    } catch (err) {
        console.error("Erreur reset-password :", err);
        res.status(500).json({ error: "Erreur serveur." });
    }
});

// 5. VÉRIFIER SI DÉJÀ CONNECTÉ
router.get('/me', (req, res) => {
    if (req.session && req.session.user) {
        return res.json({ loggedIn: true, user: req.session.user });
    }
    res.json({ loggedIn: false });
});

// 6. DÉCONNEXION
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

module.exports = router;
