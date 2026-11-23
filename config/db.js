const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('render.com') || process.env.DATABASE_URL.includes('neon.tech'))
        ? { rejectUnauthorized: false }
        : false
});

async function initDB() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Utilisateurs
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role VARCHAR(20) DEFAULT 'player',
                is_verified BOOLEAN DEFAULT FALSE,
                verification_code VARCHAR(10),
                reset_code VARCHAR(10),
                is_banned BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Mines & Entreprises des PDG
        await client.query(`
            CREATE TABLE IF NOT EXISTS mines (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                jour INTEGER DEFAULT 1,
                argent NUMERIC DEFAULT 15000,
                stock_or NUMERIC DEFAULT 0,
                mineurs INTEGER DEFAULT 5,
                foreuses INTEGER DEFAULT 1,
                conducteurs INTEGER DEFAULT 2,
                mecaniciens INTEGER DEFAULT 1,
                chefs_equipe INTEGER DEFAULT 1,
                cadres JSONB DEFAULT '[]',
                moral NUMERIC DEFAULT 80,
                usure NUMERIC DEFAULT 0,
                cadence NUMERIC DEFAULT 1.0,
                marketing_points NUMERIC DEFAULT 10,
                parcelle_active INTEGER DEFAULT 0,
                parcelles JSONB NOT NULL,
                pending_event JSONB DEFAULT NULL,
                tutorial_step INTEGER DEFAULT 1,
                pieces_detachees INTEGER DEFAULT 2,
                pieces_stock JSONB DEFAULT '{}',
                frais_semaine_accumules NUMERIC DEFAULT 0,
                facture_en_attente NUMERIC DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. État mondial de la Bourse & Horloge du serveur
        await client.query(`
            CREATE TABLE IF NOT EXISTS market_state (
                id INTEGER PRIMARY KEY DEFAULT 1,
                cours_or NUMERIC NOT NULL,
                historique_cours JSONB DEFAULT '[]',
                last_market_tick TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_daily_tick DATE DEFAULT CURRENT_DATE,
                last_hourly_tick TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_weekly_tick TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 4. Catalogue d'acheteurs (géré en Admin)
        await client.query(`
            CREATE TABLE IF NOT EXISTS clients_catalog (
                id SERIAL PRIMARY KEY,
                nom VARCHAR(100) UNIQUE NOT NULL,
                type_client VARCHAR(30) DEFAULT 'Entreprise',
                secteur VARCHAR(50) NOT NULL,
                min_gr NUMERIC NOT NULL,
                max_gr NUMERIC NOT NULL,
                bonus_min NUMERIC NOT NULL,
                bonus_max NUMERIC NOT NULL,
                poids_apparition INTEGER DEFAULT 10,
                actif BOOLEAN DEFAULT TRUE
            );
        `);

        // 5. Clients Acheteurs actifs sur le marché
        await client.query(`
            CREATE TABLE IF NOT EXISTS market_clients (
                id SERIAL PRIMARY KEY,
                nom VARCHAR(100) NOT NULL,
                type_client VARCHAR(30) DEFAULT 'Entreprise',
                secteur VARCHAR(50) NOT NULL,
                demande_grammes NUMERIC NOT NULL,
                prix_base_gramme NUMERIC NOT NULL,
                marge_acceptee_max NUMERIC NOT NULL,
                expires_at TIMESTAMP NOT NULL
            );
        `);

        // 6. Variables d'équilibrage (gérées en Admin)
        await client.query(`
            CREATE TABLE IF NOT EXISTS game_settings (
                key VARCHAR(60) PRIMARY KEY,
                value NUMERIC NOT NULL,
                label VARCHAR(150) NOT NULL
            );
        `);

        // 7. Textes éditables du site
        await client.query(`
            CREATE TABLE IF NOT EXISTS site_texts (
                key VARCHAR(50) PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                content TEXT NOT NULL
            );
        `);

        // 8. Logs Admin & Logs Joueurs
        await client.query(`
            CREATE TABLE IF NOT EXISTS admin_logs (
                id SERIAL PRIMARY KEY,
                admin_username VARCHAR(50) NOT NULL,
                action TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS player_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                username VARCHAR(50) NOT NULL,
                category VARCHAR(30) DEFAULT 'MINE',
                details TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 9. Catalogue des engins neufs (géré en Admin)
        await client.query(`
            CREATE TABLE IF NOT EXISTS equipment_catalog (
                id SERIAL PRIMARY KEY,
                nom VARCHAR(100) UNIQUE NOT NULL,
                categorie VARCHAR(50) NOT NULL,
                gabarit VARCHAR(20) DEFAULT 'Moyen',
                prix_neuf NUMERIC NOT NULL,
                prod_tonnes NUMERIC NOT NULL,
                vitesse_min_th NUMERIC DEFAULT 30,
                vitesse_max_th NUMERIC DEFAULT 60,
                carburant_jour NUMERIC NOT NULL,
                usure_jour NUMERIC NOT NULL,
                pieces_panne INTEGER DEFAULT 1,
                actif BOOLEAN DEFAULT TRUE
            );
        `);

        // 10. Flotte individuelle de chaque PDG
        await client.query(`
            CREATE TABLE IF NOT EXISTS player_fleet (
                id SERIAL PRIMARY KEY,
                owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                catalog_id INTEGER REFERENCES equipment_catalog(id),
                nom VARCHAR(100) NOT NULL,
                categorie VARCHAR(50) NOT NULL,
                gabarit VARCHAR(20) DEFAULT 'Moyen',
                prod_tonnes NUMERIC NOT NULL,
                vitesse_min_th NUMERIC DEFAULT 30,
                vitesse_max_th NUMERIC DEFAULT 60,
                vitesse_reglee_th NUMERIC DEFAULT 45,
                carburant_jour NUMERIC NOT NULL,
                usure_jour NUMERIC NOT NULL,
                pieces_panne INTEGER DEFAULT 1,
                usure_actuelle NUMERIC DEFAULT 0,
                parcelle_index INTEGER DEFAULT 0,
                statut VARCHAR(30) DEFAULT 'ACTIF',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 11. Brocante & Enchères entre PDG
        await client.query(`
            CREATE TABLE IF NOT EXISTS market_auctions (
                id SERIAL PRIMARY KEY,
                fleet_id INTEGER REFERENCES player_fleet(id) ON DELETE CASCADE,
                seller_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                mode_vente VARCHAR(20) NOT NULL,
                prix_depart NUMERIC NOT NULL,
                prix_actuel NUMERIC NOT NULL,
                highest_bidder_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 12. Offres et Contrats de Location (Parc officiel + entre PDG)
        await client.query(`
            CREATE TABLE IF NOT EXISTS active_rentals (
                id SERIAL PRIMARY KEY,
                source_type VARCHAR(20) NOT NULL,
                fleet_id INTEGER REFERENCES player_fleet(id) ON DELETE CASCADE,
                catalog_id INTEGER REFERENCES equipment_catalog(id),
                owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                renter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                nom VARCHAR(100) NOT NULL,
                categorie VARCHAR(50) NOT NULL,
                prod_tonnes NUMERIC NOT NULL,
                vitesse_min_th NUMERIC DEFAULT 30,
                vitesse_max_th NUMERIC DEFAULT 60,
                vitesse_reglee_th NUMERIC DEFAULT 45,
                carburant_jour NUMERIC NOT NULL,
                usure_jour NUMERIC NOT NULL,
                loyer_jour NUMERIC NOT NULL,
                jours_restants INTEGER NOT NULL,
                parcelle_index INTEGER DEFAULT 0,
                statut VARCHAR(20) DEFAULT 'DISPONIBLE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 13. Emprunts Bancaires des PDG
        await client.query(`
            CREATE TABLE IF NOT EXISTS player_loans (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                banque_code VARCHAR(30) NOT NULL,
                banque_nom VARCHAR(100) NOT NULL,
                montant_emprunte NUMERIC NOT NULL,
                taux_interet NUMERIC NOT NULL,
                total_a_rembourser NUMERIC NOT NULL,
                restant_du NUMERIC NOT NULL,
                echeance_jour NUMERIC NOT NULL,
                duree_jours INTEGER NOT NULL,
                jours_restants INTEGER NOT NULL,
                statut VARCHAR(20) DEFAULT 'EN_COURS',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 14. Placements d'Épargne Bloquée (Certificats de dépôt)
        await client.query(`
            CREATE TABLE IF NOT EXISTS player_savings (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                banque_nom VARCHAR(100) NOT NULL,
                montant_place NUMERIC NOT NULL,
                taux_rendement NUMERIC NOT NULL,
                gain_final NUMERIC NOT NULL,
                duree_jours INTEGER NOT NULL,
                jours_restants INTEGER NOT NULL,
                statut VARCHAR(20) DEFAULT 'BLOQUE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Vérification stricte que la base est bien configurée (sinon -> mode maintenance)
        const checkSettings = await client.query('SELECT COUNT(*) FROM game_settings');
        if (parseInt(checkSettings.rows.at(0).count) === 0) {
            throw new Error('Base de données non configurée : table game_settings vide.');
        }

        await client.query('COMMIT');
        console.log('✅ Structure PostgreSQL propre initialisée avec succès.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Erreur initialisation DB (basculer en maintenance) :', err.message);
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { pool, initDB };
