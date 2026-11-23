let bankData = null;

async function chargerModuleBanque() {
    try {
        const res = await fetch('/api/bank');
        if (!res.ok) return;
        bankData = await res.json();
        rendreModuleBanque();
    } catch (err) {
        console.error('Erreur chargement module banque :', err);
    }
}

function rendreModuleBanque() {
    if (!bankData) return;

    const kpiGrid = document.getElementById('bank-kpi-grid');
    if (kpiGrid) {
        kpiGrid.innerHTML = `
            <div class="statistic"><div class="value">${Math.round(bankData.patrimoineTotal).toLocaleString()} €</div><div class="label">Patrimoine Net (Flotte usée incluse)</div></div>
            <div class="statistic"><div class="value" style="color:#fbbf24;">${Math.round(bankData.plafondEmprunt).toLocaleString()} €</div><div class="label">Plafond Emprunt (${Math.round(bankData.ratioMax * 100)}%)</div></div>
            <div class="statistic"><div class="value" style="color:#f87171;">${Math.round(bankData.detteActuelle).toLocaleString()} €</div><div class="label">Encours de Dette Actuel</div></div>
            <div class="statistic"><div class="value" style="color:#34d399;">${Math.round(bankData.capaciteRestante).toLocaleString()} €</div><div class="label">Capacité Disponible</div></div>
        `;
    }

    const dafEl = document.getElementById('bank-daf-bonus');
    if (dafEl) {
        dafEl.innerHTML = bankData.hasDAF
            ? '👔 Bonus Directeur Administratif & Financier (DAF) actif : <strong>-1% sur les taux d’emprunt !</strong>'
            : '<span style="color:#a8a29e; font-weight:normal;">💡 Astuce : Recrutez un Directeur Administratif & Financier (DAF) dans RH pour obtenir -1% sur tous les taux d’intérêt.</span>';
    }

    const opt7 = document.getElementById('opt-save-7');
    const opt14 = document.getElementById('opt-save-14');
    if (opt7) opt7.innerText = `7 jours (+${Math.round(bankData.tauxEpargne7j * 100)}%)`;
    if (opt14) opt14.innerText = `14 jours (+${Math.round(bankData.tauxEpargne14j * 100)}%)`;

    const offersGrid = document.getElementById('bank-offers-grid');
    if (offersGrid) {
        offersGrid.innerHTML = bankData.banques.map(b => {
            const tauxPct = (b.tauxBase * 100).toFixed(1).replace('.0', '');
            const maxEmpruntable = Math.floor(bankData.capaciteRestante / (1 + b.tauxBase));
            const optionsDuree = b.durees.map(d => `<option value="${d}">${d} jours</option>`).join('');

            return `
                <div class="ui inverted segment" style="display:flex; flex-direction:column; justify-content:space-between;">
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <strong style="color:#fbbf24; font-size:1.05em;">${b.nom}</strong>
                            <span class="ui orange label">Taux : ${tauxPct}%</span>
                        </div>
                        <p style="font-size:0.88em; color:#d6d3d1; margin-bottom:10px;">${b.desc}</p>
                        <p style="font-size:0.85em; color:#a8a29e; margin-bottom:12px;">
                            Emprunt max possible ici : <strong style="color:#34d399;">${maxEmpruntable.toLocaleString()} €</strong>
                        </p>
                    </div>
                    <div style="background:#141210; padding:10px; border-radius:6px; border:1px solid #44403c;">
                        <div style="display:flex; gap:6px; margin-bottom:8px;">
                            <input type="number" id="loan-amt-${b.code}" min="500" max="${maxEmpruntable}" step="500" value="${Math.min(5000, maxEmpruntable)}" style="width:120px; padding:5px;" placeholder="Montant (€)">
                            <select id="loan-dur-${b.code}" style="padding:5px; flex:1;">
                                ${optionsDuree}
                            </select>
                        </div>
                        <button class="ui fluid yellow button" onclick="contracterEmprunt('${b.code}')" ${maxEmpruntable < 500 ? 'disabled' : ''}>
                            ✍️ Contracter ce prêt
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    const loansTbody = document.getElementById('bank-loans-tbody');
    if (loansTbody) {
        if (bankData.loans.length === 0) {
            loansTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#a8a29e;">Aucun emprunt en cours.</td></tr>';
        } else {
            loansTbody.innerHTML = bankData.loans.map(l => `
                <tr>
                    <td><strong>${l.banque_nom}</strong><br><small style="color:#a8a29e;">Capital : ${Math.round(l.montant_emprunte).toLocaleString()} € (${(parseFloat(l.taux_interet) * 100).toFixed(1)}%)</small></td>
                    <td style="color:#f87171;"><strong>${Math.round(l.restant_du).toLocaleString()} €</strong></td>
                    <td>${Math.round(l.echeance_jour).toLocaleString()} €/j</td>
                    <td><span class="ui yellow label">${l.jours_restants} j</span></td>
                    <td><button class="ui mini green button" onclick="rembourserAnticipe(${l.id})">✅ Solder</button></td>
                </tr>
            `).join('');
        }
    }

    const savingsTbody = document.getElementById('bank-savings-tbody');
    if (savingsTbody) {
        if (bankData.savings.length === 0) {
            savingsTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#a8a29e;">Aucun placement bloqué actif.</td></tr>';
        } else {
            savingsTbody.innerHTML = bankData.savings.map(s => `
                <tr>
                    <td><strong>${Math.round(s.montant_place).toLocaleString()} €</strong> (+${Math.round(parseFloat(s.taux_rendement) * 100)}%)</td>
                    <td class="money-text"><strong>${Math.round(s.gain_final).toLocaleString()} €</strong></td>
                    <td><span class="ui blue label">${s.jours_restants} j restant(s)</span></td>
                </tr>
            `).join('');
        }
    }
}

async function contracterEmprunt(banqueCode) {
    const montant = document.getElementById(`loan-amt-${banqueCode}`).value;
    const dureeJours = document.getElementById(`loan-dur-${banqueCode}`).value;

    const res = await fetch('/api/bank/borrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banqueCode, montant, dureeJours })
    });
    const data = await res.json();
    if (typeof afficherToast === 'function') afficherToast(data.message || data.error, !data.success);
    if (data.success) {
        await chargerModuleBanque();
        if (typeof chargerEtatJeu === 'function') await chargerEtatJeu();
    }
}

async function rembourserAnticipe(loanId) {
    const res = await fetch('/api/bank/repay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanId })
    });
    const data = await res.json();
    if (typeof afficherToast === 'function') afficherToast(data.message || data.error, !data.success);
    if (data.success) {
        await chargerModuleBanque();
        if (typeof chargerEtatJeu === 'function') await chargerEtatJeu();
    }
}

async function ouvrirPlacementEpargne() {
    const montant = document.getElementById('bank-save-amount').value;
    const dureeJours = document.getElementById('bank-save-days').value;

    const res = await fetch('/api/bank/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montant, dureeJours })
    });
    const data = await res.json();
    if (typeof afficherToast === 'function') afficherToast(data.message || data.error, !data.success);
    if (data.success) {
        await chargerModuleBanque();
        if (typeof chargerEtatJeu === 'function') await chargerEtatJeu();
    }
}
