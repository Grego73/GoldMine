const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const { initDatabase } = require('./config/db');
const { loadGameConfig } = require('./config/gameConfig');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const gameRoutes = require('./routes/gameRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.set('trust proxy', 1);
app.use(session({
    secret: process.env.SESSION_SECRET || 'gold_mine_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production'
    }
}));


// Branchement des routes séparées
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/game', gameRoutes);

// Démarrage du serveur après vérification des tables et chargement de la config
initDatabase()
    .then(() => loadGameConfig())
    .then(() => {
        app.listen(PORT, () => {
            console.log(`⛏️ Serveur Gold Mine prêt sur http://localhost:${PORT}`);
        });
    });
