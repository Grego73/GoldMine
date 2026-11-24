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
const { router: hrRoutes } = require('./routes/hrRoutes');
const bankRoutes = require('./routes/bankRoutes');
const app = express();
const PORT = process.env.PORT || 3000;
let isMaintenance = true;
let isTickRunning = false;
let clockInterval = null;

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

function demarrerHorloge() {
    if (clockInterval) return;
    clockInterval = setInterval(async () => {
        if (isMaintenance || isTickRunning) return;
        isTickRunning = true;
        try {
            await synchroniserHorlogeServeur();
        } finally {
            isTickRunning = false;
        }
    }, 60 * 1000);
}

// Routes toujours accessibles (même en maintenance)
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Verrou de maintenance pour les routes de jeu uniquement (avec tentative de reprise auto)
app.use('/api', async (req, res, next) => {
    if (isMaintenance) {
        try {
            await loadGameConfig();
            isMaintenance = false;
            demarrerHorloge();
            console.log('✅ Base de données prête : sortie automatique du mode maintenance.');
            return next();
        } catch (e) {
            return res.status(503).json({
                maintenance: true,
                error: 'Site en maintenance : base de données temporairement inaccessible ou non configurée.'
            });
        }
    }
    next();
});

app.use('/api/game', gameRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/bank', bankRoutes);

async function startServer() {
    try {
        await initDB();
        await loadGameConfig();
        isMaintenance = false;
        await synchroniserHorlogeServeur();
        demarrerHorloge();

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
