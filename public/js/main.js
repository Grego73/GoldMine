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
            ctx.fillText(historique.at(i).label, p.x - 10, h - 4);
        }
    });
}

function afficherToast(msg, isError = false) {
    const box = document.getElementById('game-toast');
    if (!box) return;
    box.className = isError ? 'ui red message' : 'ui green message';
    box.style.position = 'fixed';
    box.style.top = '16px';
    box.style.left = '16px';
    box.style.transform = 'none';
    box.style.bottom = 'auto';
    box.style.right = 'auto';
    box.style.margin = '0';
    box.style.zIndex = '10000';
    box.style.maxWidth = '420px';
    box.style.width = 'auto';
    box.style.textAlign = 'left';
    box.style.pointerEvents = 'none';
    box.style.backgroundColor = isError ? 'rgba(153, 27, 27, 0.95)' : 'rgba(6, 95, 70, 0.95)';
    box.style.borderRadius = '8px';
    box.style.padding = '12px 18px';
    box.style.fontWeight = '700';
    box.style.boxShadow = '0 8px 24px rgba(0,0,0,0.8)';
    box.innerText = msg;
    box.style.display = 'block';
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => { box.style.display = 'none'; }, 4500);
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
    const pActive = parcelles.at(etat.parcelleActive) || parcelles.at(0);
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

    const elOrJour = document.getElementById('stat-or-jour');
    if (elOrJour) elOrJour.innerText = `+${(parseFloat(etat.orAujourdhui) || 0).toLocaleString()} g`;

    const nbMineurs = parseInt(etat.mineurs) || 0;
    const totalTonnesMineurs = +(nbMineurs * (parseFloat(CONFIG.prodMineurTonnes) || 1.5)).toFixed(1);
    const totalSalaireMineurs = Math.round(nbMineurs * (parseFloat(CONFIG.salaireMineurJour) || 120));
    const elTotalMineur = document.getElementById('desc-mineur-total');
    if (elTotalMineur) {
        const stActif = calculerStatsSecteur(etat.parcelleActive);
        const cadenceVal = parseFloat(etat.cadence) || 1;
        const moralVal = parseFloat(etat.moral) || 100;
        const cadresList = Array.isArray(etat.cadres) ? etat.cadres : [];
        let multOr = 1.0;
        if (cadresList.includes('METALLURGISTE')) multOr += 0.10;
        if (cadresList.length >= 6) multOr += (parseFloat(CONFIG.bonusTrombinoscopeCompletPct) || 0.15);

        const conducteurs = parseInt(etat.conducteurs) || 0;
        const mecaniciens = parseInt(etat.mecaniciens) || 0;
        const chefsEquipe = parseInt(etat.chefsEquipe) || 0;
        const totalOuvriers = conducteurs + mecaniciens;
        const chefsRequis = totalOuvriers > 0 ? Math.ceil(totalOuvriers / (parseInt(CONFIG.ouvriersParChef) || 8)) : 0;
        const multProdChef = chefsEquipe < chefsRequis ? (1 - (parseFloat(CONFIG.malusManqueChefPct) || 0.20)) : 1.0;

        const debitReelMineursTh = +(stActif.debitMineurs * multProdChef).toFixed(2);
        const pureteAct = parseFloat(pActive.pureteReelle) || 0;
        const orMineursHeure = +(debitReelMineursTh * pureteAct * multOr).toFixed(2);
        const orMineursJour = +(orMineursHeure * 24).toFixed(1);

        let infoExtraction = '';
        if (stActif.estEnDecapage) {
            infoExtraction = `<span style="color:#fb923c;">🚧 En pause (décapage des terres stériles en cours sur ${pActive.nom})</span>`;
        } else if (moralVal < 25) {
            infoExtraction = `<span style="color:#f87171;">🚨 Grève (moral &lt; 25%) : 0 g/h</span>`;
        } else {
            infoExtraction = `<span style="color:#34d399;">⛏️ Extraction réelle : <strong>${debitReelMineursTh} t/h</strong> (≈ <strong>${orMineursHeure} g/h</strong> | <strong>${orMineursJour} g/j</strong> à ${pureteAct} g/t, cadence ${cadenceVal}x, moral ${Math.round(moralVal)}%)</span>`;
        }

        elTotalMineur.innerHTML = `
            <div>📊 Total équipe (${nbMineurs} mineurs) : ${totalTonnesMineurs} t/j théorique | Masse salariale : ${totalSalaireMineurs.toLocaleString()} €/j</div>
            <div style="margin-top:3px;">${infoExtraction}</div>
        `;
    }

    document.getElementById('exp-foreuses').innerText = etat.foreuses;
    document.getElementById('exp-usure').innerText = Math.round(etat.usure) + '%';

    const btnEmb = document.getElementById('btn-embaucher');
    if (btnEmb) {
        if ((parseInt(etat.mineurs) || 0) >= 10) {
            btnEmb.disabled = true;
            btnEmb.innerText = 'Plafond atteint (10/10)';
        } else {
            btnEmb.disabled = false;
            btnEmb.innerText = `Recruter (${CONFIG.coutMineur} €)`;
        }
    }

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

    rendreDetailFrais();
    afficherTutoriel();
    dessinerCarte();
    dessinerClientsMarche();
    if (typeof rendreChantierSecteur === 'function') rendreChantierSecteur(secteurInspecteIdx);
}

function toggleDetailFrais() {
    const box = document.getElementById('detail-frais-box');
    if (!box) return;
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
    rendreDetailFrais();
}

function rendreDetailFrais() {
    const box = document.getElementById('detail-frais-box');
    if (!box || box.style.display === 'none') return;

    const mineurs = parseInt(etat.mineurs) || 0;
    const conducteurs = parseInt(etat.conducteurs) || 0;
    const mecaniciens = parseInt(etat.mecaniciens) || 0;
    const chefsEquipe = parseInt(etat.chefsEquipe) || 0;
    const cadres = Array.isArray(etat.cadres) ? etat.cadres : [];

    const salMineursJ = mineurs * (parseFloat(CONFIG.salaireMineurJour) || 120);
    const salCondJ = conducteurs * (parseFloat(CONFIG.salaireConducteurJour) || 160);
    const salMecaJ = mecaniciens * (parseFloat(CONFIG.salaireMecanoJour) || 210);
    const salChefsJ = chefsEquipe * (parseFloat(CONFIG.salaireChefJour) || 320);
    const salCadresJ = cadres.length * (parseFloat(CONFIG.salaireCadreJour) || 550);
    const totalSalairesJ = salMineursJ + salCondJ + salMecaJ + salChefsJ + salCadresJ;

    const fleetAll = [
        ...(Array.isArray(etat.fleetAll) ? etat.fleetAll : []).map(f => ({ ...f, _kind: 'FLEET' })),
        ...(Array.isArray(etat.rentalsAll) ? etat.rentalsAll : []).map(r => ({ ...r, _kind: 'RENTAL' }))
    ].sort((a, b) => (parseFloat(b.vitesse_reglee_th) || 3) - (parseFloat(a.vitesse_reglee_th) || 3));

    const estFixe = (cat) => {
        const c = (cat || '').toLowerCase();
        return c.includes('trém') || c.includes('trem') || c.includes('convoy') || c.includes('traitement') || c.includes('lavage');
    };

    let condDispo = conducteurs;
    let mecaDispo = mecaniciens;
    const reqCond = parseInt(CONFIG.conducteursRequisParEngin) || 2;

    let carburantJ = 0;
    let loyersJ = 0;

    for (const item of fleetAll) {
        let ratio = 0;
        if (estFixe(item.categorie)) {
            if (mecaDispo >= 1) { mecaDispo -= 1; ratio = 1; }
        } else {
            const aff = Math.min(reqCond, condDispo);
            condDispo -= aff;
            ratio = aff / reqCond;
        }
        const vReg = parseFloat(item.vitesse_reglee_th) || 3;
        const vMax = parseFloat(item.vitesse_max_th) || 5;
        const ratioVit = Math.max(0.1, vReg / vMax);

        if (ratio > 0) {
            carburantJ += (parseFloat(item.carburant_jour) || 0) * ratioVit * ratio;
        }
        if (item._kind === 'RENTAL') {
            loyersJ += (parseFloat(item.loyer_jour) || 0);
        }
    }

    const totalJour = totalSalairesJ + carburantJ + loyersJ;
    const totalHeure = totalJour / 24;

    box.innerHTML = `
        <div style="font-weight:700; color:#fbbf24; margin-bottom:6px;">📋 Ventilation des charges d'exploitation :</div>
        <div style="display:grid; grid-template-columns:1fr auto; gap:4px 12px;">
            <span>⛏️ Orpailleurs (${mineurs}) :</span><strong>${Math.round(salMineursJ).toLocaleString()} €/j (${(salMineursJ / 24).toFixed(2)} €/h)</strong>
            <span>🚜 Conducteurs (${conducteurs}) :</span><strong>${Math.round(salCondJ).toLocaleString()} €/j (${(salCondJ / 24).toFixed(2)} €/h)</strong>
            <span>🔧 Mécaniciens (${mecaniciens}) :</span><strong>${Math.round(salMecaJ).toLocaleString()} €/j (${(salMecaJ / 24).toFixed(2)} €/h)</strong>
            <span>👷 Chefs d'équipe (${chefsEquipe}) :</span><strong>${Math.round(salChefsJ).toLocaleString()} €/j (${(salChefsJ / 24).toFixed(2)} €/h)</strong>
            <span>🏛️ Directeurs / Cadres (${cadres.length}) :</span><strong>${Math.round(salCadresJ).toLocaleString()} €/j (${(salCadresJ / 24).toFixed(2)} €/h)</strong>
            <span>⛽ Carburant engins actifs :</span><strong>${Math.round(carburantJ).toLocaleString()} €/j (${(carburantJ / 24).toFixed(2)} €/h)</strong>
            <span>🤝 Loyers locations :</span><strong>${Math.round(loyersJ).toLocaleString()} €/j (${(loyersJ / 24).toFixed(2)} €/h)</strong>
        </div>
        <div style="margin-top:8px; padding-top:6px; border-top:1px solid #44403c; display:flex; justify-content:space-between; color:#fbbf24;">
            <span>Rythme actuel : <strong>${totalHeure.toFixed(2)} €/h</strong> (${Math.round(totalJour).toLocaleString()} €/j)</span>
            <span>Cumul semaine : <strong>${Math.round(etat.fraisSemaine || 0).toLocaleString()} €</strong></span>
        </div>
    `;
}

function allerVersMissionTutoriel(ongletCible) {
    const navItems = Array.from(document.querySelectorAll('.mine-nav .item'));
    const menuEl = navItems.find(el => (el.getAttribute('onclick') || '').includes(`'${ongletCible}'`)) || navItems.at(0);

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
            pret: false,
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

function calculerStatsSecteur(idx) {
    const p = parcelles.at(idx);
    const fleetAll = [
        ...(Array.isArray(etat.fleetAll) ? etat.fleetAll : []).map(f => ({ ...f, targetType: 'FLEET' })),
        ...(Array.isArray(etat.rentalsAll) ? etat.rentalsAll : []).map(r => ({ ...r, targetType: 'RENTAL' }))
    ];
    const affectes = fleetAll.filter(e => parseInt(e.parcelle_index) === idx);

    const debits = { Decapage: 0, Excavation: 0, Transport: 0, Chargement: 0, Tremie: 0, Convoyeur: 0, Traitement: 0, Lavage: 0 };
    const counts = { Decapage: 0, Excavation: 0, Transport: 0, Chargement: 0, Tremie: 0, Convoyeur: 0, Traitement: 0, Lavage: 0 };

    for (const e of affectes) {
        const v = parseFloat(e.vitesse_reglee_th) || 0;
        const cat = (e.categorie || '').toLowerCase();
        if (cat.includes('forag') || cat.includes('levag') || cat.includes('grue')) continue;
        if (cat.includes('décap') || cat.includes('decap')) { debits.Decapage += v; counts.Decapage += 1; }
        else if (cat.includes('transport')) { debits.Transport += v; counts.Transport += 1; }
        else if (cat.includes('charg')) { debits.Chargement += v; counts.Chargement += 1; }
        else if (cat.includes('trém') || cat.includes('trem')) { debits.Tremie += v; counts.Tremie += 1; }
        else if (cat.includes('convoy')) { debits.Convoyeur += v; counts.Convoyeur += 1; }
        else if (cat.includes('traitement')) { debits.Traitement += v; counts.Traitement += 1; }
        else if (cat.includes('lavage')) { debits.Lavage += v; counts.Lavage += 1; }
        else { debits.Excavation += v; counts.Excavation += 1; }
    }

    const debitDecapage = Math.min(debits.Decapage, debits.Excavation, debits.Transport);
    const estEnDecapage = p && p.estDecapee === false && (parseFloat(p.sterilesRestants) || 0) > 0;

    const debitAmont = Math.min(debits.Excavation, debits.Transport, debits.Chargement, debits.Tremie, debits.Convoyeur);
    const debitTraitement = Math.min(debitAmont, debits.Traitement);
    const debitChaine = Math.min(debitTraitement, debits.Lavage);
    const debitMax = Math.max(debits.Excavation, debits.Transport, debits.Chargement, debits.Tremie, debits.Convoyeur, debits.Traitement, debits.Lavage);
    const estEquilibre = debitChaine > 0 && debitChaine === debitMax;

    let debitMineurs = 0;
    if (!estEnDecapage && p && p.id === etat.parcelleActive && (parseFloat(etat.moral) || 100) >= 25) {
        const prodJour = (parseInt(etat.mineurs) || 0) * (parseFloat(CONFIG.prodMineurTonnes) || 1.5);
        debitMineurs = +((prodJour / 24) * (parseFloat(etat.cadence) || 1) * ((parseFloat(etat.moral) || 100) / 100)).toFixed(2);
    }

    const totalTerreTh = estEnDecapage ? debitDecapage : +(debitChaine + debitMineurs).toFixed(2);
    return { affectes, debits, counts, debitDecapage, estEnDecapage, debitChaine, debitMax, estEquilibre, debitMineurs, totalTerreTh };
}

function dessinerCarte() {
    const grid = document.getElementById('mapGrid');
    if (!grid) return;
    grid.innerHTML = '';
    parcelles.forEach((p, i) => {
        const div = document.createElement('div');
        div.className = 'pit-tile' + (p.id === etat.parcelleActive ? ' active' : '') + (p.reserveReelle <= 0 ? ' depleted' : '');

        const prof = parseInt(p.profondeurMetres) || Math.min(60, 10 + Math.round((i * 50) / 11));
        const maxP = parseFloat(CONFIG.profondeurMaxForagePetit) || 20;
        const maxM = parseFloat(CONFIG.profondeurMaxForageMoyen) || 40;
        const badgeForeuse = prof <= maxP ? 'Foreuse Petit' : prof <= maxM ? 'Foreuse Moyen' : 'Foreuse Géant';

        if (p.estSondee) {
            const st = calculerStatsSecteur(i);
            const detailMat = `🚜${st.counts.Decapage} | ⛏️${st.counts.Excavation} 🚛${st.counts.Transport} 🏗️${st.counts.Chargement} 📥${st.counts.Tremie} ➿${st.counts.Convoyeur} ⚙️${st.counts.Traitement} 💧${st.counts.Lavage}`;

            let badgeTop = `<div class="ui blue label">SONDÉ • ${prof}m</div>`;
            if (p.id === etat.parcelleActive) badgeTop = `<div class="ui green label">ACTIF • ${prof}m</div>`;
            else if (st.estEnDecapage) badgeTop = `<div class="ui orange label">🚧 DÉCAPAGE • ${prof}m</div>`;

            const infoTeneur = p.id === etat.parcelleActive
                ? `${Math.round(p.reserveReelle)} t (${p.pureteReelle} g/t)`
                : st.estEnDecapage
                ? `Est: ~${p.estimationPurete} g/t`
                : `Est: ~${p.estimationPurete} g/t | Dépl: ${CONFIG.coutDemenagement}€`;

            let blocEtat = '';
            if (st.estEnDecapage) {
                const rest = Math.round(parseFloat(p.sterilesRestants) || 0);
                const tot = Math.max(1, Math.round(parseFloat(p.sterilesTotal) || rest));
                const pct = Math.min(100, Math.round(((tot - rest) / tot) * 100));
                const heuresEst = st.debitDecapage > 0 ? `${Math.ceil(rest / st.debitDecapage)}h restantes` : 'Requis : 🚜 + ⛏️ + 🚛';
                blocEtat = `
                    <div style="color:#fb923c; font-weight:700; margin-top:2px;">🚧 Stériles : ${rest} / ${tot} t (${pct}%)</div>
                    <div style="background:#292524; height:6px; border-radius:3px; margin:3px 0; overflow:hidden;">
                        <div style="background:#f97316; width:${pct}%; height:100%;"></div>
                    </div>
                    <div style="color:${st.debitDecapage > 0 ? '#34d399' : '#f87171'};">${st.debitDecapage} t/h (${heuresEst})</div>
                `;
            } else {
                const badgeEquilibre = st.affectes.length === 0
                    ? `<span style="color:#a8a29e;">Aucun engin</span>`
                    : st.debitChaine === 0
                    ? `<span style="color:#f87171;">⚠️ Chaîne incomplète</span>`
                    : st.estEquilibre
                    ? `<span style="color:#34d399;">⚖️ Rendement synchro</span>`
                    : `<span style="color:#fbbf24;">⚠️ Débits déséquilibrés</span>`;
                blocEtat = `
                    <div style="color:#fbbf24; font-weight:700; margin-top:2px;">⚙️ Terre traitée : ${st.totalTerreTh} t/h</div>
                    <div>${badgeEquilibre}</div>
                `;
            }

            const btnChantier = st.estEnDecapage
                ? `<button class="ui mini orange button" style="margin-top:6px;" onclick="event.stopPropagation(); ouvrirChantierSecteur(${i})">🚜 Décaper</button>`
                : `<button class="ui mini yellow button" style="margin-top:6px;" onclick="event.stopPropagation(); ouvrirChantierSecteur(${i})">🏗️ Gérer le chantier</button>`;

            div.innerHTML = `
                ${badgeTop}
                <h4 style="margin:4px 0; color:${p.id === etat.parcelleActive ? '#fbbf24' : '#f5f5f4'};">${p.nom}</h4>
                <div style="font-size:0.88em;">${infoTeneur}</div>
                <div style="margin-top:6px; padding:5px; background:rgba(0,0,0,0.35); border-radius:4px; font-size:0.8em;">
                    <div><strong>${detailMat}</strong></div>
                    ${blocEtat}
                </div>
                ${btnChantier}
            `;
        } else {
            div.innerHTML = `
                <div class="ui label">VIERGE • ${prof} m</div>
                <h4 style="margin:4px 0; color:#a8a29e;">${p.nom}</h4>
                <div style="font-size:0.82em; color:#fbbf24; margin-bottom:2px;">🛢️ Requis : ${badgeForeuse}</div>
                <small>Sonder : ${CONFIG.coutCarottage}€</small>
            `;
        }

        div.onclick = () => {
            if (!p.estSondee) {
                const fleetAll = [
                    ...(Array.isArray(etat.fleetAll) ? etat.fleetAll : []),
                    ...(Array.isArray(etat.rentalsAll) ? etat.rentalsAll : [])
                ];
                let capMax = 0;
                for (const f of fleetAll) {
                    if ((f.categorie || '').toLowerCase().includes('forag')) {
                        const g = (f.gabarit || 'Petit').toLowerCase();
                        if (g.includes('g')) capMax = Math.max(capMax, parseFloat(CONFIG.profondeurMaxForageGeant) || 60);
                        else if (g === 'moyen') capMax = Math.max(capMax, maxM);
                        else capMax = Math.max(capMax, maxP);
                    }
                }
                if (capMax < prof) {
                    afficherToast(`⛔ Impossible de sonder ${p.nom} (${prof} m) : il vous faut une ${badgeForeuse} en service dans l'onglet Matériel !`, true);
                    return;
                }
            }
            actionMine('parcelle', p.id);
        };
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

    const st = calculerStatsSecteur(idx);
    const fleetAll = [
        ...(Array.isArray(etat.fleetAll) ? etat.fleetAll : []).map(f => ({ ...f, targetType: 'FLEET' })),
        ...(Array.isArray(etat.rentalsAll) ? etat.rentalsAll : []).map(r => ({ ...r, targetType: 'RENTAL' }))
    ];
    const autres = fleetAll.filter(e => parseInt(e.parcelle_index) !== idx);

    panel.style.display = 'block';
    const gridEl = document.getElementById('sector-debits-grid');
    gridEl.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fit, minmax(125px, 1fr)); gap:8px; margin-bottom:10px;';
    const alertEl = document.getElementById('sector-bottleneck-alert');

    if (st.estEnDecapage) {
        const rest = Math.round(parseFloat(p.sterilesRestants) || 0);
        const tot = Math.max(1, Math.round(parseFloat(p.sterilesTotal) || rest));
        const pct = Math.min(100, Math.round(((tot - rest) / tot) * 100));
        const heuresEst = st.debitDecapage > 0 ? `~${Math.ceil(rest / st.debitDecapage)}h restantes` : 'À l’arrêt';

        document.getElementById('sector-chantier-title').innerText = `🚧 Décapage — ${p.nom} | Stériles restants : ${rest} / ${tot} t (${pct}%) | Vitesse : ${st.debitDecapage} t/h (${heuresEst})`;

        const maillonsDecap = [
            { nom: '1. 🚜 Bulldozer', val: st.debits.Decapage, nb: st.counts.Decapage },
            { nom: '2. ⛏️ Excavation', val: st.debits.Excavation, nb: st.counts.Excavation },
            { nom: '3. 🚛 Camion benne', val: st.debits.Transport, nb: st.counts.Transport }
        ];

        gridEl.innerHTML = maillonsDecap.map(m => {
            const isMin = m.val === st.debitDecapage;
            const borderColor = m.val === 0 ? '#ef4444' : isMin ? '#fbbf24' : '#34d399';
            return `
                <div style="background:#1c1917; padding:8px 10px; border-radius:6px; border:1px solid #44403c; border-bottom:3px solid ${borderColor}; text-align:center;">
                    <div style="font-size:0.82em; color:#a8a29e;">${m.nom} (${m.nb})</div>
                    <div style="font-size:1.15em; font-weight:800; color:${m.val === 0 ? '#f87171' : '#fbbf24'}; margin:2px 0;">${m.val} t/h</div>
                    <div style="font-size:0.75em; color:#d6d3d1;">${m.val === 0 ? '🚨 Manquant' : isMin ? '⚙️ Maillon limitant' : '✅ Prêt'}</div>
                </div>
            `;
        }).join('');

        if (st.debitDecapage <= 0) {
            alertEl.innerHTML = `<span class="ui red label">🚧 Décapage bloqué (0 t/h) : affectez 1 Bulldozer (Décapage) + 1 Excavatrice + 1 Camion benne avec leurs conducteurs pour évacuer les ${rest} t de terre stérile !</span>`;
        } else {
            alertEl.innerHTML = `<span class="ui orange label">🚧 Décapage en cours à ${st.debitDecapage} t/h — Temps estimé avant ouverture de la fosse : ${Math.ceil(rest / st.debitDecapage)} heure(s).</span>`;
        }
    } else {
        document.getElementById('sector-chantier-title').innerText = `🏗️ Chantier — ${p.nom} | Total terre traitée : ${st.totalTerreTh} t/h | Pureté : ${p.pureteReelle} g/t | Réserve : ${Math.round(p.reserveReelle).toLocaleString()} t`;

        const maillons = [
            { nom: '1. ⛏️ Excavation', val: st.debits.Excavation, nb: st.counts.Excavation },
            { nom: '2. 🚛 Transport', val: st.debits.Transport, nb: st.counts.Transport },
            { nom: '3. 🏗️ Chargement', val: st.debits.Chargement, nb: st.counts.Chargement },
            { nom: '4. 📥 Trémie', val: st.debits.Tremie, nb: st.counts.Tremie },
            { nom: '5. ➿ Convoyeur', val: st.debits.Convoyeur, nb: st.counts.Convoyeur },
            { nom: '6. ⚙️ Traitement', val: st.debits.Traitement, nb: st.counts.Traitement },
            { nom: '7. 💧 Lavage', val: st.debits.Lavage, nb: st.counts.Lavage }
        ];

        gridEl.innerHTML = maillons.map(m => {
            const isMin = m.val === st.debitChaine;
            const borderColor = m.val === 0 ? '#ef4444' : isMin && st.estEquilibre ? '#34d399' : isMin ? '#fbbf24' : '#f97316';
            const statusTxt = m.val === 0 ? '🚨 Manquant' : st.estEquilibre ? '⚖️ Synchro' : isMin ? '⚠️ Limitant' : '⚠️ Surrégime';
            return `
                <div style="background:#1c1917; padding:8px 10px; border-radius:6px; border:1px solid #44403c; border-bottom:3px solid ${borderColor}; text-align:center;">
                    <div style="font-size:0.8em; color:#a8a29e; white-space:nowrap;">${m.nom} (${m.nb})</div>
                    <div style="font-size:1.15em; font-weight:800; color:${m.val === 0 ? '#f87171' : '#fbbf24'}; margin:2px 0;">${m.val} t/h</div>
                    <div style="font-size:0.75em; color:#d6d3d1;">${statusTxt}</div>
                </div>
            `;
        }).join('');

        if (st.debitChaine <= 0) {
            alertEl.innerHTML = `<span class="ui red label">🚨 Chaîne incomplète (0 t/h mécanisé) : il faut les 7 étapes dans l'ordre (⛏️ Excavation → 🚛 Transport → 🏗️ Chargement → 📥 Trémie → ➿ Convoyeur → ⚙️ Traitement → 💧 Lavage) !</span>`;
        } else if (!st.estEquilibre) {
            const orHeure = +(st.totalTerreTh * p.pureteReelle).toFixed(2);
            alertEl.innerHTML = `<span class="ui orange label">⚠️ Rendements déséquilibrés : la chaîne est bridée à ${st.debitChaine} t/h (Total avec mineurs : ${st.totalTerreTh} t/h ≈ ${orHeure} g/h). Alignez les 7 étapes sur ${st.debitChaine} t/h pour économiser carburant et usure !</span>`;
        } else {
            const orHeure = +(st.totalTerreTh * p.pureteReelle).toFixed(2);
            alertEl.innerHTML = `<span class="ui green label">⚖️ Chaîne parfaitement synchronisée à ${st.debitChaine} t/h (Total terre traitée : ${st.totalTerreTh} t/h ≈ ${orHeure} g d'or brut / heure)</span>`;
        }
    }

    const tbody = document.getElementById('sector-assigned-tbody');
    if (st.affectes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#a8a29e;">Aucun engin affecté à ce secteur.</td></tr>';
    } else {
        const optionsSecteurs = parcelles.map((sec, sIdx) => sec.estSondee ? `<option value="${sIdx}" ${sIdx === idx ? 'selected' : ''}>${sec.nom}</option>` : '').join('');
        tbody.innerHTML = st.affectes.map(e => {
            const vMin = parseFloat(e.vitesse_min_th) || 2;
            const vMax = parseFloat(e.vitesse_max_th) || 5;
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
