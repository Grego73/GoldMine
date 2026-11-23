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

// Catalogue des 6 postes clés du Trombinoscope de Direction
const TROMBINOSCOPE_POSTES = [
    {
        code: 'DAF',
        poste: 'Directeur Administratif & Financier (DAF)',
        pole: 'Direction Générale & Finance',
        bonusDesc: '-2% sur la redevance minière lors des ventes d’or'
    },
    {
        code: 'GEOLOGUE',
        poste: 'Chef Géologue de Mine',
        pole: 'Exploration & Géologie',
        bonusDesc: '-30% sur le coût des carottages géologiques'
    },
    {
        code: 'METALLURGISTE',
        poste: 'Ingénieur Métallurgiste (Usine)',
        pole: 'Traitement du Minerai',
        bonusDesc: '+10% de rendement d’extraction d’or pur'
    },
    {
        code: 'MAINTENANCE',
        poste: 'Directeur de la Maintenance',
        pole: 'Maintenance & Infrastructures',
        bonusDesc: '-25% sur l’usure quotidienne de toute la flotte'
    },
    {
        code: 'HSE',
        poste: 'Directeur HSE & Sûreté',
        pole: 'Hygiène, Sécurité & Sûreté',
        bonusDesc: 'Divise par 2 le risque d’incidents quotidiens'
    },
    {
        code: 'RSE',
        poste: 'Responsable Relations Communautaires (RSE)',
        pole: 'Environnement & Communautés',
        bonusDesc: '+2 pts de notoriété marketing gratuits chaque jour'
    }
];

// 1. ÉTAT COMPLET DES RESSOURCES HUMAINES & TROMBINOSCOPE
router.get('/', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    try {
        const cfg = getGameConfig();
        const mineRes = await pool.query(
            'SELECT mineurs, conducteurs, mecaniciens, chefs_equipe, cadres FROM mines WHERE user_id = $1',
            [userId]
        );
        const m = mineRes.rows.at(0);

        // Nombre d'engins actifs (propriété + locations en cours)
        const fleetRes = await pool.query(`SELECT COUNT(*) FROM player_fleet WHERE owner_id = $1 AND statut = 'ACTIF'`, [userId]);
        const rentRes = await pool.query(`SELECT COUNT(*) FROM active_rentals WHERE renter_id = $1 AND statut = 'EN_COURS'`, [userId]);
        const nbEngins = parseInt(fleetRes.rows.at(0).count) + parseInt(rentRes.rows.at(0).count);

        const condActuels = parseInt(m.conducteurs) || 0;
        const mecaActuels = parseInt(m.mecaniciens) || 0;
        const chefsActuels = parseInt(m.chefs_equipe) || 0;

        const condRequis = nbEngins * (parseInt(cfg.conducteursRequisParEngin) || 2);
        const mecaRequis = nbEngins > 0 ? Math.ceil(nbEngins / (parseInt(cfg.enginsParMecano) || 3)) : 0;
        const totalOuvriers = condActuels + mecaActuels;
        const chefsRequis = totalOuvriers > 0 ? Math.ceil(totalOuvriers / (parseInt(cfg.ouvriersParChef) || 8)) : 0;

        const cadresRecrutes = Array.isArray(m.cadres) ? m.cadres : [];

        res.json({
            effectifs: {
                mineurs: parseInt(m.mineurs) || 0,
                conducteurs: condActuels,
                mecaniciens: mecaActuels,
                chefsEquipe: chefsActuels
            },
            requis: {
                nbEngins,
                conducteurs: condRequis,
                mecaniciens: mecaRequis,
                chefsEquipe: chefsRequis
            },
            tarifs: {
                coutConducteur: parseFloat(cfg.coutConducteur),
                salaireConducteurJour: parseFloat(cfg.salaireConducteurJour),
                coutMecano: parseFloat(cfg.coutMecano),
                salaireMecanoJour: parseFloat(cfg.salaireMecanoJour),
                coutChef: parseFloat(cfg.coutChef),
                salaireChefJour: parseFloat(cfg.salaireChefJour),
                coutCadre: parseFloat(cfg.coutRecrutementCadre),
                salaireCadreJour: parseFloat(cfg.salaireCadreJour),
                bonusCompletPct: parseFloat(cfg.bonusTrombinoscopeCompletPct)
            },
            trombinoscope: TROMBINOSCOPE_POSTES.map(p => ({
                ...p,
                recrute: cadresRecrutes.includes(p.code)
            })),
            trombinoscopeComplet: cadresRecrutes.length >= TROMBINOSCOPE_POSTES.length
        });
    } catch (err) {
        console.error('Erreur GET /api/hr :', err);
        res.status(500).json({ error: 'Erreur chargement Ressources Humaines' });
    }
});

// 2. RECRUTER OU LICENCIER UN OUVRIER (CONDUCTEUR / MÉCANO / CHEF)
router.post('/worker', requireAuth, async (req, res) => {
    const { roleType, action } = req.body; // roleType: 'conducteur' | 'mecano' | 'chef', action: 'hire' | 'fire'
    const userId = req.session.userId;
    const cfg = getGameConfig();

    const mapCols = {
        conducteur: { col: 'conducteurs', cout: parseFloat(cfg.coutConducteur), label: 'Conducteur d’engin' },
        mecano: { col: 'mecaniciens', cout: parseFloat(cfg.coutMecano), label: 'Mécanicien de maintenance' },
        chef: { col: 'chefs_equipe', cout: parseFloat(cfg.coutChef), label: 'Chef d’équipe' }
    };

    const target = mapCols[roleType];
    if (!target) return res.status(400).json({ error: 'Type de poste invalide.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const mineRes = await client.query(`SELECT argent, ${target.col} FROM mines WHERE user_id = $1 FOR UPDATE`, [userId]);
        const argent = parseFloat(mineRes.rows.at(0).argent);
        const actuel = parseInt(mineRes.rows.at(0)[target.col]) || 0;

        if (action === 'fire') {
            if (actuel <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Aucun salarié à licencier sur ce poste.' });
            }
            await client.query(`UPDATE mines SET ${target.col} = ${target.col} - 1 WHERE user_id = $1`, [userId]);
            await client.query('COMMIT');
            return res.json({ success: true, message: `1 ${target.label} licencié.` });
        }

        if (argent < target.cout) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Trésorerie insuffisante pour ce recrutement.' });
        }

        await client.query(`UPDATE mines SET argent = argent - $1, ${target.col} = ${target.col} + 1 WHERE user_id = $2`, [target.cout, userId]);
        await client.query('COMMIT');
        res.json({ success: true, message: `1 ${target.label} recruté (-${target.cout.toLocaleString()} €).` });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erreur /api/hr/worker :', err);
        res.status(500).json({ error: 'Erreur gestion effectif' });
    } finally {
        client.release();
    }
});

// 3. RECRUTER OU LICENCIER UN CADRE DU TROMBINOSCOPE
router.post('/cadre', requireAuth, async (req, res) => {
    const { code, action } = req.body;
    const userId = req.session.userId;
    const cfg = getGameConfig();
    const posteObj = TROMBINOSCOPE_POSTES.find(p => p.code === code);
    if (!posteObj) return res.status(400).json({ error: 'Poste de direction inconnu.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const mineRes = await client.query('SELECT argent, cadres FROM mines WHERE user_id = $1 FOR UPDATE', [userId]);
        const argent = parseFloat(mineRes.rows.at(0).argent);
        let cadres = Array.isArray(mineRes.rows.at(0).cadres) ? mineRes.rows.at(0).cadres : [];

        if (action === 'fire') {
            cadres = cadres.filter(c => c !== code);
            await client.query('UPDATE mines SET cadres = $1 WHERE user_id = $2', [JSON.stringify(cadres), userId]);
            await client.query('COMMIT');
            return res.json({ success: true, message: `${posteObj.poste} remercié.` });
        }

        if (cadres.includes(code)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Ce poste est déjà pourvu.' });
        }

        const cout = parseFloat(cfg.coutRecrutementCadre);
        if (argent < cout) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Trésorerie insuffisante pour recruter ce directeur.' });
        }

        cadres.push(code);
        await client.query('UPDATE mines SET argent = argent - $1, cadres = $2 WHERE user_id = $3', [cout, JSON.stringify(cadres), userId]);
        await client.query('COMMIT');
        res.json({ success: true, message: `👔 ${posteObj.poste} recruté (-${cout.toLocaleString()} €) !` });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erreur /api/hr/cadre :', err);
        res.status(500).json({ error: 'Erreur recrutement direction' });
    } finally {
        client.release();
    }
});

module.exports = { router, TROMBINOSCOPE_POSTES };
