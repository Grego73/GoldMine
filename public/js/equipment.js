let eqData = null;

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
                    <td><strong>${f.prod_tonnes} t/j</strong></td>
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
                    <td><strong>${r.prod_tonnes} t/j</strong></td>
                    <td>${r.carburant_jour} €/j</td>
                    <td class="money-text">${Math.round(r.loyer_jour).toLocaleString()} €/j</td>
                    <td><span class="ui blue label">${r.jours_restants} jour(s) restant(s)</span></td>
                </tr>
            `).join('');
        }
    }
}

// 2. BOUTIQUE NEUF (0% USURE)
function rendreBoutiqueNeuf() {
    const grid = document.getElementById('eq-shop-new-grid');
    if (!grid || !eqData) return;

    if (eqData.catalog.length === 0) {
        grid.innerHTML = '<p style="color:#a8a29e;">Catalogue vide (à configurer dans le Panel Admin).</p>';
        return;
    }

    grid.innerHTML = eqData.catalog.map(item => `
        <div class="ui inverted segment" style="display:flex; flex-direction:column; justify-content:space-between;">
            <div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span class="ui blue label">${item.categorie}</span>
                    <span class="ui yellow label">${item.gabarit || 'Moyen'}</span>
                </div>
                <h4 style="color:#fbbf24; margin-bottom:8px;">${item.nom}</h4>
                <p style="font-size:0.88em; color:#d6d3d1; margin-bottom:4px;">⛏️ Extraction : <strong>${item.prod_tonnes} t/jour</strong></p>
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

// 3. CONCESSIONNAIRES SPÉCIALISÉS & PIÈCES DÉTACHÉES
function rendreConcessionnaires() {
    const grid = document.getElementById('eq-dealers-grid');
    if (!grid || !eqData || !eqData.tarifsPieces) return;

    const familles = ['Excavation', 'Transport', 'Traitement', 'Lavage'];
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
                <td>${a.prod_tonnes} t/j<br><small>${a.carburant_jour} €/j</small></td>
                <td>${isBrocante ? '<span class="ui green label">Vente Directe</span>' : '<span class="ui orange label">Enchère</span>'}</td>
                <td class="money-text">${Math.round(a.prix_actuel).toLocaleString()} €<br><small style="color:#a8a29e;">${a.bidder_name ? 'Meneur : ' + a.bidder_name : 'Aucune offre'}</small></td>
                <td><strong>${heuresRest}h ${minsRest}m</strong></td>
                <td>${btnAction}</td>
            </tr>
        `;
    }).join('');
}

// 5. LOCATION D'ENGINS
function rendreLocationEngins() {
    const offTbody = document.getElementById('eq-official-rentals-tbody');
    if (offTbody && eqData) {
        offTbody.innerHTML = eqData.catalog.map(item => {
            const loyerEstime = Math.round(parseFloat(item.prix_neuf) * 0.08);
            return `
                <tr>
                    <td><strong>${item.nom}</strong> <span class="ui blue label">${item.categorie}</span> <span class="ui yellow label">${item.gabarit || 'Moyen'}</span></td>
                    <td><strong>${item.prod_tonnes} t/j</strong></td>
                    <td>${item.carburant_jour} €/j</td>
                    <td class="money-text">~${loyerEstime.toLocaleString()} €/j</td>
                    <td>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <input type="number" id="rent-days-${item.id}" min="1" max="7" value="2" style="width:65px; padding:5px;"> <span>j</span>
                            <button class="ui mini blue button" onclick="louerOfficiel(${item.id}, document.getElementById('rent-days-${item.id}').value)">🤝 Louer</button>
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
                    <td><strong>${o.prod_tonnes} t/j</strong></td>
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
async function acheterEnginNeuf(catalogId) {
    const res = await fetch('/api/equipment/buy-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalogId })
    });
    const data = await res.json();
    alert(data.message || data.error);
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
    alert(data.message || data.error);
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
    alert(data.message || data.error);
    chargerModuleMateriel();
}

async function reviserEngin(fleetId) {
    const res = await fetch('/api/equipment/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fleetId })
    });
    const data = await res.json();
    alert(data.message || data.error);
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
    alert(data.message || data.error);
    chargerModuleMateriel();
}

async function encherirOuAcheter(auctionId, montantOffre) {
    const res = await fetch('/api/equipment/bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auctionId, montantOffre })
    });
    const data = await res.json();
    alert(data.message || data.error);
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
    alert(data.message || data.error);
    chargerModuleMateriel();
}

async function louerOfficiel(catalogId, dureeJours) {
    const res = await fetch('/api/equipment/rent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType: 'OFFICIEL', catalogId, dureeJours })
    });
    const data = await res.json();
    alert(data.message || data.error);
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
    alert(data.message || data.error);
    chargerModuleMateriel();
    if (typeof chargerEtatJeu === 'function') chargerEtatJeu();
}
