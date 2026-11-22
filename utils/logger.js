const { pool } = require('../config/db');

// Enregistre une action d'un joueur en base de données
async function logJoueur(userId, username, category, details) {
    if (!userId || !username) return;
    try {
        await pool.query(
            'INSERT INTO player_logs (user_id, username, category, details) VALUES ($1, $2, $3, $4)',
            [userId, username, category, details]
        );
    } catch (err) {
        console.error("❌ Erreur enregistrement logJoueur :", err);
    }
}

module.exports = { logJoueur };
