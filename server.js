const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const { initDatabase } = require('./config/db');
const { loadGameConfig } = require('./config/gameConfig');
const LINKS = require('./config/links');
const { APP_VERSION } = require('./config/version');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const gameRoutes = require('./routes/gameRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Indispensable pour les cookies HTTPS derrière le proxy de Render
app.set('trust proxy', 1);

// Lecture des données JSON
app.use(express.json());

// Désactive le cache navigateur uniquement sur les fichiers .html (anti-cache)
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }
    next();
});

// Fichiers statiques (CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

// Gestion des sessions joueurs (cookie valable 30 jours)
app.use(session({
    secret: process.env.SESSION_SECRET || 'gold_mine_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production'
    }
}));

// Routes utilitaires (UptimeRobot, liens centralisés, version anti-cache)
app.get('/ping', (req, res) => {
    res.status(200).send('OK - Gold Mine');
});

app.get('/api/links', (req, res) => {
    res.json({
        appUrl: LINKS.appUrl,
        tchatgcUrl: LINKS.tchatgcUrl
    });
});

app.get('/api/version', (req, res) => {
    res.json({ version: APP_VERSION });
});

// Branchement des routes métiers
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/game', gameRoutes);

// Démarrage du serveur après vérification des 6 tables et chargement de la config
initDatabase()
    .then(() => loadGameConfig())
    .then(() => {
        app.listen(PORT, () => {
            console.log(`⛏️ Serveur Gold Mine v${APP_VERSION} prêt sur http://localhost:${PORT}`);
        });
    });
