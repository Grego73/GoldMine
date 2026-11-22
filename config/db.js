const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
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
                moral NUMERIC DEFAULT 80,
                usure NUMERIC DEFAULT 0,
                cadence NUMERIC DEFAULT 1.0,
                marketing_points NUMERIC DEFAULT 10,
                parcelle_active INTEGER DEFAULT 0,
                parcelles JSONB NOT NULL,
                pending_event JSONB DEFAULT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. État mondial de la Bourse & Horloge du serveur
        await client.query(`
            CREATE TABLE IF NOT EXISTS market_state (
                id INTEGER PRIMARY KEY DEFAULT 1,
                cours_or NUMERIC DEFAULT 60.00,
                historique_cours JSONB DEFAULT '[]',
                last_market_tick TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_daily_tick DATE DEFAULT CURRENT_DATE
            );
        `);

        // 4. Catalogue d'acheteurs modifiables à l'infini depuis l'Admin (Particulier, Entreprise, Événement)
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

        // 5. Les Clients Acheteurs actifs sur le marché (renouvelés toutes les X heures)
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


        // 6. Variables d'équilibrage modifiables à l'infini en Admin
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

        // Peuplement initial du catalogue clients (Particulier, Entreprise, Événementiel)
        const defaultCatalog = [
            ['Joaillerie Place Vendôme', 'Entreprise', 'Luxe', 150, 700, 0.02, 0.14, 10],
            ['Banque Centrale Helvétique', 'Entreprise', 'Réserve d’État', 1000, 3500, -0.04, 0.06, 8],
            ['Fonderie Industrielle de Lyon', 'Entreprise', 'Industrie', 400, 1500, -0.08, 0.03, 12],
            ['Aérospatiale & Composants Or', 'Entreprise', 'Haute Tech', 200, 900, 0.00, 0.10, 10],
            ['Haute Horlogerie de Genève', 'Entreprise', 'Luxe', 150, 750, 0.03, 0.15, 9],
            ['Collecteur Privé Zurich', 'Particulier', 'Collection privée', 30, 200, 0.05, 0.15, 10],
            ['Investisseur Patrimonial Paris', 'Particulier', 'Épargne lingotins', 50, 350, 0.02, 0.12, 10],
            ['Comité Médailles Olympiques', 'Événementiel', 'Commande spéciale', 1500, 5000, 0.06, 0.15, 3],
            ['Fonds d’Urgence Crise Monétaire', 'Événementiel', 'Spéculation', 2000, 6000, 0.08, 0.15, 2],
            ['Exposition Universelle Pavillon Or', 'Événementiel', 'Prestige', 800, 2500, 0.05, 0.14, 4]
        ];

        for (const [nom, typeClient, secteur, minGr, maxGr, bMin, bMax, poids] of defaultCatalog) {
            await client.query(
                `INSERT INTO clients_catalog (nom, type_client, secteur, min_gr, max_gr, bonus_min, bonus_max, poids_apparition)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (nom) DO NOTHING`,
                [nom, typeClient, secteur, minGr, maxGr, bMin, bMax, poids]
            );
        }

        // Insertion des 25 paramètres modifiables à l'infini
        const defaultSettings = [
            ['argentDepart', 15000, 'Trésorerie de départ (€)'],
            ['coursOrInitial', 60, 'Cours initial de l’or (€/g)'],
            ['coursOrMin', 35, 'Cours plancher de l’or (€/g)'],
            ['coursOrMax', 120, 'Cours plafond de l’or (€/g)'],
            ['coutMineur', 800, 'Coût recrutement 1 mineur (€)'],
            ['salaireMineurJour', 120, 'Salaire quotidien 1 mineur (€/j)'],
            ['prodMineurTonnes', 2, 'Extraction 1 mineur (tonnes/j)'],
            ['coutForeuse', 5000, 'Prix achat 1 excavatrice (€)'],
            ['carburantForeuseJour', 450, 'Carburant quotidien 1 excavatrice (€/j)'],
            ['prodForeuseTonnes', 15, 'Extraction 1 excavatrice (tonnes/j)'],
            ['usureParForeuse', 4, 'Usure quotidienne par engin (%)'],
            ['coutRevision', 1200, 'Coût révision atelier (-25% usure) (€)'],
            ['coutPanneForcee', 2500, 'Coût réparation panne critique (€)'],
            ['coutPrime', 1000, 'Coût prime moral (+15% moral) (€)'],
            ['coutCarottage', 1500, 'Coût carottage géologique (€)'],
            ['coutDemenagement', 3000, 'Coût déménagement vers parcelle (€)'],
            ['taxeMiniere', 0.08, 'Redevance minière sur vente (0.08 = 8%)'],
            ['chanceEvenement', 0.30, 'Probabilité incident quotidien (0.30 = 30%)'],
            ['heureClotureJour', 3, 'Heure de clôture quotidienne (0-23h)'],
            ['cycleMarcheHeures', 4, 'Durée cycle clients & bourse (heures)'],
            ['nbClientsMarche', 10, 'Nombre de clients générés par cycle'],
            ['margeNegociationMax', 0.15, 'Marge négociation max (0.15 = +/- 15%)'],
            ['coutUniteMarketing', 1000, 'Coût +10 pts campagne marketing (€)'],
            ['usureMarketingJour', 0.10, 'Perte notoriété quotidienne (0.10 = 10%)'],
            ['seuilEtudeMarche', 25, 'Points marketing requis pour étude de marché']
        ];

        for (const [key, value, label] of defaultSettings) {
            await client.query(
                `INSERT INTO game_settings (key, value, label) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
                [key, value, label]
            );
        }

        // Initialisation de la Bourse mondiale
        await client.query(`
            INSERT INTO market_state (id, cours_or, historique_cours)
            VALUES (1, 60.00, '[{"label":"Init","cours":60}]')
            ON CONFLICT (id) DO NOTHING
        `);

        // Texte d'accueil par défaut
        await client.query(`
            INSERT INTO site_texts (key, title, content)
            VALUES ('welcome', 'Devenez le magnat de l’extraction aurifère',
            'Prospectez vos concessions à ciel ouvert, gérez vos équipes et vos excavatrices, investissez dans votre marketing face aux autres PDG et négociez vos lingots au meilleur prix auprès des acheteurs internationaux.')
            ON CONFLICT (key) DO NOTHING
        `);

        await client.query('COMMIT');
        console.log('✅ Base de données PostgreSQL V2 (avec catalogue clients en table) initialisée.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Erreur initialisation DB :', err);
    } finally {
        client.release();
    }
}

module.exports = { pool, initDB };
