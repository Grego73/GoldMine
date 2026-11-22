const { pool } = require('./db');

// Valeurs de secours par défaut si la base n'est pas encore lue
let cachedConfig = {
    argentDepart: 50000,
    coursOrInitial: 60.00,
    coursOrMin: 38.00,
    coursOrMax: 95.00,
    taxeMiniere: 0.20,
    coutMineur: 500,
    coutForeuse: 10000,
    coutRevision: 500,
    coutPrime: 1000,
    coutCarottage: 1500,
    coutDemenagement: 3000,
    coutPanneForcee: 1000,
    salaireMineurJour: 150,
    carburantForeuseJour: 200,
    prodMineurTonnes: 2,
    prodForeuseTonnes: 15,
    usureParForeuse: 3,
    chanceEvenement: 0.22
};

// Charge les paramètres depuis PostgreSQL et met à jour le cache
async function loadGameConfig() {
    try {
        const res = await pool.query('SELECT key, value FROM game_settings');
        res.rows.forEach(row => {
            cachedConfig[row.key] = parseFloat(row.value);
        });
        return cachedConfig;
    } catch (err) {
        console.error("Erreur lecture game_settings :", err);
        return cachedConfig;
    }
}

// Retourne la configuration en mémoire instantanément
function getGameConfig() {
    return cachedConfig;
}

// Génère les 12 concessions d'une nouvelle mine
function genererParcellesInitiales() {
    return Array.from({ length: 12 }, (_, i) => ({
        id: i,
        nom: "Secteur " + String.fromCharCode(65 + i),
        reserveReelle: i === 0 ? 1000 : Math.floor(Math.random() * 2500) + 900,
        pureteReelle: i === 0 ? 5.0 : +(Math.random() * 7.5 + 2.5).toFixed(1),
        estSondee: i === 0,
        estimationPurete: i === 0 ? 5.0 : null
    }));
}

module.exports = { loadGameConfig, getGameConfig, genererParcellesInitiales };
