let eqData = null;
let eqFiltres = {
    boutique: { cat: 'TOUS', gab: 'TOUS' },
    flotte: { cat: 'TOUS', gab: 'TOUS' },
    concession: { cat: 'TOUS', gab: 'TOUS' },
    brocante: { cat: 'TOUS', gab: 'TOUS' },
    location: { cat: 'TOUS', gab: 'TOUS' }
};

function changerFiltreEq(zone, cat, gab) {
    if (cat !== null) eqFiltres[zone].cat = cat;
    if (gab !== null) eqFiltres[zone].gab = gab;
    if (zone === 'boutique') rendreBoutiqueNeuf();
    else if (zone === 'flotte') rendreMaFlotte();
    else if (zone === 'concession') rendreConcessionnaires();
    else if (zone === 'brocante') rendreBrocanteEncheres();
    else if (zone === 'location') rendreLocationEngins();
}

function rendreBarreFiltresZone(containerId, targetEl, zone, avecGabarit = true) {
    if (!targetEl) return;
    let toolbar = document.getElementById(containerId);
    if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.id = containerId;
        toolbar.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; margin-bottom:14px; padding:10px; background:#1c1917; border-radius:6px; border:1px solid #44403c;';
        targetEl.parentNode.insertBefore(toolbar, targetEl);
    }

    const categories = [
        { id: 'TOUS', label: '🌐 Tous' },
        { id: 'Forage', label: '🛢️ Forage' },
        { id: 'Levage', label: '🏗️ Levage' },
        { id: 'Décapage', label: '🚜 Décapage' },
        { id: 'Excavation', label: '⛏️ Excavation' },
        { id: 'Transport', label: '🚛 Transport' },
        { id: 'Chargement', label: '🏗️ Chargement' },
        { id: 'Trémie', label: '📥 Trémie' },
        { id: 'Convoyeur', label: '➿ Convoyeur' },
        { id: 'Traitement', label: '⚙️ Traitement' },
        { id: 'Lavage', label: '💧 Lavage' },
        ...(zone === 'flotte' ? [{ id: 'INACTIFS', label: '🅿️ Inactif(s)' }] : [])
    ];


    const gabarits = [
        { id: 'TOUS', label: 'Tous gabarits' },
        { id: 'Petit', label: 'Petit' },
        { id: 'Moyen', label: 'Moyen' },
        { id: 'Géant', label: 'Géant' }
    ];

    const fActuel = eqFiltres[zone];
    toolbar.style.cssText = 'display:flex; flex-direction:column; gap:10px; margin-bottom:16px; padding:12px; background:#1c1917; border-radius:8px; border:1px solid #44403c;';
    toolbar.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(6, 1fr); gap:6px; width:100%;">
            ${categories.map(c => `
                <button class="ui mini ${fActuel.cat === c.id ? 'yellow' : ''} button" style="margin:0; width:100%; padding:8px 6px; white-space:nowrap; text-align:center;" onclick="changerFiltreEq('${zone}', '${c.id}', null)">${c.label}</button>
            `).join('')}
        </div>
        ${avecGabarit ? `
        <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding-top:8px; border-top:1px dashed #44403c;">
            <span style="font-size:0.85em; color:#a8a29e; font-weight:700; margin-right:4px;">📐 Gabarit :</span>
            ${gabarits.map(g => `
                <button class="ui mini ${fActuel.gab === g.id ? 'blue' : ''} button" style="margin:0;" onclick="changerFiltreEq('${zone}', null, '${g.id}')">${g.label}</button>
            `).join('')}
        </div>` : ''}
    `;
}

function formaterRendementEq(item) {
    const cat = (item.categorie || '').toLowerCase();
    const gab = (item.gabarit || 'Moyen').toLowerCase();
    const nom = item.nom || '';
    if (cat.includes('forag')) {
        const matchM = nom.match(/(\d+)\s*m/i);
        const prof = matchM ? parseInt(matchM[1]) : gab.includes('g') ? 60 : gab === 'moyen' ? 40 : 20;
        return `🛢️ Sondage max : <strong>${prof} m</strong>`;
    }
    if (cat.includes('levag')) {
        const matchT = nom.match(/(\d+)\s*t/i);
        const tonnes = matchT ? parseInt(matchT[1]) : gab.includes('g') ? 150 : gab === 'moyen' ? 50 : 15;
        return `🏗️ Levage max : <strong>${tonnes} t</strong>`;
    }
    return `⛏️ Débit : <strong>${item.vitesse_min_th || 2}-${item.vitesse_max_th || 5} t/h</strong>`;
}

function trierCatalogueLogique(liste) {

    const ordreCat = { Forage: 1, Levage: 2, Décapage: 3, Excavation: 4, Transport: 5, Chargement: 6, Trémie: 7, Convoyeur: 8, Traitement: 9, Lavage: 10 };
    const ordreGab = { Petit: 1, Moyen: 2, Géant: 3 };
    return [...liste].sort((a, b) => {
        const cA = ordreCat[a.categorie] || 99;
        const cB = ordreCat[b.categorie] || 99;
        if (cA !== cB) return cA - cB;
        const gA = ordreGab[a.gabarit || 'Moyen'] || 99;
        const gB = ordreGab[b.gabarit || 'Moyen'] || 99;
        if (gA !== gB) return gA - gB;
        return parseFloat(a.prix_neuf) - parseFloat(b.prix_neuf);
    });
}

async function chargerModuleMateriel() {
    try {
        const res = await fetch('/api/equipment');
        if (!res.ok) return;
        eqData = await res.json();
        rendreMaFlotte();
        rendreBoutiqueNeuf();
        rendreConcessionnaires();
        rendreBrocanteEncheres();
        rendreLocationEngins();
    } catch (e) {
        console.error('Erreur chargement matériel:', e);
    }
}

function afficherSousOngletMateriel(subId, btn) {
    document.querySelectorAll('.eq-subtab').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.eq-subnav-btn').forEach(b => b.classList.remove('yellow'));
    const target = document.getElementById(subId);
    if (target) target.style.display = 'block';
    if (btn) btn.classList.add('yellow');
}

// 1. MA FLOTTE & LOCATIONS ACTIVES
function rendreMaFlotte() {
    const tbody = document.getElementById('eq-my-fleet-tbody');
    if (!tbody || !eqData) return;

    rendreBarreFiltresZone('eq-fleet-filters', tbody.closest('table') || tbody, 'flotte', true);
    let maFlotteFiltree = trierCatalogueLogique(eqData.myFleet);
    if (eqFiltres.flotte.cat === 'INACTIFS') {
        maFlotteFiltree = maFlotteFiltree.filter(f => f.statut !== 'ACTIF' || parseInt(f.parcelle_index) < 0);
    } else if (eqFiltres.flotte.cat !== 'TOUS') {
        maFlotteFiltree = maFlotteFiltree.filter(f => f.categorie === eqFiltres.flotte.cat);
    }
    if (eqFiltres.flotte.gab !== 'TOUS') maFlotteFiltree = maFlotteFiltree.filter(f => (f.gabarit || 'Moyen') === eqFiltres.flotte.gab);

    const cfgObj = (typeof CONFIG !== 'undefined' && CONFIG) ? CONFIG : {};
    const reqCondDefaut = parseInt(cfgObj.conducteursRequisParEngin, 10) || 2;
    const estFixeEq = (cat) => {
        const c = (cat || '').toLowerCase();
        return c.includes('trém') || c.includes('trem') || c.includes('convoy') || c.includes('traitement') || c.includes('lavage');
    };
    const tousActifs = [
        ...(Array.isArray(eqData.myFleet) ? eqData.myFleet.filter(x => x.statut === 'ACTIF').map(x => ({ ...x, _k: 'FLEET' })) : []),
        ...(Array.isArray(eqData.myActiveRentals) ? eqData.myActiveRentals.map(x => ({ ...x, _k: 'RENTAL' })) : [])
    ].sort((a, b) => (parseFloat(b.vitesse_reglee_th) || 3) - (parseFloat(a.vitesse_reglee_th) || 3));

    let condRestants = (typeof etat !== 'undefined' && etat.conducteurs !== undefined) ? (parseInt(etat.conducteurs, 10) || 0) : 0;
    let mecaRestants = (typeof etat !== 'undefined' && etat.mecaniciens !== undefined) ? (parseInt(etat.mecaniciens, 10) || 0) : 0;
    const equipageMap = new Map();

    for (const item of tousActifs) {
        if (parseInt(item.parcelle_index, 10) < 0) continue;
        const key = `${item._k}:${item.id}`;
        if (estFixeEq(item.categorie)) {
            if (mecaRestants >= 1) {
                mecaRestants -= 1;
                equipageMap.set(key, { ok: true, msg: '' });
            } else {
                equipageMap.set(key, { ok: false, msg: '⚠️ Sans mécano (0/1)' });
            }
        } else {
            const aff = Math.min(reqCondDefaut, condRestants);
            condRestants -= aff;
            if (aff <= 0) equipageMap.set(key, { ok: false, msg: `⚠️ Sans conducteur (0/${reqCondDefaut})` });
            else if (aff < reqCondDefaut) equipageMap.set(key, { ok: false, msg: `⚠️ Équipage partiel (${aff}/${reqCondDefaut})` });
            else equipageMap.set(key, { ok: true, msg: '' });
        }
    }

    if (maFlotteFiltree.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#a8a29e;">Aucun engin dans votre flotte pour ce filtre.</td></tr>';
    } else {
        tbody.innerHTML = maFlotteFiltree.map(f => {
            const usure = Math.round(parseFloat(f.usure_actuelle));
            const gab = f.gabarit || 'Moyen';
            const nbPieces = parseInt(f.pieces_panne) || 1;
            const isGrue = (f.categorie || '').toLowerCase().includes('levag');
            const nivGrue = gab === 'Petit' ? 1 : gab === 'Géant' ? 3 : 2;
            const infoGrue = isGrue ? '' : ` + Grue Niv.${nivGrue}`;

            const pIdx = isNaN(parseInt(f.parcelle_index)) ? 0 : parseInt(f.parcelle_index);
            const listeParcelles = (typeof parcelles !== 'undefined' && Array.isArray(parcelles)) ? parcelles : [];
            const secActifId = (typeof etat !== 'undefined' && etat.parcelleActive !== undefined) ? parseInt(etat.parcelleActive) : 0;
            const nomSecteur = pIdx < 0
                ? '🅿️ Au dépôt'
                : `🗺️ ${listeParcelles.at(pIdx)?.nom || ('Secteur ' + String.fromCharCode(65 + pIdx))}`;

            const optionsAffectation = `<option value="-1" ${pIdx < 0 ? 'selected' : ''}>🅿️ Au dépôt (Arrêt)</option>` +
                listeParcelles.map((sec, sIdx) => {
                    const ouverte = sec.estSondee && (sec.estOuverte || sIdx === 0 || sIdx === secActifId);
                    return ouverte ? `<option value="${sIdx}" ${sIdx === pIdx ? 'selected' : ''}>🗺️ ${sec.nom}</option>` : '';
                }).join('');

            const eqInfo = (f.statut === 'ACTIF' && pIdx >= 0) ? equipageMap.get(`FLEET:${f.id}`) : null;
            const badgeEquipage = (eqInfo && !eqInfo.ok)
                ? `<div style="margin-top:4px;"><span class="ui red label" style="font-size:0.75em;">${eqInfo.msg}</span></div>`
                : '';

            const badgeStatut = f.statut === 'ACTIF'
                ? `<select style="padding:5px 8px; border-radius:4px; background:#1c1917; color:${pIdx < 0 ? '#a8a29e' : '#34d399'}; border:1px solid #44403c; font-weight:700; cursor:pointer;" onchange="changerAffectationFlotte('FLEET', ${f.id}, this.value)">${optionsAffectation}</select>${badgeEquipage}`
                : f.statut === 'EN_PANNE'
                ? `<span class="ui red label">🚨 EN PANNE (${nomSecteur})</span>`
                : f.statut === 'EN_VENTE'
                ? '<span class="ui orange label">En vente / Enchère</span>'
                : f.statut === 'OFFRE_LOC'
                ? '<span class="ui blue label">Offre location</span>'
                : '<span class="ui yellow label">Loué à un PDG</span>';

            let actions = '<span style="color:#a8a29e;font-size:0.85em;">Indisponible (contrat en cours)</span>';

            if (f.statut === 'EN_PANNE') {
                actions = `<button class="ui mini red button" onclick="reparerPanne(${f.id})">🚨 Réparer (${nbPieces} pièce(s) ${f.categorie} ${gab}${infoGrue})</button>`;
            } else if (f.statut === 'OFFRE_LOC') {
                actions = `<button class="ui mini red button" onclick="annulerOffreLocation(${f.id})">❌ Retirer l'offre</button>`;
            } else if (f.statut === 'ACTIF') {
                const usureExacte = parseFloat(f.usure_actuelle) || 0;
                const tauxRev = parseFloat(eqData.tauxRevisionUsurePct) || 0.35;
                const prixNeuf = parseFloat(f.prix_neuf) || 5000;
                const coutRev = usureExacte > 0 ? Math.max(50, Math.round(prixNeuf * tauxRev * (usureExacte / 100))) : 0;
                actions = `
                    <div style="display:flex; gap:4px; align-items:center; flex-wrap:nowrap;">
                        <button class="ui mini blue button" style="margin:0; white-space:nowrap;" onclick="reviserEngin(${f.id})" ${usureExacte <= 0 ? 'disabled' : ''}>🔧 Réviser${coutRev > 0 ? ' (' + coutRev.toLocaleString() + ' €)' : ''}</button>
                        <button class="ui mini orange button" style="margin:0; white-space:nowrap;" onclick="ouvrirVenteEngin(${f.id})">🏷️ Vendre</button>
                        <button class="ui mini green button" style="margin:0; white-space:nowrap;" onclick="ouvrirLocationEngin(${f.id})">🤝 Louer</button>
                    </div>
                `;
            }

            return `
                <tr>
                    <td style="white-space:nowrap;"><strong>${f.nom}</strong> <small style="color:#a8a29e;">(${f.categorie} • <strong style="color:#fbbf24;">${gab}</strong>)</small></td>
                    <td style="white-space:nowrap;">${formaterRendementEq(f)}</td>
                    <td style="white-space:nowrap;">${f.carburant_jour} €/j</td>
                    <td style="white-space:nowrap;"><strong style="color:${usure > 60 ? '#f87171' : '#34d399'};">${usure}%</strong> <small style="color:#a8a29e;">(+${f.usure_jour}%/j)</small></td>
                    <td style="white-space:nowrap;">${badgeStatut}</td>
                    <td style="white-space:nowrap;">${actions}</td>
                </tr>
            `;
        }).join('');
    }

    const locTbody = document.getElementById('eq-my-rentals-tbody');
    if (locTbody) {
        let mesLocationsFiltrees = trierCatalogueLogique(eqData.myActiveRentals);
        if (eqFiltres.flotte.cat === 'INACTIFS') {
            mesLocationsFiltrees = mesLocationsFiltrees.filter(r => parseInt(r.parcelle_index) < 0);
        } else if (eqFiltres.flotte.cat !== 'TOUS') {
            mesLocationsFiltrees = mesLocationsFiltrees.filter(r => r.categorie === eqFiltres.flotte.cat);
        }

        if (mesLocationsFiltrees.length === 0) {
            locTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#a8a29e;">Aucune location en cours pour ce filtre.</td></tr>';
        } else {
            const listeParcelles = (typeof parcelles !== 'undefined' && Array.isArray(parcelles)) ? parcelles : [];
            const secActifId = (typeof etat !== 'undefined' && etat.parcelleActive !== undefined) ? parseInt(etat.parcelleActive) : 0;

            locTbody.innerHTML = mesLocationsFiltrees.map(r => {
                const rIdx = isNaN(parseInt(r.parcelle_index)) ? 0 : parseInt(r.parcelle_index);
                const eqLoc = rIdx >= 0 ? equipageMap.get(`RENTAL:${r.id}`) : null;
                const badgeEqLoc = (eqLoc && !eqLoc.ok)
                    ? `<span class="ui red label" style="font-size:0.75em;">${eqLoc.msg}</span>`
                    : '';
                const optsLoc = `<option value="-1" ${rIdx < 0 ? 'selected' : ''}>🅿️ Au dépôt</option>` +
                    listeParcelles.map((sec, sIdx) => {
                        const ouverte = sec.estSondee && (sec.estOuverte || sIdx === 0 || sIdx === secActifId);
                        return ouverte ? `<option value="${sIdx}" ${sIdx === rIdx ? 'selected' : ''}>🗺️ ${sec.nom}</option>` : '';
                    }).join('');
                return `
                <tr>
                    <td><strong>${r.nom}</strong> (${r.source_type === 'OFFICIEL' ? 'Parc Officiel' : 'PDG ' + r.owner_name})</td>
                    <td>${formaterRendementEq(r)}</td>
                    <td>${r.carburant_jour} €/j</td>
                    <td class="money-text">${Math.round(r.loyer_jour).toLocaleString()} €/j</td>
                    <td>
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <select style="padding:4px 6px; border-radius:4px; background:#1c1917; color:#34d399; border:1px solid #44403c; font-weight:700;" onchange="changerAffectationFlotte('RENTAL', ${r.id}, this.value)">${optsLoc}</select>
                            <span class="ui blue label">${r.jours_restants}j restants</span>
                            ${badgeEqLoc}
                        </div>
                    </td>
                </tr>
            `;
            }).join('');
        }
    }
}
         
async function changerAffectationFlotte(targetType, targetId, parcelleIndex) {
    if (typeof affecterEnginSecteur === 'function') {
        await affecterEnginSecteur(targetType, targetId, parcelleIndex);
        chargerModuleMateriel();
    }
}

// 2. BOUTIQUE NEUF (0% USURE + FILTRES PAR TYPE & GABARIT)
function rendreBoutiqueNeuf() {
    const grid = document.getElementById('eq-shop-new-grid');
    if (!grid || !eqData) return;

    rendreBarreFiltresZone('eq-shop-filters', grid, 'boutique', true);

    let liste = trierCatalogueLogique(eqData.catalog);
    if (eqFiltres.boutique.cat !== 'TOUS') {
        liste = liste.filter(item => item.categorie === eqFiltres.boutique.cat);
    }
    if (eqFiltres.boutique.gab !== 'TOUS') {
        liste = liste.filter(item => (item.gabarit || 'Moyen') === eqFiltres.boutique.gab);
    }

    if (liste.length === 0) {

        grid.innerHTML = '<p style="color:#a8a29e;">Aucun engin ne correspond à ce filtre.</p>';
        return;
    }

    grid.innerHTML = liste.map(item => `
        <div class="ui inverted segment" style="display:flex; flex-direction:column; justify-content:space-between;">
            <div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span class="ui blue label">${item.categorie}</span>
                    <span class="ui yellow label">${item.gabarit || 'Moyen'}</span>
                </div>
                <h4 style="color:#fbbf24; margin-bottom:8px;">${item.nom}</h4>
                <p style="font-size:0.88em; color:#d6d3d1; margin-bottom:4px;">${formaterRendementEq(item)}</p>
                <p style="font-size:0.88em; color:#d6d3d1; margin-bottom:4px;">⛽ Carburant : <strong>${item.carburant_jour} €/jour</strong></p>
                <p style="font-size:0.88em; color:#d6d3d1; margin-bottom:4px;">⚙️ Usure : <strong>${item.usure_jour}% /jour</strong> (Garanti 0% neuf)</p>
                <p style="font-size:0.88em; color:#a8a29e; margin-bottom:12px;">🔧 Pièces en cas de panne : <strong>${item.pieces_panne || 1} pièce(s)</strong></p>
            </div>
            <div>
                <div style="font-size:1.25em; font-weight:800; color:#34d399; margin-bottom:10px;">${Math.round(item.prix_neuf).toLocaleString()} €</div>
                <button class="ui fluid green button" onclick="acheterEnginNeuf(${item.id})">🛒 Acheter Neuf</button>
            </div>
        </div>
    `).join('');
}

// 3. CONCESSIONNAIRES SPÉCIALISÉS & PIÈCES DÉTACHÉES (10 FAMILLES)
function rendreConcessionnaires() {
    const grid = document.getElementById('eq-dealers-grid');
    if (!grid || !eqData || !eqData.tarifsPieces) return;

    rendreBarreFiltresZone('eq-dealers-filters', grid, 'concession', true);

    let familles = ['Forage', 'Levage', 'Décapage', 'Excavation', 'Transport', 'Chargement', 'Trémie', 'Convoyeur', 'Traitement', 'Lavage'];
    if (eqFiltres.concession.cat !== 'TOUS') {
        familles = familles.filter(f => f === eqFiltres.concession.cat);
    }
    let gabarits = ['Petit', 'Moyen', 'Géant'];
    if (eqFiltres.concession.gab !== 'TOUS') {
        gabarits = gabarits.filter(g => g === eqFiltres.concession.gab);
    }
    const stock = eqData.piecesStock || {};


    grid.innerHTML = familles.map(fam => {
        const tarifs = eqData.tarifsPieces[fam] || {};
        const lignes = gabarits.map(gab => {
            const key = `${fam}:${gab}`;
            const enStock = parseInt(stock[key]) || 0;
            const prix = tarifs[gab] || 0;
            return `
                <tr>
                    <td><span class="ui yellow label">${gab}</span></td>
                    <td><strong>${enStock}</strong> en stock</td>
                    <td class="money-text">${prix.toLocaleString()} €</td>
                    <td><button class="ui mini green button" onclick="acheterPieceConcession('${fam}', '${gab}')">+1 Pièce</button></td>
                </tr>
            `;
        }).join('');

        return `
            <div class="ui inverted segment">
                <h4 style="color:#fbbf24; margin-bottom:10px;">🏢 Concessionnaire ${fam}</h4>
                <table class="ui table">
                    <thead><tr><th>Gabarit</th><th>Inventaire</th><th>Prix Unitaire</th><th>Commander</th></tr></thead>
                    <tbody>${lignes}</tbody>
                </table>
            </div>
        `;
    }).join('');
}

// 4. BROCANTE & ENCHÈRES ENTRE PDG
function rendreBrocanteEncheres() {
    const tbody = document.getElementById('eq-auctions-tbody');
    if (!tbody || !eqData) return;

    rendreBarreFiltresZone('eq-auctions-filters', tbody.closest('table') || tbody, 'brocante', true);

    let encheresFiltrees = trierCatalogueLogique(eqData.auctions);
    if (eqFiltres.brocante.cat !== 'TOUS') {
        encheresFiltrees = encheresFiltrees.filter(a => a.categorie === eqFiltres.brocante.cat);
    }
    if (eqFiltres.brocante.gab !== 'TOUS') {
        encheresFiltrees = encheresFiltrees.filter(a => (a.gabarit || 'Moyen') === eqFiltres.brocante.gab);
    }

    if (encheresFiltrees.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#a8a29e;">Aucune vente d’occasion ni enchère pour ce filtre.</td></tr>';
        return;
    }

    tbody.innerHTML = encheresFiltrees.map(a => {
        const diffMs = Math.max(0, new Date(a.expires_at).getTime() - Date.now());
        const heuresRest = Math.floor(diffMs / 3600000);
        const minsRest = Math.floor((diffMs % 3600000) / 60000);
        const isBrocante = a.mode_vente === 'BROCANTE';

        const btnAction = isBrocante
            ? `<button class="ui mini green button" onclick="encherirOuAcheter(${a.id}, ${a.prix_actuel})">⚡ Acheter (${Math.round(a.prix_actuel).toLocaleString()} €)</button>`
            : `<div style="display:flex; gap:6px;">
                 <input type="number" id="bid-input-${a.id}" value="${Math.ceil(a.prix_actuel * 1.05)}" style="width:105px; padding:5px;">
                 <button class="ui mini yellow button" onclick="encherirOuAcheter(${a.id}, document.getElementById('bid-input-${a.id}').value)">🔨 Enchérir</button>
               </div>`;

        return `
            <tr>
                <td><strong>${a.nom}</strong><br><small style="color:#a8a29e;">Vendeur : ${a.seller_name} | Usure : ${Math.round(a.usure_actuelle)}%</small></td>
                <td>${formaterRendementEq(a)}</td>
                <td>${isBrocante ? '<span class="ui green label">Vente Directe</span>' : '<span class="ui orange label">Enchère</span>'}</td>
                <td class="money-text">${Math.round(a.prix_actuel).toLocaleString()} €<br><small style="color:#a8a29e;">${a.bidder_name ? 'Meneur : ' + a.bidder_name : 'Aucune offre'}</small></td>
                <td><strong>${heuresRest}h ${minsRest}m</strong></td>
                <td>${btnAction}</td>
            </tr>
        `;
    }).join('');
}

// 5. LOCATION D'ENGINS (TRIÉE + FILTRÉE + BADGES ALIGNÉS À DROITE + OFFRES PDG)
function rendreLocationEngins() {
    const offTbody = document.getElementById('eq-official-rentals-tbody');
    if (offTbody && eqData) {
        rendreBarreFiltresZone('eq-rentals-filters', offTbody.closest('table') || offTbody, 'location', true);
        const coeff = parseFloat(eqData.coeffLoyerJeu) || 0.08;
        let listeTriee = trierCatalogueLogique(eqData.catalog);
        if (eqFiltres.location.cat !== 'TOUS') {
            listeTriee = listeTriee.filter(item => item.categorie === eqFiltres.location.cat);
        }
        if (eqFiltres.location.gab !== 'TOUS') {
            listeTriee = listeTriee.filter(item => (item.gabarit || 'Moyen') === eqFiltres.location.gab);
        }
        offTbody.innerHTML = listeTriee.map(item => {
            const loyerEstime = Math.round(parseFloat(item.prix_neuf) * coeff);
            return `
                <tr>
                    <td>
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                            <strong>${item.nom}</strong>
                            <div style="display:flex; gap:6px; flex-shrink:0;">
                                <span class="ui blue label" style="min-width:92px; text-align:center;">${item.categorie}</span>
                                <span class="ui yellow label" style="min-width:66px; text-align:center;">${item.gabarit || 'Moyen'}</span>
                            </div>
                        </div>
                    </td>
                    <td>${formaterRendementEq(item)}</td>
                    <td>${item.carburant_jour} €/j</td>
                    <td class="money-text">${loyerEstime.toLocaleString()} €/j</td>
                    <td>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <input type="number" id="rent-days-${item.id}" min="1" max="7" value="3" style="width:55px; padding:4px;">
                            <span style="font-size:0.85em; color:#a8a29e;">j</span>
                            <button class="ui mini green button" onclick="louerOfficiel(${item.id}, document.getElementById('rent-days-${item.id}').value)">✍️ Louer</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    const pdgTbody = document.getElementById('eq-pdg-rentals-tbody');
    if (pdgTbody && eqData) {
        let offresPdgFiltrees = trierCatalogueLogique(eqData.rentalOffers);
        if (eqFiltres.location.cat !== 'TOUS') {
            offresPdgFiltrees = offresPdgFiltrees.filter(o => o.categorie === eqFiltres.location.cat);
        }
        if (offresPdgFiltrees.length === 0) {
            pdgTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#a8a29e;">Aucun PDG ne propose d’engin en location pour ce filtre.</td></tr>';
        } else {
            pdgTbody.innerHTML = offresPdgFiltrees.map(o => `
                <tr>
                    <td><strong>${o.nom}</strong><br><small>Propriétaire : ${o.owner_name}</small></td>
                    <td>${formaterRendementEq(o)}</td>
                    <td>${o.carburant_jour} €/j</td>
                    <td class="money-text">${Math.round(o.loyer_jour).toLocaleString()} €/j</td>
                    <td><span class="ui yellow label">${o.jours_restants} jour(s)</span></td>
                    <td><button class="ui mini green button" onclick="louerPdg(${o.id})">✍️ Signer contrat</button></td>
                </tr>
            `).join('');
        }
    }
}

// --- ACTIONS API ---
function notifierEq(data) {
    if (typeof afficherToast === 'function') {
        afficherToast(data.message || data.error, !data.success);
    } else {
        alert(data.message || data.error);
    }
}

async function acheterEnginNeuf(catalogId) {
    const res = await fetch('/api/equipment/buy-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalogId })
    });
    const data = await res.json();
    notifierEq(data);
    chargerModuleMateriel();
    if (typeof chargerEtatJeu === 'function') chargerEtatJeu();
}

async function acheterPieceConcession(categorie, gabarit) {
    const res = await fetch('/api/equipment/buy-parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categorie, gabarit, quantite: 1 })
    });
    const data = await res.json();
    notifierEq(data);
    chargerModuleMateriel();
    if (typeof chargerEtatJeu === 'function') chargerEtatJeu();
}

async function reparerPanne(fleetId) {
    const res = await fetch('/api/equipment/fix-breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fleetId })
    });
    const data = await res.json();
    notifierEq(data);
    chargerModuleMateriel();
    if (typeof chargerEtatJeu === 'function') chargerEtatJeu();
}

async function reviserEngin(fleetId) {
    const res = await fetch('/api/equipment/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fleetId })
    });
    const data = await res.json();
    notifierEq(data);
    chargerModuleMateriel();
    if (typeof chargerEtatJeu === 'function') chargerEtatJeu();
}

async function ouvrirVenteEngin(fleetId) {
    const choix = prompt('Vendre cet engin :\nTapez 1 pour Vente Directe (Brocante)\nTapez 2 pour Enchères', '2');
    if (!choix) return;
    const modeVente = choix === '1' ? 'BROCANTE' : 'ENCHERE';
    const prixDepart = prompt('Prix de vente ou mise à prix (€) :', '3500');
    if (!prixDepart) return;
    const dureeHeures = prompt('Durée de l’annonce en heures (1 à 168h = 7 jours max) :', '24');
    if (!dureeHeures) return;

    const res = await fetch('/api/equipment/list-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fleetId, modeVente, prixDepart, dureeHeures })
    });
    const data = await res.json();
    notifierEq(data);
    chargerModuleMateriel();
    if (typeof chargerEtatJeu === 'function') chargerEtatJeu();
}

async function encherirOuAcheter(auctionId, montantOffre) {
    const res = await fetch('/api/equipment/bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auctionId, montantOffre })
    });
    const data = await res.json();
    notifierEq(data);
    chargerModuleMateriel();
    if (typeof chargerEtatJeu === 'function') chargerEtatJeu();
}

async function ouvrirLocationEngin(fleetId) {
    const loyerJour = prompt('Proposer cet engin en location aux autres PDG.\nLoyer journalier souhaité (€/jour) :', '400');
    if (!loyerJour) return;
    const dureeJours = prompt('Durée du contrat de location (1 à 7 jours max) :', '3');
    if (!dureeJours) return;
    const res = await fetch('/api/equipment/offer-rental', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fleetId, loyerJour, dureeJours })
    });
    const data = await res.json();
    notifierEq(data);
    chargerModuleMateriel();
    if (typeof chargerEtatJeu === 'function') chargerEtatJeu();
}

async function annulerOffreLocation(fleetId) {
    const res = await fetch('/api/equipment/cancel-rental-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fleetId })
    });
    const data = await res.json();
    notifierEq(data);
    chargerModuleMateriel();
    if (typeof chargerEtatJeu === 'function') chargerEtatJeu();
}

async function louerOfficiel(catalogId, dureeJours) {
    const res = await fetch('/api/equipment/rent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType: 'OFFICIEL', catalogId, dureeJours })
    });
    const data = await res.json();
    notifierEq(data);
    chargerModuleMateriel();
    if (typeof chargerEtatJeu === 'function') chargerEtatJeu();
}

async function louerPdg(rentalId) {
    const res = await fetch('/api/equipment/rent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType: 'PDG', rentalId })
    });
    const data = await res.json();
    notifierEq(data);
    chargerModuleMateriel();
    if (typeof chargerEtatJeu === 'function') chargerEtatJeu();
}


