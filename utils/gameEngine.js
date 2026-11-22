const { pool } = require('../config/db');
const { getGameConfig } = require('../config/gameConfig');
const { EVENTS_CATALOG } = require('../config/eventsCatalog');

// Tire un client pondéré selon son poids_apparition depuis la table clients_catalog
function tirerClientPondere(catalogue) {
    const totalPoids = catalogue.reduce((acc, c) => acc + (parseInt(c.poids_apparition) || 10), 0);
    let r = Math.random() * totalPoids;
    for (const item of catalogue) {
        r -= (parseInt(item.poids_apparition) || 10);
        if (r <= 0) return item;
    }
    return catalogue[0];
}

// Génère les N clients acheteurs actifs pour le cycle de X heures
async function genererClientsMarche(clientDb, coursOr, cfg) {
    const resCat = await clientDb.query('SELECT * FROM clients_catalog WHERE actif = TRUE');
    if (resCat.rows.length === 0) return;

    await clientDb.query('DELETE FROM market_clients');

    const nbClients = Math.max(1, Math.round(cfg.nbClientsMarche || 10));
    const heuresCycle = Math.max(1, cfg.cycleMarcheHeures || 4);
    const expiresAt = new Date(Date.now() + heuresCycle * 3600 * 1000);

    for (let i = 0; i < nbClients; i++) {
        const modele = tirerClientPondere(resCat.rows);
        const minGr = parseFloat(modele.min_gr);
        const maxGr = parseFloat(modele.max_gr);
        const demande = Math.round(minGr + Math.random() * (maxGr - minGr));

        const bMin = parseFloat(modele.bonus_min);
        const bMax = parseFloat(modele.bonus_max);
        const bonusPrix = bMin + Math.random() * (bMax - bMin);
        const prixBase = +(coursOr * (1 + bonusPrix)).toFixed(2);

        // Marge maximale que ce client est prêt à accepter en négociation (entre 0% et +15%)
        const margeMax = +(Math.random() * (cfg.margeNegociationMax || 0.15)).toFixed(3);

        await clientDb.query(
            `INSERT INTO market_clients (nom, type_client, secteur, demande_grammes, prix_base_gramme, marge_acceptee_max, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [modele.nom, modele.type_client, modele.secteur, demande, prixBase, margeMax, expiresAt]
        );
    }
}

// Vérifie et exécute : 1) Le cycle marché (4h)  2) La clôture quotidienne (3h00 du matin)
async function synchroniserHorlogeServeur() {
    const cfg = getGameConfig();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const resMkt = await client.query('SELECT * FROM market_state WHERE id = 1 FOR UPDATE');
        if (resMkt.rows.length === 0) {
            await client.query('COMMIT');
            return;
        }
        const mkt = resMkt.rows[0];
        let coursOr = parseFloat(mkt.cours_or);
        let historique = Array.isArray(mkt.historique_cours) ? mkt.historique_cours : [];

        // A. CYCLE MARCHÉ (TOUTES LES X HEURES)
        const msCycle = (cfg.cycleMarcheHeures || 4) * 3600 * 1000;
        const tempsEcouleMarche = Date.now() - new Date(mkt.last_market_tick).getTime();

        const resCountClients = await client.query('SELECT COUNT(*) FROM market_clients');
        const aucunClient = parseInt(resCountClients.rows[0].count) === 0;

        if (tempsEcouleMarche >= msCycle || aucunClient) {
            // Fluctuation naturelle + légère remontée si peu d'or a été vendu
            const variation = (Math.random() * 6 - 2.5) / 100;
            coursOr = Math.max(cfg.coursOrMin, Math.min(cfg.coursOrMax, +(coursOr * (1 + variation)).toFixed(2)));

            const heureLabel = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
            historique.push({ label: heureLabel, cours: coursOr });
            if (historique.length > 24) historique.shift();

            await genererClientsMarche(client, coursOr, cfg);
            await client.query(
                `UPDATE market_state SET cours_or = $1, historique_cours = $2, last_market_tick = NOW() WHERE id = 1`,
                [coursOr, JSON.stringify(historique)]
            );
        }

        // B. CLÔTURE QUOTIDIENNE À L'HEURE CONFIGURÉE (EX: 3H00 DU MATIN)
        const nowParis = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
        const heureCloture = Math.floor(cfg.heureClotureJour ?? 3);

        // Date logique de la journée minière (avant 3h00, on est encore sur la journée de la veille)
        const dateLogique = new Date(nowParis);
        if (nowParis.getHours() < heureCloture) {
            dateLogique.setDate(dateLogique.getDate() - 1);
        }
        const dateJourStr = dateLogique.toISOString().split('T')[0];
        const lastDailyStr = new Date(mkt.last_daily_tick).toISOString().split('T')[0];

        if (dateJourStr > lastDailyStr) {
            const resMines = await client.query(`
                SELECT m.*, u.username FROM mines m
                JOIN users u ON u.id = m.user_id
                WHERE u.is_banned = FALSE
            `);

            for (const mine of resMines.rows) {
                const parcelles = mine.parcelles;
                const pActive = parcelles[mine.parcelle_active] || parcelles[0];
                const cadence = parseFloat(mine.cadence) || 1.0;
                const mineurs = parseInt(mine.mineurs) || 0;
                const foreuses = parseInt(mine.foreuses) || 0;

                let moral = Math.max(0, Math.min(100, parseFloat(mine.moral) - ((cadence - 1) * 20) + 2));
                const greve = moral < 25;

                let usure = Math.min(100, parseFloat(mine.usure) + (foreuses * cfg.usureParForeuse * cadence));
                const panne = (Math.random() * 100) < usure;

                const prodMineurs = greve ? 0 : (mineurs * cfg.prodMineurTonnes * cadence * (moral / 100));
                const prodForeuses = panne ? 0 : (foreuses * cfg.prodForeuseTonnes * cadence);
                const rocheExtraite = Math.min(pActive.reserveReelle, prodMineurs + prodForeuses);
                pActive.reserveReelle = Math.max(0, +(pActive.reserveReelle - rocheExtraite).toFixed(1));

                const orProduit = +(rocheExtraite * pActive.pureteReelle).toFixed(1);
                let stockOr = parseFloat(mine.stock_or) + orProduit;

                let couts = (mineurs * cfg.salaireMineurJour) + (foreuses * cfg.carburantForeuseJour);
                let rapport = `Clôture J${mine.jour + 1} : +${Math.round(orProduit)}g d'or extraits (${Math.round(rocheExtraite)}t) | Frais : -${couts} €`;

                if (greve) rapport += ' | ✊ GRÈVE (moral bas)';
                if (panne) {
                    usure = 0;
                    couts += cfg.coutPanneForcee;
                    rapport += ` | ⚠️ PANNE ENGIN (-${cfg.coutPanneForcee} €)`;
                }

                const argent = parseFloat(mine.argent) - couts;
                // Usure quotidienne de la notoriété marketing
                const marketingPoints = Math.max(1, +(parseFloat(mine.marketing_points) * (1 - (cfg.usureMarketingJour || 0.10))).toFixed(1));

                // Événement aléatoire éventuel en attente de choix du PDG
                let pendingEvent = mine.pending_event;
                if (!pendingEvent && Math.random() < cfg.chanceEvenement && EVENTS_CATALOG.length > 0) {
                    pendingEvent = EVENTS_CATALOG[Math.floor(Math.random() * EVENTS_CATALOG.length)];
                }

                await client.query(
                    `UPDATE mines SET jour = jour + 1, argent = $1, stock_or = $2, moral = $3, usure = $4,
                     marketing_points = $5, parcelles = $6, pending_event = $7, updated_at = NOW()
                     WHERE user_id = $8`,
                    [argent, stockOr, moral, usure, marketingPoints, JSON.stringify(parcelles), pendingEvent ? JSON.stringify(pendingEvent) : null, mine.user_id]
                );

                await client.query(
                    `INSERT INTO player_logs (user_id, username, category, details) VALUES ($1, $2, 'CLOTURE', $3)`,
                    [mine.user_id, mine.username, rapport]
                );
            }

            await client.query(`UPDATE market_state SET last_daily_tick = $1 WHERE id = 1`, [dateJourStr]);
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Erreur horloge serveur :', err);
    } finally {
        client.release();
    }
}

module.exports = { synchroniserHorlogeServeur };
