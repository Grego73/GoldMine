const { Pool } = require('pg');
require('dotenv').config();

// Connexion à PostgreSQL (Neon)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Fonction de création automatique des 6 tables au démarrage
async function initDatabase() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Table des comptes joueurs
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role VARCHAR(20) DEFAULT 'player',
                is_banned BOOLEAN DEFAULT FALSE,
                is_verified BOOLEAN DEFAULT FALSE,
                verification_code VARCHAR(10),
                reset_code VARCHAR(10),
                reset_expires TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS verification_code VARCHAR(10);
        `);

        // 2. Table des mines (Sauvegarde de l'exploitation de chaque PDG)
        await client.query(`
            CREATE TABLE IF NOT EXISTS mines (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                jour INTEGER DEFAULT 1,
                argent NUMERIC(15, 2) DEFAULT 50000,
                stock_or NUMERIC(15, 2) DEFAULT 0,
                cours_or NUMERIC(10, 2) DEFAULT 60.00,
                mineurs INTEGER DEFAULT 5,
                moral INTEGER DEFAULT 80,
                foreuses INTEGER DEFAULT 1,
                usure INTEGER DEFAULT 0,
                parcelle_active INTEGER DEFAULT 0,
                parcelles_json JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. Table des journaux d'administration
        await client.query(`
            CREATE TABLE IF NOT EXISTS admin_logs (
                id SERIAL PRIMARY KEY,
                admin_username VARCHAR(50) NOT NULL,
                action TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 4. Table des 18 paramètres d'équilibrage modifiables depuis l'Admin
        await client.query(`
            CREATE TABLE IF NOT EXISTS game_settings (
                key VARCHAR(50) PRIMARY KEY,
                value NUMERIC(15, 4) NOT NULL,
                label VARCHAR(150) NOT NULL
            );
        `);

        await client.query(`
            INSERT INTO game_settings (key, value, label) VALUES
                ('argentDepart', 50000, 'Trésorerie de départ (€)'),
                ('coursOrInitial', 60.00, 'Cours de l''or initial (€/g)'),
                ('coursOrMin', 38.00, 'Cours de l''or minimum (€/g)'),
                ('coursOrMax', 95.00, 'Cours de l''or maximum (€/g)'),
                ('taxeMiniere', 0.20, 'Taxe minière à la revente (0.20 = 20%)'),
                ('coutMineur', 500, 'Coût recrutement mineur (€)'),
                ('coutForeuse', 10000, 'Coût achat excavatrice (€)'),
                ('coutRevision', 500, 'Coût révision atelier (€)'),
                ('coutPrime', 1000, 'Coût prime d''équipe (€)'),
                ('coutCarottage', 1500, 'Coût carottage prospection (€)'),
                ('coutDemenagement', 3000, 'Coût déménagement chantier (€)'),
                ('coutPanneForcee', 1000, 'Amende réparation panne (€)'),
                ('salaireMineurJour', 150, 'Salaire mineur / jour (€)'),
                ('carburantForeuseJour', 200, 'Carburant excavatrice / jour (€)'),
                ('prodMineurTonnes', 2, 'Extraction mineur (tonnes/jour)'),
                ('prodForeuseTonnes', 15, 'Extraction excavatrice (tonnes/jour)'),
                ('usureParForeuse', 3, 'Usure quotidienne par engin (%)'),
                ('chanceEvenement', 0.22, 'Probabilité événement aléatoire (0.22 = 22%)')
            ON CONFLICT (key) DO NOTHING;
        `);

        // 5. Table des textes du site modifiables depuis l'Admin
        await client.query(`
            CREATE TABLE IF NOT EXISTS site_texts (
                key VARCHAR(50) PRIMARY KEY,
                title VARCHAR(150) NOT NULL,
                content TEXT NOT NULL
            );
        `);

        await client.query(`
            INSERT INTO site_texts (key, title, content) VALUES
                ('welcome_intro', 'Bienvenue dans Gold Mine — Simulation Minière', 'Prenez la tête d''une exploitation aurifère à ciel ouvert ! Prospectez de nouveaux filons, gérez votre flotte d''excavatrices, surveillez le moral de vos équipes et spéculez sur le cours mondial de l''or pour bâtir le plus grand empire minier.')
            ON CONFLICT (key) DO NOTHING;
        `);

        // 6. Table des journaux d'activité des joueurs
        await client.query(`
            CREATE TABLE IF NOT EXISTS player_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                username VARCHAR(50) NOT NULL,
                category VARCHAR(30) NOT NULL,
                details TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Index pour accélérer les recherches
        await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_mines_argent ON mines(argent DESC);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_player_logs_created ON player_logs(created_at DESC);`);

        await client.query('COMMIT');
        console.log("✅ Les 6 tables PostgreSQL Gold Mine ont été créées avec succès.");
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Erreur lors de la création des tables PostgreSQL :", err);
    } finally {
        client.release();
    }
}

module.exports = { pool, initDatabase };
