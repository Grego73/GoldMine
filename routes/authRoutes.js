const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { getGameConfig, genererParcellesInitiales } = require('../config/gameConfig');
const { genererCodeSecurite, nettoyerEmail, TEXTES_SECOURS } = require('../utils/helpers');
const { envoyerEmail } = require('../utils/mailer');
const { logJoueur } = require('../utils/logger');

const router = express.Router();

// 0. TEXTE DE PRÉSENTATION DE L'ACCUEIL (avec valeurs de secours)
router.get('/welcome-text', async (req, res) => {
    try {
        const result = await pool.query("SELECT title, content FROM site_texts WHERE key = 'welcome_intro'");
        res.json(result.rows.at(0) || TEXTES_SECOURS.welcome_intro);
    } catch (err) {
        res.json(TEXTES_SECOURS.welcome_intro);
    }
});

// 1. INSCRIPTION (Création du compte + envoi du code de validation par e-mail)
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    const cleanEmail = nettoyerEmail(email);

    if (!username || !cleanEmail || !password || password.length < 6) {
        return res.status(400).json({ error: "Veuillez remplir tous les champs (mot de passe : 6 caractères min)." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const hash = await bcrypt.hash(password, 10);
        const countRes = await client.query('SELECT COUNT(*) FROM users');
        const role = parseInt(countRes.rows.at(0).count) === 0 ? 'admin' : 'player';
        const codeValidation = genererCodeSecurite();

        const userRes = await client.query(
            'INSERT INTO users (username, email, password_hash, role, is_verified, verification_code) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, role',
            [username.trim(), cleanEmail, hash, role, false, codeValidation]
        );
        const user = userRes.rows.at(0);

        const cfg = getGameConfig();
        const parcellesInit = genererParcellesInitiales();
        await client.query(
            'INSERT INTO mines (user_id, argent, cours_or, parcelles_json) VALUES ($1, $2, $3, $4)',
            [user.id, cfg.argentDepart, cfg.coursOrInitial, JSON.stringify(parcellesInit)]
        );

        await client.query('COMMIT');

        await envoyerEmail(
            cleanEmail,
            "⛏️ Validez votre compagnie sur Gold Mine",
            `<h2>Bienvenue PDG ${username.trim()} !</h2><p>Voici votre code de validation à 6 chiffres pour activer votre mine :</p><h1 style="color:#d97706;">${codeValidation}</h1>`
        );

        res.json({ success: true, requireVerification: true, email: cleanEmail });
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

// 1 BIS. VALIDATION DU CODE REÇU PAR E-MAIL
router.post('/verify-email', async (req, res) => {
    const { email, code } = req.body;
    const cleanEmail = nettoyerEmail(email);

    try {
        const result = await pool.query(
            'UPDATE users SET is_verified = TRUE, verification_code = NULL WHERE email = $1 AND verification_code = $2 RETURNING id, username, role',
            [cleanEmail, (code || '').trim()]
        );
        const user = result.rows.at(0);
        if (!user) return res.status(400).json({ error: "Code de validation incorrect." });

        req.session.user = user;
        await logJoueur(user.id, user.username, 'AUTH', 'Compte validé par e-mail (Inscription terminée)');

        res.json({ success: true, user });
    } catch (err) {
        console.error("Erreur verify-email :", err);
        res.status(500).json({ error: "Erreur serveur." });
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
        if (!user.is_verified) {
            return res.status(403).json({ error: "Veuillez valider votre e-mail avec le code reçu.", unverifiedEmail: user.email });
        }

        req.session.user = { id: user.id, username: user.username, role: user.role };
        await logJoueur(user.id, user.username, 'AUTH', 'Connexion au jeu');

        res.json({ success: true, user: req.session.user });
    } catch (err) {
        console.error("Erreur connexion :", err);
        res.status(500).json({ error: "Erreur serveur." });
    }
});

// 3. MOT DE PASSE PERDU
router.post('/forgot-password', async (req, res) => {
    const cleanEmail = nettoyerEmail(req.body.email);
    if (!cleanEmail) return res.status(400).json({ error: "Veuillez saisir votre adresse e-mail." });

    try {
        const result = await pool.query('SELECT id, username FROM users WHERE email = $1', [cleanEmail]);
        const user = result.rows.at(0);
        if (!user) return res.status(404).json({ error: "Aucun compte trouvé avec cet e-mail." });

        const code = genererCodeSecurite();
        const expires = new Date(Date.now() + 15 * 60 * 1000);
        await pool.query('UPDATE users SET reset_code = $1, reset_expires = $2 WHERE id = $3', [code, expires, user.id]);

        await envoyerEmail(
            cleanEmail,
            "🔑 Récupération de mot de passe - Gold Mine",
            `<p>Bonjour ${user.username}, voici votre code de réinitialisation (valable 15 min) :</p><h1 style="color:#d97706;">${code}</h1>`
        );
        res.json({ success: true, message: "Un code de secours à 6 chiffres vient d'être envoyé sur votre e-mail." });
    } catch (err) {
        console.error("Erreur forgot-password :", err);
        res.status(500).json({ error: "Erreur serveur." });
    }
});

// 4. RÉINITIALISATION DU MOT DE PASSE
router.post('/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;
    const cleanEmail = nettoyerEmail(email);

    if (!cleanEmail || !code || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "Veuillez remplir tous les champs (6 caractères minimum)." });
    }

    try {
        const result = await pool.query(
            'SELECT id, username FROM users WHERE email = $1 AND reset_code = $2 AND reset_expires > NOW()',
            [cleanEmail, code.trim()]
        );
        const user = result.rows.at(0);
        if (!user) return res.status(400).json({ error: "Code invalide ou expiré." });

        const hash = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = $1, reset_code = NULL, reset_expires = NULL WHERE id = $2', [hash, user.id]);
        await logJoueur(user.id, user.username, 'AUTH', 'Mot de passe réinitialisé via code de secours');

        res.json({ success: true, message: "Mot de passe modifié ! Vous pouvez vous connecter." });
    } catch (err) {
        console.error("Erreur reset-password :", err);
        res.status(500).json({ error: "Erreur serveur." });
    }
});

router.get('/me', (req, res) => {
    if (req.session && req.session.user) return res.json({ loggedIn: true, user: req.session.user });
    res.json({ loggedIn: false });
});

router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

module.exports = router;
