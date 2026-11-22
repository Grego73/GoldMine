const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const { initDB } = require('./config/db');
const { loadGameConfig } = require('./config/gameConfig');
const LINKS = require('./config/links');
const { APP_VERSION } = require('./config/version');
const { synchroniserHorlogeServeur } = require('./utils/gameEngine');

const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const adminRoutes = require('./routes/adminRoutes');
const equipmentRoutes = require('./routes/equipmentRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
let isMaintenance = true;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'gold-mine-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
}));

app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || req.path.endsWith('.js')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/links', (req, res) => res.json(LINKS));
app.get('/api/version', (req, res) => res.json({ version: APP_VERSION }));

// Routes toujours accessibles (même en maintenance)
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Verrou de maintenance pour les routes de jeu uniquement
app.use('/api', (req, res, next) => {
    if (isMaintenance) {
        return res.status(503).json({
            maintenance: true,
            error: 'Site en maintenance : base de données temporairement inaccessible ou non configurée.'
        });
    }
    next();
});

app.use('/api/game', gameRoutes);
app.use('/api/equipment', equipmentRoutes);

async function startServer() {
    try {
        await initDB();
        await loadGameConfig();
        isMaintenance = false;
        await synchroniserHorlogeServeur();

        setInterval(async () => {
            if (!isMaintenance) {
                await synchroniserHorlogeServeur();
            }
        }, 60 * 1000);

        console.log(`🚀 Gold Mine v${APP_VERSION} opérationnel (Mode BDD strict actif).`);
    } catch (err) {
        isMaintenance = true;
        console.error('⚠️ Serveur démarré en MODE MAINTENANCE :', err.message);
    }

    app.listen(PORT, () => {
        console.log(`🌐 Serveur HTTP à l'écoute sur le port ${PORT}`);
    });
}

startServer();
