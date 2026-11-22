// CENTRALISATION UNIQUE DE TOUTES LES URLS DU PROJET GOLD MINE
require('dotenv').config();

const LINKS = {
    // URL de production du jeu Gold Mine (lue depuis .env / Render, ou localhost par défaut)
    appUrl: process.env.APP_URL || 'http://localhost:3000',

    // Passerelle vers la communauté et l'aide sur TchatGC
    tchatgcUrl: process.env.TCHATGC_URL || 'https://tchatgc-1.onrender.com',

    // Services externes (pour l'envoi d'e-mails Brevo à venir)
    brevoApiUrl: 'https://api.brevo.com/v3/smtp/email'
};

module.exports = LINKS;
