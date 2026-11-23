let eqData = null;
let eqFiltreCategorie = 'TOUS';
let eqFiltreGabarit = 'TOUS';

function filtrerCatalogueBoutique(cat, gab) {
    if (cat !== null) eqFiltreCategorie = cat;
    if (gab !== null) eqFiltreGabarit = gab;
    rendreBoutiqueNeuf();
}

function trierCatalogueLogique(liste) {
    const ordreCat = { Excavation: 1, Transport: 2, Chargement: 3, Convoyage: 4, Traitement: 5, Lavage: 6 };
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

    if (eqData.myFleet.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#a8a29e;">Aucun engin en propriété. Achetez ou louez du matériel !</td></tr>';
    } else {
        tbody.innerHTML = eqData.myFleet.map(f => {
            const usure = Math.round(parseFloat(f.usure_actuelle));
            const gab = f.gabarit || 'Moyen';
            const nbPieces = parseInt(f.pieces_panne) || 1;

            const badgeStatut = f.statut === 'ACTIF'
                ? '<span class="ui green label">En service</span>'
                : f.statut === 'EN_PANNE'
                ? '<span class="ui red label">🚨 EN PANNE</span>'
                : f.statut === 'EN_VENTE'
                ? '<span class="ui orange label">En vente / Enchère</span>'
                : f.statut === 'OFFRE_LOC'
                ? '<span class="ui blue label">Offre location</span>'
                : '<span class="ui yellow label">Loué à un PDG</span>';

            let actions = '<span style="color:#a8a29e;font-size:0.85em;">Indisponible (contrat en cours)</span>';
            if (f.statut === 'EN_PANNE') {
                actions = `<button class="ui mini red button" onclick="reparerPanne(${f.id})">🚨 Réparer (${nbPieces} pièce(s) ${f.categorie} ${gab})</button>`;
            } else if (f.statut === 'OFFRE_LOC') {
                actions = `<button class="ui mini red button" onclick="annulerOffreLocation(${f.id})">❌ Retirer l'offre</button>`;
            } else if (f.statut === 'ACTIF') {
                actions = `
                    <button class="ui mini blue button" onclick="reviserEngin(${f.id})">🔧 Réviser (-25%)</button>
                    <button class="ui mini orange button" onclick="ouvrirVenteEngin(${f.id})">🏷️ Vendre</button>
                    <button class="ui mini green button" onclick="ouvrirLocationEngin(${f.id})">🤝 Louer</button>
                `;
            }

            return `
                <tr>
                    <td><strong>${f.nom}</strong><br><small style="color:#a8a29e;">${f.categorie} — Gabarit : <strong style="color:#fbbf24;">${gab}</strong></small></td>
                    <td><strong>${f.vitesse_min_th}-${f.vitesse_max_th} t/h</strong></td>
                    <td>${f.carburant_jour} €/j</td>
                    <td><strong style="color:${usure > 60 ? '#f87171' : '#34d399'};">${usure}%</strong> (+${f.usure_jour}%/j)</td>
                    <td>${badgeStatut}</td>
                    <td>${actions}</td>
                </tr>
            `;
        }).join('');
    }

    const locTbody = document.getElementById('eq-my-rentals-tbody');
    if (locTbody) {
        if (eqData.myActiveRentals.length === 0) {
            locTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#a8a29e;">Aucune location en cours.</td></tr>';
        } else {
            locTbody.innerHTML = eqData.myActiveRentals.map(r => `
                <tr>
                    <td><strong>${r.nom}</strong> (${r.source_type === 'OFFICIEL' ? 'Parc Officiel' : 'PDG ' + r.owner_name})</td>
                    <td><strong>${r.vitesse_min_th}-${r.vitesse_max_th} t/h</strong></td>
                    <td>${r.carburant_jour} €/j</td>
                    <td class="money-text">${Math.round(r.loyer_jour).toLocaleString()} €/j</td>
                    <td><span class="ui blue label">${r.jours_restants} jour(s) restant(s)</span></td>
                </tr>
            `).join('');
        }
    }
}

// 2. BOUTIQUE NEUF (0% USURE + FILTRES PAR TYPE & GABARIT)
function rendreBoutiqueNeuf() {
    const grid = document.getElementById('eq-shop-new-grid');
    if (!grid || !eqData) return;

    let toolbar = document.getElementById('eq-shop-filters');
    if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.id = 'eq-shop-filters';
        toolbar.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; margin-bottom:14px; padding:10px; background:#1c1917; border-radius:6px; border:1px solid #44403c;';
        grid.parentNode.insertBefore(toolbar, grid);
    }

    const categories = [
        { id: 'TOUS', label: '🌐 Tous' },
        { id: 'Excavation', label: '⛏️ Excavation' },
        { id: 'Transport', label: '🚛 Transport' },
        { id: 'Chargement', label: '🚜 Chargement' },
        { id: 'Convoyage', label: '📥 Trémie & Convoyeur' },
        { id: 'Traitement', label: '⚙️ Traitement' },
        { id: 'Lavage', label: '💧 Lavage' }
    ];
    const gabarits = [
        { id: 'TOUS', label: 'Tous gabarits' },
        { id: 'Petit', label: 'Petit' },
        { id: 'Moyen', label: 'Moyen' },
        { id: 'Géant', label: 'Géant' }
    ];

    toolbar.innerHTML = `
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${categories.map(c => `
                <button class="ui mini ${eqFiltreCategorie === c.id ? 'yellow' : ''} button" onclick="filtrerCatalogueBoutique('${c.id}', null)">${c.label}</button>
            `).join('')}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
            <span style="font-size:0.85em; color:#a8a29e;">Gabarit :</span>
            ${gabarits.map(g => `
                <button class="ui mini ${eqFiltreGabarit === g.id ? 'blue' : ''} button" onclick="filtrerCatalogueBoutique(null, '${g.id}')">${g.label}</button>
            `).join('')}
        </div>
    `;

    let liste = trierCatalogueLogique(eqData.catalog);
    if (eqFiltreCategorie !== 'TOUS') {
        liste = liste.filter(item => item.categorie === eqFiltreCategorie);
    }
    if (eqFiltreGabarit !== 'TOUS') {
        liste = liste.filter(item => (item.gabarit || 'Moyen') === eqFiltreGabarit);
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
                <p style="font-size:0.88em; color:#d6d3d1; margin-bottom:4px;">⛏️ Débit : <strong>${item.vitesse_min_th}-${item.vitesse_max_th} t/h</strong></p>
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
// 3. CONCESSIONNAIRES SPÉCIALISÉS & PIÈCES DÉTACHÉES (6 FAMILLES)
function rendreConcessionnaires() {
    const grid = document.getElementById('eq-dealers-grid');
    if (!grid || !eqData || !eqData.tarifsPieces) return;

    const familles = ['Excavation', 'Transport', 'Chargement', 'Convoyage', 'Traitement', 'Lavage'];
    const gabarits = ['Petit', 'Moyen', 'Géant'];
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

    if (eqData.auctions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#a8a29e;">Aucune vente d’occasion ni enchère en cours.</td></tr>';
        return;
    }

    tbody.innerHTML = eqData.auctions.map(a => {
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
                <td>${a.vitesse_min_th || 2}-${a.vitesse_max_th || 5} t/h<br><small>${a.carburant_jour} €/j</small></td>
                <td>${isBrocante ? '<span class="ui green label">Vente Directe</span>' : '<span class="ui orange label">Enchère</span>'}</td>
                <td class="money-text">${Math.round(a.prix_actuel).toLocaleString()} €<br><small style="color:#a8a29e;">${a.bidder_name ? 'Meneur : ' + a.bidder_name : 'Aucune offre'}</small></td>
                <td><strong>${heuresRest}h ${minsRest}m</strong></td>
                <td>${btnAction}</td>
            </tr>
        `;
    }).join('');
}

// 5. LOCATION D'ENGINS (TRIÉE + BADGES ALIGNÉS À DROITE + OFFRES PDG)
function rendreLocationEngins() {
    const offTbody = document.getElementById('eq-official-rentals-tbody');
    if (offTbody && eqData) {
        const coeff = parseFloat(eqData.coeffLoyerJeu) || 0.08;
        const listeTriee = trierCatalogueLogique(eqData.catalog);
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
                    <td><strong>${item.vitesse_min_th}-${item.vitesse_max_th} t/h</strong></td>
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
        if (eqData.rentalOffers.length === 0) {
            pdgTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#a8a29e;">Aucun PDG ne propose d’engin en location actuellement.</td></tr>';
        } else {
            pdgTbody.innerHTML = eqData.rentalOffers.map(o => `
                <tr>
                    <td><strong>${o.nom}</strong><br><small>Propriétaire : ${o.owner_name}</small></td>
                    <td><strong>${o.vitesse_min_th || 2}-${o.vitesse_max_th || 5} t/h</strong></td>
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

