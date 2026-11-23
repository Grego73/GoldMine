const { pool } = require('./db');

// Cache uniquement alimenté par PostgreSQL (aucune valeur codée en dur ici)
let cachedConfig = null;

// Charge tous les paramètres depuis PostgreSQL (lève une erreur si la BDD est inaccessible)
async function loadGameConfig() {
    const res = await pool.query('SELECT key, value FROM game_settings');
    if (res.rows.length === 0) {
        throw new Error('Table game_settings vide ou introuvable en base de données.');
    }

    const freshConfig = {};
    res.rows.forEach(row => {
        freshConfig[row.key] = parseFloat(row.value);
    });

    cachedConfig = freshConfig;
    return cachedConfig;
}

// Retourne la configuration chargée depuis la BDD (ou lève une erreur si non chargée)
function getGameConfig() {
    if (!cachedConfig) {
        throw new Error('Configuration du jeu non chargée (Base de données indisponible).');
    }
    return cachedConfig;
}

// Calcule la profondeur (de 10 m à 60 m max) des 12 secteurs A à L
function calculerProfondeurSecteur(i) {
    return Math.min(60, 10 + Math.round((i * 50) / 11));
}

// Génère les 12 concessions d'une nouvelle mine
function genererParcellesInitiales() {
    return Array.from({ length: 12 }, (_, i) => ({
        id: i,
        nom: "Secteur " + String.fromCharCode(65 + i),
        profondeurMetres: calculerProfondeurSecteur(i),
        reserveReelle: i === 0 ? 1000 : Math.floor(Math.random() * 2500) + 900,
        pureteReelle: i === 0 ? 5.0 : +(Math.random() * 7.5 + 2.5).toFixed(1),
        estSondee: i === 0,
        estimationPurete: i === 0 ? 5.0 : null
    }));
}

module.exports = { loadGameConfig, getGameConfig, genererParcellesInitiales, calculerProfondeurSecteur };
