const { pool } = require('./db');

// Valeurs de secours par défaut (complétées/écrasées par la table game_settings)
let cachedConfig = {
    argentDepart: 15000,
    coursOrInitial: 60.00,
    coursOrMin: 35.00,
    coursOrMax: 120.00,
    taxeMiniere: 0.08,
    coutMineur: 800,
    coutForeuse: 5000,
    coutRevision: 1200,
    coutPrime: 1000,
    coutCarottage: 1500,
    coutDemenagement: 3000,
    coutPanneForcee: 2500,
    salaireMineurJour: 120,
    carburantForeuseJour: 450,
    prodMineurTonnes: 2,
    prodForeuseTonnes: 15,
    usureParForeuse: 4,
    chanceEvenement: 0.30,
    // Nouvelles variables V2 (Horloge, Bourse 4h, Clients & Marketing)
    heureClotureJour: 3,
    cycleMarcheHeures: 4,
    nbClientsMarche: 10,
    margeNegociationMax: 0.15,
    coutUniteMarketing: 1000,
    usureMarketingJour: 0.10,
    seuilEtudeMarche: 25,
    impactOffreDemande: 0.02
};

// Charge tous les paramètres depuis PostgreSQL et met à jour le cache
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
