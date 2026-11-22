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
        market = data.market;
        parcelles = data.mine.parcelles;

        document.getElementById('stat-username').innerText = data.user.username;
        if (data.user.role === 'admin') {
            document.getElementById('btn-admin-link').style.display = 'inline-flex';
        }

        const resLinks = await fetch('/api/links');
        const dataLinks = await resLinks.json();
        if (dataLinks.tchatgcUrl) {
            document.getElementById('link-tchatgc-game').href = dataLinks.tchatgcUrl;
        }

        // Libellés dynamiques depuis game_settings
        document.getElementById('info-heure-cloture').innerText = `${CONFIG.heureClotureJour}h00`;
        document.getElementById('info-cycle-heures').innerText = CONFIG.cycleMarcheHeures;
        document.getElementById('desc-mineur').innerText = `Extrait ${CONFIG.prodMineurTonnes}t/j | Salaire : ${CONFIG.salaireMineurJour} €/j`;
        document.getElementById('btn-embaucher').innerText = `Recruter (${CONFIG.coutMineur} €)`;
        document.getElementById('desc-foreuse').innerText = `Extrait ${CONFIG.prodForeuseTonnes}t/j | Carburant : ${CONFIG.carburantForeuseJour} €/j`;
        document.getElementById('btn-foreuse').innerText = `Acheter (${CONFIG.coutForeuse} €)`;
        document.getElementById('btn-reparer').innerText = `Réviser (${CONFIG.coutRevision} €)`;
        document.getElementById('btn-prime').innerText = `Prime (${CONFIG.coutPrime} €)`;
        document.getElementById('btn-marketing').innerText = `Campagne Marketing +10 pts (${CONFIG.coutUniteMarketing} €)`;
        document.getElementById('desc-prospection').innerText = `Carottage : ${CONFIG.coutCarottage} € | Déménagement engins : ${CONFIG.coutDemenagement} €`;
        document.getElementById('desc-taxe').innerText = `Redevance minière : ${Math.round(CONFIG.taxeMiniere * 100)}%`;

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

    dessinerCarte();
    dessinerClientsMarche();
}

function dessinerCarte() {
    const grid = document.getElementById('mapGrid');
    grid.innerHTML = '';
    parcelles.forEach(p => {
        const div = document.createElement('div');
        div.className = 'pit-tile' + (p.id === etat.parcelleActive ? ' active' : '') + (p.reserveReelle <= 0 ? ' depleted' : '');
        if (p.id === etat.parcelleActive) {
            div.innerHTML = `<div class="ui green label">ACTIF</div><h4 style="margin:4px 0; color:#fbbf24;">${p.nom}</h4><div>${Math.round(p.reserveReelle)} t (${p.pureteReelle}g/t)</div>`;
        } else if (p.estSondee) {
            div.innerHTML = `<div class="ui blue label">SONDÉ</div><h4 style="margin:4px 0;">${p.nom}</h4><div>Est: ~${p.estimationPurete} g/t</div><small style="color:#a8a29e;">Déplacer: ${CONFIG.coutDemenagement}€</small>`;
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
        const exp = new Date(market.clients.expires_at);
        const diffMkt = Math.max(0, Math.floor((exp - now) / 1000));
        const mh = String(Math.floor(diffMkt / 3600)).padStart(2, '0');
        const mm = String(Math.floor((diffMkt % 3600) / 60)).padStart(2, '0');
        const elMkt = document.getElementById('countdown-marche');
        if (elMkt) elMkt.innerText = `Renouvellement dans ${mh}h${mm}`;
    }
}, 1000);

chargerEtatJeu();
