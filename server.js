const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const { initDB } = require('./config/db');
const { loadGameConfig } = require('./config/gameConfig');
const { APP_VERSION } = require('./config/version');
const { synchroniserHorlogeServeur } = require('./utils/gameEngine');

const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'goldmine_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
}));

// Anti-cache sur les pages HTML
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/version', (req, res) => res.json({ version: APP_VERSION }));
app.get('/api/links', (req, res) => res.json({ tchatgcUrl: process.env.TCHATGC_URL || '#' }));

app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/admin', adminRoutes);

async function startServer() {
    await initDB();
    await loadGameConfig();
    await synchroniserHorlogeServeur();

    // Vérifie toutes les minutes si un cycle de 4h ou la clôture de 3h00 doit s'exécuter
    setInterval(() => {
        synchroniserHorlogeServeur().catch(err => console.error(err));
    }, 60 * 1000);

    app.listen(PORT, () => {
        console.log(`⛏️ Serveur Gold Mine v${APP_VERSION} prêt sur le port ${PORT}`);
    });
}

startServer();
