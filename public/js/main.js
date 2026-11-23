let CONFIG = {};
let etat = {};
let market = {};
let parcelles = [];

// 1. GRAPHIQUE MAISON 100 % NATIF
function dessinerGraphiqueCours(historique) {
    const canvas = document.getElementById('chartCoursOr');
    if (!canvas || !historique || historique.length === 0) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.parentElement.clientWidth - 32;
    const h = canvas.height = 140;
    ctx.clearRect(0, 0, w, h);

    const vals = historique.map(p => parseFloat(p.cours));
    const pad = 34;
    const min = Math.min(...vals) * 0.97;
    const max = Math.max(...vals) * 1.03 || 1;
    const range = max - min || 1;

    ctx.strokeStyle = '#44403c';
    ctx.fillStyle = '#a8a29e';
    ctx.font = '10px sans-serif';
    for (let i = 0; i <= 2; i++) {
        const y = pad / 2 + (i / 2) * (h - pad - 10);
        const val = max - (i / 2) * range;
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(w - 10, y);
        ctx.stroke();
        ctx.fillText(val.toFixed(1) + '€', 2, y + 3);
    }

    const stepX = vals.length > 1 ? (w - pad - 15) / (vals.length - 1) : 0;
    const pts = vals.map((v, i) => ({
        x: pad + i * stepX,
        y: (pad / 2) + (1 - (v - min) / range) * (h - pad - 10)
    }));

    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.stroke();

    pts.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
        if (i === 0 || i === pts.length - 1 || pts.length <= 8) {
            ctx.fillStyle = '#a8a29e';
            ctx.fillText(historique[i].label, p.x - 10, h - 4);
        }
    });
}

function afficherToast(msg, isError = false) {
    const box = document.getElementById('game-toast');
    if (!box) return;
    box.className = isError ? 'ui red message' : 'ui green message';
    box.innerText = msg;
    box.style.display = 'block';
    setTimeout(() => { box.style.display = 'none'; }, 4000);
}

// 2. CHARGEMENT COMPLET DEPUIS LE SERVEUR
async function chargerEtatJeu() {
    try {
        const res = await fetch('/api/game/state');
        if (res.status === 401) {
            window.location.href = '/index.html';
            return;
        }
        const data = await res.json();
        CONFIG = data.config;
        etat = data.mine;
        etat.fleetAll = data.fleet || [];
        etat.rentalsAll = data.rentals || [];
        market = data.market;
        parcelles = data.mine.parcelles;

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        setTxt('stat-username', data.user.username);
        if (data.user.role === 'admin') {
            const btnAdm = document.getElementById('btn-admin-link');
            if (btnAdm) btnAdm.style.display = 'inline-flex';
        }

        const resLinks = await fetch('/api/links');
        const dataLinks = await resLinks.json();
        const linkTchat = document.getElementById('link-tchatgc-game');
        if (dataLinks.tchatgcUrl && linkTchat) {
            linkTchat.href = dataLinks.tchatgcUrl;
        }

        // Libellés dynamiques depuis game_settings (sécurisés si élément absent)
        setTxt('info-heure-cloture', `${CONFIG.heureClotureJour}h00`);
        setTxt('info-cycle-heures', CONFIG.cycleMarcheHeures);
        setTxt('desc-mineur', `Extrait ${CONFIG.prodMineurTonnes}t/j | Salaire : ${CONFIG.salaireMineurJour} €/j`);
        setTxt('btn-embaucher', `Recruter (${CONFIG.coutMineur} €)`);
        setTxt('desc-foreuse', `Extrait ${CONFIG.prodForeuseTonnes}t/j | Carburant : ${CONFIG.carburantForeuseJour} €/j`);
        setTxt('btn-foreuse', `Acheter (${CONFIG.coutForeuse} €)`);
        setTxt('btn-reparer', `Réviser (${CONFIG.coutRevision} €)`);
        setTxt('btn-prime', `Prime (${CONFIG.coutPrime} €)`);
        setTxt('btn-marketing', `Campagne Marketing +10 pts (${CONFIG.coutUniteMarketing} €)`);
        setTxt('desc-prospection', `Carottage : ${CONFIG.coutCarottage} € | Déménagement engins : ${CONFIG.coutDemenagement} €`);
        setTxt('desc-taxe', `Redevance minière : ${Math.round(CONFIG.taxeMiniere * 100)}%`);

        const selectCadence = document.getElementById('cadence');
        if (selectCadence) selectCadence.value = String(etat.cadence);

        majAffichage(data.logs);
        dessinerGraphiqueCours(market.historique);

        if (etat.pendingEvent) {
            afficherModaleEvenement(etat.pendingEvent);
        }
    } catch (err) {
        console.error('Erreur chargement jeu :', err);
    }
}

function majAffichage(logs = null) {
    const pActive = parcelles[etat.parcelleActive] || parcelles[0];
    document.getElementById('stat-jour').innerText = etat.jour;
    document.getElementById('stat-argent').innerText = Math.round(etat.argent).toLocaleString() + ' €';
    document.getElementById('stat-stock').innerText = Math.round(etat.stockOr).toLocaleString() + ' g';
    document.getElementById('stat-cours').innerText = market.coursOr.toFixed(2) + ' €/g';
    document.getElementById('stat-mkt').innerText = Math.round(etat.marketingPoints) + ' pts';

    document.getElementById('kpi-reserve').innerText = Math.round(pActive.reserveReelle).toLocaleString() + ' t';
    document.getElementById('kpi-purete').innerText = pActive.pureteReelle + ' g/t';
    document.getElementById('kpi-engins').innerText = etat.foreuses;
    document.getElementById('kpi-moral').innerText = Math.round(etat.moral) + '%';
    document.getElementById('kpi-usure').innerText = Math.round(etat.usure) + '%';

    document.getElementById('exp-mineurs').innerText = etat.mineurs;
    document.getElementById('exp-foreuses').innerText = etat.foreuses;
    document.getElementById('exp-usure').innerText = Math.round(etat.usure) + '%';

    document.getElementById('coffre-grammes').innerText = Math.round(etat.stockOr).toLocaleString() + ' g';
    document.getElementById('mkt-my').innerText = etat.marketingPoints.toFixed(1) + ' pts';
    document.getElementById('mkt-avg').innerText = market.moyenneMarketingSecteur + ' pts';
    document.getElementById('mkt-max').innerText = market.leaderMarketingSecteur + ' pts';
    document.getElementById('mkt-ratio').innerText = market.ratioMarketing + 'x';
    document.getElementById('mkt-etude-statut').innerHTML = market.etudeDebloquee
        ? '<span class="ui green label">Débloquée (Infos clients visibles)</span>'
        : `<span class="ui orange label">Requis : ${CONFIG.seuilEtudeMarche} pts</span>`;

    if (pActive.reserveReelle < 250) {
        document.getElementById('conseil-assistante').innerText = '« Attention Patron, notre fosse actuelle est presque épuisée avant la prochaine clôture. »';
    } else if (etat.usure > 60) {
        document.getElementById('conseil-assistante').innerText = `« Nos engins sont usés à ${Math.round(etat.usure)}%. Une révision évitera une panne coûteuse à ${CONFIG.heureClotureJour}h00. »`;
    } else {
        document.getElementById('conseil-assistante').innerText = `« Chantier opérationnel. Prochaine extraction automatique à ${CONFIG.heureClotureJour}h00. »`;
    }

    if (logs) {
        const box = document.getElementById('journal-log');
        box.innerHTML = logs.map(l => {
            const h = new Date(l.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            return `<div><span style="color:#fbbf24;">[${h}]</span> ${l.details}</div>`;
        }).join('');
    }
    const elFraisSem = document.getElementById('kpi-frais-semaine');
    const elFacture = document.getElementById('kpi-facture-attente');
    const btnFacture = document.getElementById('btn-payer-facture');
    if (elFraisSem) elFraisSem.innerText = `${Math.round(etat.fraisSemaine || 0).toLocaleString()} €`;
    if (elFacture) elFacture.innerText = `${Math.round(etat.factureEnAttente || 0).toLocaleString()} €`;
    if (btnFacture) btnFacture.style.display = (etat.factureEnAttente || 0) > 0 ? 'inline-block' : 'none';

    afficherTutoriel();
    dessinerCarte();
    dessinerClientsMarche();
    if (typeof rendreChantierSecteur === 'function') rendreChantierSecteur(secteurInspecteIdx);

}

function allerVersMissionTutoriel(ongletCible) {
    const navItems = document.querySelectorAll('.mine-nav .item');
    let menuEl = navItems.at(0);
    if (ongletCible === 'materiel') menuEl = document.getElementById('nav-materiel');
    if (ongletCible === 'prospection') menuEl = navItems.at(2);
    if (ongletCible === 'marche') menuEl = navItems.at(3);

    changerOnglet(ongletCible, menuEl);
    if (ongletCible === 'materiel' && typeof chargerModuleMateriel === 'function') {
        chargerModuleMateriel();
    }
}

function afficherTutoriel() {
    const banner = document.getElementById('tutorial-banner');
    if (!banner) return;

    const step = parseInt(etat.tutorialStep) || 1;
    if (step > 5) {
        banner.style.display = 'none';
        return;
    }

    const primeBase = parseFloat(CONFIG.recompenseTutorielEtape) || 0;
    const mults = [1, 1, 1.5, 1.5, 2.5];
    const gain = Math.round(primeBase * (mults.at(step - 1) || 1));

    const nbSondees = Array.isArray(parcelles) ? parcelles.filter(p => p.estSondee).length : 0;

    const missions = [
        {
            titre: 'Prospection géologique',
            desc: 'Allez dans l’onglet Prospection et sondez au moins 1 nouvelle parcelle vierge.',
            pret: nbSondees >= 2,
            onglet: 'prospection'
        },
        {
            titre: 'Renforcer l’équipe',
            desc: 'Recrutez au moins 1 mineur supplémentaire (objectif : 6 mineurs actifs).',
            pret: (parseInt(etat.mineurs) || 0) >= 6,
            onglet: 'mine'
        },
        {
            titre: 'Équiper la flotte',
            desc: 'Achetez un 2e engin neuf dans Matériel (objectif : 2 engins en flotte).',
            pret: (parseInt(etat.foreuses) || 0) >= 2,
            onglet: 'materiel'
        },
        {
            titre: 'Notoriété commerciale',
            desc: 'Lancez une campagne marketing dans Bourse & Clients (objectif : 20 pts).',
            pret: (parseFloat(etat.marketingPoints) || 0) >= 20,
            onglet: 'marche'
        },
        {
            titre: 'Première vente d’or',
            desc: 'Vendez votre stock d’or à un acheteur international dans Bourse & Clients.',
            pret: true,
            onglet: 'marche'
        }
    ];

    const m = missions.at(step - 1);
    document.getElementById('tuto-badge').innerText = `🎓 Tutoriel ${step} / 5`;
    document.getElementById('tuto-title').innerText = `${m.titre} — Récompense : +${gain.toLocaleString()} €`;
    document.getElementById('tuto-desc').innerText = m.desc;

    const btnAction = document.getElementById('btn-tuto-action');
    if (btnAction) {
        if (m.pret) {
            btnAction.className = 'ui green button';
            btnAction.innerText = '🎁 Valider & Encaisser';
            btnAction.onclick = () => reclamerTutoriel();
        } else {
            btnAction.className = 'ui yellow button';
            btnAction.innerText = '👉 Voir';
            btnAction.onclick = () => allerVersMissionTutoriel(m.onglet);
        }
    }

    banner.style.display = 'block';
}


async function reclamerTutoriel() {
    const res = await fetch('/api/game/claim-tutorial', { method: 'POST' });
    const data = await res.json();
    afficherToast(data.message || data.error, !data.success);
    if (data.success) await chargerEtatJeu();
}

function dessinerCarte() {
    const grid = document.getElementById('mapGrid');
    if (!grid) return;
    grid.innerHTML = '';
    parcelles.forEach((p, i) => {
        const div = document.createElement('div');
        div.className = 'pit-tile' + (p.id === etat.parcelleActive ? ' active' : '') + (p.reserveReelle <= 0 ? ' depleted' : '');
        if (p.id === etat.parcelleActive) {
            div.innerHTML = `<div class="ui green label">ACTIF</div><h4 style="margin:4px 0; color:#fbbf24;">${p.nom}</h4><div>${Math.round(p.reserveReelle)} t (${p.pureteReelle}g/t)</div><button class="ui mini yellow button" style="margin-top:6px;" onclick="event.stopPropagation(); ouvrirChantierSecteur(${i})">🏗️ Gérer le chantier</button>`;
        } else if (p.estSondee) {
            div.innerHTML = `<div class="ui blue label">SONDÉ</div><h4 style="margin:4px 0;">${p.nom}</h4><div>Est: ~${p.estimationPurete} g/t</div><small style="color:#a8a29e;">Déplacer: ${CONFIG.coutDemenagement}€</small><br><button class="ui mini yellow button" style="margin-top:6px;" onclick="event.stopPropagation(); ouvrirChantierSecteur(${i})">🏗️ Gérer le chantier</button>`;
        } else {
            div.innerHTML = `<div class="ui label">VIERGE</div><h4 style="margin:4px 0; color:#a8a29e;">${p.nom}</h4><small>Sonder: ${CONFIG.coutCarottage}€</small>`;
        }
        div.onclick = () => actionMine('parcelle', p.id);
        grid.appendChild(div);
    });
}


function majSliderMarge() {
    const val = parseInt(document.getElementById('negoc-marge').value);
    document.getElementById('negoc-marge-label').innerText = (val > 0 ? '+' : '') + val + '%';
    dessinerClientsMarche();
}

function dessinerClientsMarche() {
    const tbody = document.getElementById('clients-list');
    if (!tbody || !market.clients) return;

    const margePct = parseInt(document.getElementById('negoc-marge').value) || 0;
    const marge = margePct / 100;

    tbody.innerHTML = market.clients.map(c => {
        const prixOffre = (c.prix_base_gramme * (1 + marge)).toFixed(2);
        const maxVendable = Math.min(Math.floor(etat.stockOr), Math.floor(c.demande_grammes));

        let badgeType = 'blue';
        if (c.type_client === 'Particulier') badgeType = 'green';
        if (c.type_client === 'Événementiel') badgeType = 'orange';

        const infoEtude = market.etudeDebloquee && c.marge_acceptee_max !== null
            ? `<span class="money-text">Tolérance : +${Math.round(c.marge_acceptee_max * 100)}%</span>`
            : `<span style="color:#78716c;">🔒 Étude requise</span>`;

        return `
            <tr>
                <td><strong>${c.nom}</strong></td>
                <td><span class="ui ${badgeType} label">${c.type_client}</span></td>
                <td>${c.secteur}</td>
                <td><strong>${Math.round(c.demande_grammes).toLocaleString()} g</strong></td>
                <td>${c.prix_base_gramme.toFixed(2)} €/g</td>
                <td class="gold-text">${prixOffre} €/g</td>
                <td>${infoEtude}</td>
                <td>
                    <div class="ui action input" style="min-width: 140px;">
                        <input type="number" id="qte-client-${c.id}" min="1" max="${maxVendable}" value="${maxVendable > 0 ? maxVendable : ''}" placeholder="g">
                        <button class="ui yellow mini button" onclick="vendreAuClient(${c.id})" ${maxVendable <= 0 ? 'disabled' : ''}>Vendre</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function actionMine(type, payload = null) {
    const res = await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, payload })
    });
    const data = await res.json();
    if (data.success) {
        afficherToast(data.message, false);
        await chargerEtatJeu();
    } else {
        afficherToast(data.error, true);
    }
}

async function vendreAuClient(clientId) {
    const input = document.getElementById('qte-client-' + clientId);
    const quantiteGrammes = parseFloat(input.value);
    const margeDemandee = (parseInt(document.getElementById('negoc-marge').value) || 0) / 100;

    const res = await fetch('/api/game/sell-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, quantiteGrammes, margeDemandee })
    });
    const data = await res.json();
    afficherToast(data.message || data.error, !data.success);
    await chargerEtatJeu();
}

function afficherModaleEvenement(ev) {
    const modal = document.getElementById('eventModal');
    document.getElementById('eventTitle').innerText = '⚠️ ' + ev.titre;
    document.getElementById('eventDesc').innerText = ev.desc;
    const choicesDiv = document.getElementById('eventChoices');
    choicesDiv.innerHTML = '';

    ev.choix.forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'ui fluid yellow button';
        btn.innerText = c.texte;
        btn.onclick = async () => {
            await fetch('/api/game/event-choice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ choiceId: c.id })
            });
            modal.classList.remove('open');
            await chargerEtatJeu();
        };
        choicesDiv.appendChild(btn);
    });
    modal.classList.add('open');
}

function changerOnglet(nomOnglet, elMenu) {
    document.querySelectorAll('.tab-section').forEach(el => el.style.display = 'none');
    document.getElementById('tab-' + nomOnglet).style.display = 'block';
    document.querySelectorAll('.mine-nav .item').forEach(el => el.classList.remove('active'));
    elMenu.classList.add('active');
}

async function chargerClassement() {
    const res = await fetch('/api/game/ranking');
    if (!res.ok) return;
    const joueurs = await res.json();
    document.getElementById('ranking-list').innerHTML = joueurs.map((j, idx) => `
        <tr>
            <td><strong>#${idx + 1}</strong></td>
            <td>${j.username}</td>
            <td>J${j.jour}</td>
            <td class="money-text">${Math.round(j.argent).toLocaleString()} €</td>
            <td class="gold-text">${Math.round(j.stock_or).toLocaleString()} g</td>
            <td>${j.foreuses}</td>
            <td>${Math.round(j.marketing_points || 10)} pts</td>
        </tr>
    `).join('');
}

async function deconnexion() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/index.html';
}

setInterval(() => {
    if (CONFIG.heureClotureJour === undefined) return;
    const now = new Date();
    const cibleCloture = new Date();
    cibleCloture.setHours(CONFIG.heureClotureJour, 0, 0, 0);
    if (now >= cibleCloture) cibleCloture.setDate(cibleCloture.getDate() + 1);
    const diffSec = Math.floor((cibleCloture - now) / 1000);
    const h = String(Math.floor(diffSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
    const elCloture = document.getElementById('countdown-cloture');
    if (elCloture) elCloture.innerText = `⏳ Clôture : ${h}h${m}`;

    if (market.clients && market.clients.length > 0) {
        const exp = new Date(market.clients.at(0).expires_at);
        const diffMkt = Math.max(0, Math.floor((exp - now) / 1000));
        const mh = String(Math.floor(diffMkt / 3600)).padStart(2, '0');
        const mm = String(Math.floor((diffMkt % 3600) / 60)).padStart(2, '0');
        const elMkt = document.getElementById('countdown-marche');
        if (elMkt) elMkt.innerText = `Renouvellement dans ${mh}h${mm}`;
    }

}, 1000);

let secteurInspecteIdx = 0;

function ouvrirChantierSecteur(idx) {
    secteurInspecteIdx = idx;
    rendreChantierSecteur(idx);
}

function rendreChantierSecteur(idx) {
    const panel = document.getElementById('sector-chantier-panel');
    if (!panel || !Array.isArray(parcelles)) return;

    const p = parcelles.at(idx);
    if (!p || !p.estSondee) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    document.getElementById('sector-chantier-title').innerText = `🏗️ Chantier — ${p.nom} (Pureté : ${p.pureteReelle} g/t | Réserve : ${Math.round(p.reserveReelle).toLocaleString()} t)`;

    const fleetAll = [
        ...(Array.isArray(etat.fleetAll) ? etat.fleetAll : []).map(f => ({ ...f, targetType: 'FLEET' })),
        ...(Array.isArray(etat.rentalsAll) ? etat.rentalsAll : []).map(r => ({ ...r, targetType: 'RENTAL' }))
    ];

    const affectes = fleetAll.filter(e => parseInt(e.parcelle_index) === idx);
    const autres = fleetAll.filter(e => parseInt(e.parcelle_index) !== idx);

    // Calcul des 4 débits horaires (t/h)
    const debits = { Excavation: 0, Transport: 0, Traitement: 0, Lavage: 0 };
    for (const e of affectes) {
        const v = parseFloat(e.vitesse_reglee_th) || 45;
        const cat = (e.categorie || '').toLowerCase();
        if (cat.includes('transport')) debits.Transport += v;
        else if (cat.includes('traitement')) debits.Traitement += v;
        else if (cat.includes('lavage')) debits.Lavage += v;
        else debits.Excavation += v;
    }

    const debitReel = Math.min(debits.Excavation, debits.Transport, debits.Traitement, debits.Lavage);
    const maillons = [
        { nom: '⛏️ Excavation', val: debits.Excavation },
        { nom: '🚛 Transport', val: debits.Transport },
        { nom: '⚙️ Traitement', val: debits.Traitement },
        { nom: '💧 Lavage', val: debits.Lavage }
    ];

    document.getElementById('sector-debits-grid').innerHTML = maillons.map(m => {
        const isMin = m.val === debitReel;
        return `
            <div class="ui inverted segment" style="border-bottom: 3px solid ${m.val === 0 ? '#ef4444' : isMin ? '#fbbf24' : '#34d399'};">
                <div style="font-size:0.88em; color:#a8a29e;">${m.nom}</div>
                <div style="font-size:1.3em; font-weight:800; color:${m.val === 0 ? '#f87171' : '#fbbf24'};">${m.val} t/h</div>
                <div style="font-size:0.8em; color:#d6d3d1;">${isMin ? '⚠️ Maillon limitant' : '✅ Capacité suffisante'}</div>
            </div>
        `;
    }).join('');

    const alertEl = document.getElementById('sector-bottleneck-alert');
    if (debitReel <= 0) {
        alertEl.innerHTML = `<span class="ui red label">🚨 Chaîne incomplète (0 t/h) : affectez au moins 1 engin dans chaque famille (Excavation, Transport, Traitement, Lavage) sur ce secteur !</span>`;
    } else {
        const orHeure = +(debitReel * p.pureteReelle).toFixed(1);
        alertEl.innerHTML = `<span class="ui green label">✅ Débit effectif de la chaîne : ${debitReel} t/h (~${orHeure} g d'or brut / heure)</span>`;
    }

    // Tableau des engins affectés avec variateur de vitesse (t/h)
    const tbody = document.getElementById('sector-assigned-tbody');
    if (affectes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#a8a29e;">Aucun engin affecté à ce secteur.</td></tr>';
    } else {
        const optionsSecteurs = parcelles.map((sec, sIdx) => sec.estSondee ? `<option value="${sIdx}" ${sIdx === idx ? 'selected' : ''}>${sec.nom}</option>` : '').join('');
        tbody.innerHTML = affectes.map(e => {
            const vMin = parseFloat(e.vitesse_min_th) || 30;
            const vMax = parseFloat(e.vitesse_max_th) || 60;
            const vReg = parseFloat(e.vitesse_reglee_th) || vMin;
            const pct = Math.round((vReg / vMax) * 100);
            return `
                <tr>
                    <td><strong>${e.nom}</strong><br><small style="color:#a8a29e;">${e.categorie} (${e.gabarit || 'Moyen'})</small></td>
                    <td>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <input type="number" id="spd-${e.targetType}-${e.id}" min="${vMin}" max="${vMax}" value="${vReg}" style="width:72px; padding:4px;">
                            <span>t/h (${pct}%)</span>
                            <button class="ui mini yellow button" onclick="reglerVitesseEngin('${e.targetType}', ${e.id}, document.getElementById('spd-${e.targetType}-${e.id}').value)">OK</button>
                        </div>
                        <small style="color:#a8a29e;">Plage : ${vMin} à ${vMax} t/h</small>
                    </td>
                    <td>Usure : <strong>${Math.round(e.usure_actuelle || 0)}%</strong></td>
                    <td>
                        <select onchange="affecterEnginSecteur('${e.targetType}', ${e.id}, this.value)">
                            ${optionsSecteurs}
                        </select>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Boutons pour affecter rapidement un engin depuis un autre secteur
    const availEl = document.getElementById('sector-available-fleet');
    if (autres.length === 0) {
        availEl.innerHTML = '<span style="color:#a8a29e; font-size:0.9em;">Tous vos engins actifs sont déjà sur ce secteur.</span>';
    } else {
        availEl.innerHTML = autres.map(e => `
            <button class="ui mini blue button" onclick="affecterEnginSecteur('${e.targetType}', ${e.id}, ${idx})">
                ➕ ${e.nom} (${e.categorie} - ${e.vitesse_reglee_th} t/h)
            </button>
        `).join('');
    }
}

async function reglerVitesseEngin(targetType, targetId, vitesseTh) {
    const res = await fetch('/api/equipment/set-speed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, vitesseTh })
    });
    const data = await res.json();
    afficherToast(data.message || data.error, !data.success);
    if (data.success) await chargerEtatJeu();
}

async function affecterEnginSecteur(targetType, targetId, parcelleIndex) {
    const res = await fetch('/api/equipment/assign-sector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, parcelleIndex })
    });
    const data = await res.json();
    afficherToast(data.message || data.error, !data.success);
    if (data.success) await chargerEtatJeu();
}


chargerEtatJeu();
