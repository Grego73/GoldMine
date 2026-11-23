const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { getGameConfig } = require('../config/gameConfig');

function requireAuth(req, res, next) {
    const uid = req.session && (req.session.userId || (req.session.user && req.session.user.id));
    if (!uid) return res.status(401).json({ error: 'Non connecté' });
    req.session.userId = uid;
    next();
}

function getCatalogueBanques(cfg, hasDAF) {
    const bonusDaf = hasDAF ? 0.01 : 0;
    return [
        {
            code: 'REGIONAL',
            nom: '🏦 Crédit Minier Régional',
            desc: 'Partenaire local des jeunes exploitations. Taux avantageux sur court terme.',
            tauxBase: Math.max(0.01, (parseFloat(cfg.tauxBanqueRegionale) || 0.05) - bonusDaf),
            durees: [7, 14]
        },
        {
            code: 'ALPES',
            nom: '🏛️ Banque Industrielle des Alpes',
            desc: 'Financement d’équipements lourds et d’infrastructures de traitement.',
            tauxBase: Math.max(0.01, (parseFloat(cfg.tauxBanqueAlpes) || 0.08) - bonusDaf),
            durees: [7, 14, 21]
        },
        {
            code: 'AURIFERE',
            nom: '💎 Fonds d’Investissement Aurifère',
            desc: 'Ligne de crédit haute capacité pour l’expansion sur les concessions profondes.',
            tauxBase: Math.max(0.01, (parseFloat(cfg.tauxFondsAurifere) || 0.12) - bonusDaf),
            durees: [14, 21]
        }
    ];
}

async function calculerSituationFinanciere(clientDb, userId, cfg) {
    const mineRes = await clientDb.query('SELECT argent, stock_or, cadres FROM mines WHERE user_id = $1', [userId]);
    const mktRes = await clientDb.query('SELECT cours_or FROM market_state WHERE id = 1');
    const fleetRes = await clientDb.query(`
        SELECT f.usure_actuelle, COALESCE(c.prix_neuf, 5000) AS prix_neuf
        FROM player_fleet f
        LEFT JOIN equipment_catalog c ON c.id = f.catalog_id
        WHERE f.owner_id = $1
    `, [userId]);
    const loansRes = await clientDb.query(`SELECT * FROM player_loans WHERE user_id = $1 AND statut = 'EN_COURS' ORDER BY id ASC`, [userId]);
    const savingsRes = await clientDb.query(`SELECT * FROM player_savings WHERE user_id = $1 AND statut = 'BLOQUE' ORDER BY id ASC`, [userId]);

    const mine = mineRes.rows.at(0);
    const tresorerie = Math.max(0, parseFloat(mine.argent) || 0);
    const stockOr = parseFloat(mine.stock_or) || 0;
    const coursOr = mktRes.rows.length > 0 ? parseFloat(mktRes.rows.at(0).cours_or) : 60;
    const valeurOr = +(stockOr * coursOr).toFixed(2);

    let valeurFlotteNette = 0;
    for (const f of fleetRes.rows) {
        const prixNeuf = parseFloat(f.prix_neuf) || 0;
        const usure = Math.max(0, Math.min(100, parseFloat(f.usure_actuelle) || 0));
        valeurFlotteNette += prixNeuf * (1 - usure / 100);
    }
    valeurFlotteNette = +valeurFlotteNette.toFixed(2);

    const patrimoineTotal = +(tresorerie + valeurOr + valeurFlotteNette).toFixed(2);
    const ratioMax = parseFloat(cfg.ratioEndettementMax) || 0.33;
    const plafondEmprunt = Math.floor(patrimoineTotal * ratioMax);

    const detteActuelle = +loansRes.rows.reduce((acc, l) => acc + (parseFloat(l.restant_du) || 0), 0).toFixed(2);
    const capaciteRestante = Math.max(0, Math.floor(plafondEmprunt - detteActuelle));
    const hasDAF = Array.isArray(mine.cadres) && mine.cadres.includes('DAF');

    return {
        tresorerie,
        valeurOr,
        valeurFlotteNette,
        patrimoineTotal,
        ratioMax,
        plafondEmprunt,
        detteActuelle,
        capaciteRestante,
        hasDAF,
        banques: getCatalogueBanques(cfg, hasDAF),
        loans: loansRes.rows,
        savings: savingsRes.rows,
        tauxEpargne7j: parseFloat(cfg.tauxEpargne7j) || 0.03,
        tauxEpargne14j: parseFloat(cfg.tauxEpargne14j) || 0.07
    };
}

// 1. ÉTAT COMPLET DES BANQUES, EMPRUNTS & ÉPARGNE
router.get('/', requireAuth, async (req, res) => {
    try {
        const cfg = getGameConfig();
        const data = await calculerSituationFinanciere(pool, req.session.userId, cfg);
        res.json(data);
    } catch (err) {
        console.error('Erreur GET /api/bank :', err);
        res.status(500).json({ error: 'Erreur chargement module bancaire' });
    }
});

// 2. CONTRACTER UN EMPRUNT (PLAFOND 33% DU PATRIMOINE NET)
router.post('/borrow', requireAuth, async (req, res) => {
    const { banqueCode, montant, dureeJours } = req.body;
    const userId = req.session.userId;
    const cfg = getGameConfig();

    const mt = Math.round(parseFloat(montant) || 0);
    const duree = parseInt(dureeJours) || 7;
    if (mt < 500) return res.status(400).json({ error: 'Montant minimum d’emprunt : 500 €.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT user_id FROM mines WHERE user_id = $1 FOR UPDATE', [userId]);
        const userRes = await client.query('SELECT username FROM users WHERE id = $1', [userId]);
        const username = userRes.rows.at(0).username;

        const sit = await calculerSituationFinanciere(client, userId, cfg);
        const banque = sit.banques.find(b => b.code === banqueCode);
        if (!banque || !banque.durees.includes(duree)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Banque ou durée d’emprunt invalide.' });
        }

        const totalAvecInterets = +(mt * (1 + banque.tauxBase)).toFixed(2);
        if (totalAvecInterets > sit.capaciteRestante) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Plafond d'endettement (${Math.round(sit.ratioMax * 100)}% du patrimoine) dépassé ! Capacité disponible : ${sit.capaciteRestante.toLocaleString()} €.`
            });
        }

        const echeanceJour = +(totalAvecInterets / duree).toFixed(2);

        await client.query(
            `INSERT INTO player_loans (user_id, banque_code, banque_nom, montant_emprunte, taux_interet, total_a_rembourser, restant_du, echeance_jour, duree_jours, jours_restants, statut)
             VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $8, 'EN_COURS')`,
            [userId, banque.code, banque.nom, mt, banque.tauxBase, totalAvecInterets, echeanceJour, duree]
        );

        await client.query('UPDATE mines SET argent = argent + $1 WHERE user_id = $2', [mt, userId]);

        const msg = `🏦 Emprunt validé auprès de ${banque.nom} : +${mt.toLocaleString()} € reçus (Remboursement : ${Math.round(echeanceJour).toLocaleString()} €/j sur ${duree}j).`;
        await client.query(
            `INSERT INTO player_logs (user_id, username, category, details) VALUES ($1, $2, 'FINANCE', $3)`,
            [userId, username, msg]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: msg });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erreur POST /api/bank/borrow :', err);
        res.status(500).json({ error: 'Erreur lors de la demande de prêt' });
    } finally {
        client.release();
    }
});

// 3. REMBOURSEMENT ANTICIPÉ D'UN EMPRUNT
router.post('/repay', requireAuth, async (req, res) => {
    const { loanId } = req.body;
    const userId = req.session.userId;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const mineRes = await client.query('SELECT argent FROM mines WHERE user_id = $1 FOR UPDATE', [userId]);
        const userRes = await client.query('SELECT username FROM users WHERE id = $1', [userId]);
        const loanRes = await client.query(`SELECT * FROM player_loans WHERE id = $1 AND user_id = $2 AND statut = 'EN_COURS' FOR UPDATE`, [loanId, userId]);

        if (loanRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Emprunt introuvable ou déjà soldé.' });
        }

        const loan = loanRes.rows.at(0);
        const restant = parseFloat(loan.restant_du);
        const argent = parseFloat(mineRes.rows.at(0).argent);

        if (argent < restant) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Trésorerie insuffisante (${Math.round(restant).toLocaleString()} € requis pour solder ce prêt).` });
        }

        await client.query('UPDATE mines SET argent = argent - $1 WHERE user_id = $2', [restant, userId]);
        await client.query(`UPDATE player_loans SET restant_du = 0, jours_restants = 0, statut = 'SOLDE' WHERE id = $1`, [loanId]);

        const msg = `✅ Prêt ${loan.banque_nom} soldé par anticipation (-${Math.round(restant).toLocaleString()} €).`;
        await client.query(
            `INSERT INTO player_logs (user_id, username, category, details) VALUES ($1, $2, 'FINANCE', $3)`,
            [userId, userRes.rows.at(0).username, msg]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: msg });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Erreur remboursement anticipé' });
    } finally {
        client.release();
    }
});

// 4. OUVRIR UN PLACEMENT D'ÉPARGNE BLOQUÉE (7J OU 14J)
router.post('/save', requireAuth, async (req, res) => {
    const { montant, dureeJours } = req.body;
    const userId = req.session.userId;
    const cfg = getGameConfig();

    const mt = Math.round(parseFloat(montant) || 0);
    const duree = parseInt(dureeJours) === 14 ? 14 : 7;
    if (mt < 1000) return res.status(400).json({ error: 'Placement minimum : 1 000 €.' });

    const taux = duree === 14 ? (parseFloat(cfg.tauxEpargne14j) || 0.07) : (parseFloat(cfg.tauxEpargne7j) || 0.03);
    const gainFinal = +(mt * (1 + taux)).toFixed(2);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const mineRes = await client.query('SELECT argent FROM mines WHERE user_id = $1 FOR UPDATE', [userId]);
        const userRes = await client.query('SELECT username FROM users WHERE id = $1', [userId]);
        const argent = parseFloat(mineRes.rows.at(0).argent);

        if (argent < mt) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Trésorerie insuffisante pour ce placement.' });
        }

        await client.query('UPDATE mines SET argent = argent - $1 WHERE user_id = $2', [mt, userId]);
        await client.query(
            `INSERT INTO player_savings (user_id, banque_nom, montant_place, taux_rendement, gain_final, duree_jours, jours_restants, statut)
             VALUES ($1, '🏛️ Compte à Terme Minier', $2, $3, $4, $5, $5, 'BLOQUE')`,
            [userId, mt, taux, gainFinal, duree]
        );

        const msg = `📈 Placement bloqué ouvert : ${mt.toLocaleString()} € sur ${duree}j (+${Math.round(taux * 100)}% -> ${Math.round(gainFinal).toLocaleString()} € à l'échéance).`;
        await client.query(
            `INSERT INTO player_logs (user_id, username, category, details) VALUES ($1, $2, 'FINANCE', $3)`,
            [userId, userRes.rows.at(0).username, msg]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: msg });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Erreur création placement' });
    } finally {
        client.release();
    }
});

module.exports = router;
