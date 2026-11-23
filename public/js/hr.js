async function chargerModuleRH() {
    try {
        const res = await fetch('/api/hr');
        if (!res.ok) return;
        const data = await res.json();
        rendreEffectifsTerrain(data);
        rendreTrombinoscope(data);
    } catch (e) {
        console.error('Erreur chargement module RH :', e);
    }
}

function rendreEffectifsTerrain(data) {
    const grid = document.getElementById('hr-workers-grid');
    if (!grid) return;

    const eff = data.effectifs;
    const req = data.requis;
    const t = data.tarifs;

    const postes = [
        {
            roleType: 'conducteur',
            titre: '🚜 Conducteurs d’Engins (poste 12h/24)',
            actuel: eff.conducteurs,
            requis: req.conducteurs,
            regle: `2 conducteurs requis par engin actif (${req.nbEngins} engin(s)). 1 seul conducteur = rendement et usure divisés par 2.`,
            cout: t.coutConducteur,
            salaire: t.salaireConducteurJour
        },
        {
            roleType: 'mecano',
            titre: '🔧 Mécaniciens de Maintenance',
            actuel: eff.mecaniciens,
            requis: req.mecaniciens,
            regle: '1 mécanicien requis pour 3 engins. En sous-effectif, l’usure quotidienne augmente fortement.',
            cout: t.coutMecano,
            salaire: t.salaireMecanoJour
        },
        {
            roleType: 'chef',
            titre: '👷 Chefs d’Équipe (Superviseurs)',
            actuel: eff.chefsEquipe,
            requis: req.chefsEquipe,
            regle: '1 chef requis pour 1 à 8 ouvriers (conducteurs + mécanos), 2 chefs de 9 à 16, etc. Sinon -20% de production.',
            cout: t.coutChef,
            salaire: t.salaireChefJour
        }
    ];

    grid.innerHTML = postes.map(p => {
        const ok = p.actuel >= p.requis;
        const badge = ok
            ? `<span class="ui green label">✅ Effectif complet (${p.actuel} / ${p.requis})</span>`
            : `<span class="ui red label">⚠️ Sous-effectif (${p.actuel} / ${p.requis} requis)</span>`;

        return `
            <div class="ui inverted segment" style="display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                    <h4 style="color:#fbbf24; margin-bottom:8px;">${p.titre}</h4>
                    <div style="margin-bottom:10px;">${badge}</div>
                    <p style="font-size:0.88em; color:#d6d3d1; margin-bottom:10px;">${p.regle}</p>
                    <p style="font-size:0.85em; color:#a8a29e;">Recrutement : <strong>${Math.round(p.cout).toLocaleString()} €</strong> | Salaire : <strong>${Math.round(p.salaire).toLocaleString()} €/j</strong></p>
                </div>
                <div class="ui two buttons" style="margin-top:12px;">
                    <button class="ui green button" onclick="gererOuvrier('${p.roleType}', 'hire')">+ Recruter</button>
                    <button class="ui red button" onclick="gererOuvrier('${p.roleType}', 'fire')">- Licencier</button>
                </div>
            </div>
        `;
    }).join('');
}

function rendreTrombinoscope(data) {
    const badgeComplet = document.getElementById('hr-trombi-status');
    if (badgeComplet) {
        const pct = Math.round((data.tarifs.bonusCompletPct || 0.15) * 100);
        badgeComplet.innerHTML = data.trombinoscopeComplet
            ? `<span class="ui green label">🏆 TROMBINOSCOPE COMPLET : Bonus Synergie +${pct}% sur toute la production d'or actif !</span>`
            : `<span class="ui yellow label">Recrutez les 6 Directeurs pour débloquer le Bonus Synergie de +${pct}% sur la production d'or.</span>`;
    }

    const grid = document.getElementById('hr-trombi-grid');
    if (!grid) return;

    const cout = Math.round(data.tarifs.coutCadre).toLocaleString();
    const salaire = Math.round(data.tarifs.salaireCadreJour).toLocaleString();

    grid.innerHTML = data.trombinoscope.map(c => `
        <div class="ui inverted segment" style="border-left: 4px solid ${c.recrute ? '#34d399' : '#57534e'}; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
                <span class="ui blue label" style="margin-bottom:6px;">${c.pole}</span>
                <h4 style="color:#fbbf24; margin-bottom:6px;">👔 ${c.poste}</h4>
                <p style="font-size:0.9em; color:#34d399; margin-bottom:8px;">✨ ${c.bonusDesc}</p>
                <p style="font-size:0.82em; color:#a8a29e;">Signature : ${cout} € | Salaire : ${salaire} €/j</p>
            </div>
            <div style="margin-top:10px;">
                ${c.recrute
                    ? `<button class="ui fluid red mini button" onclick="gererCadre('${c.code}', 'fire')">Relever de ses fonctions</button>`
                    : `<button class="ui fluid green button" onclick="gererCadre('${c.code}', 'hire')">✍️ Recruter ce Directeur</button>`
                }
            </div>
        </div>
    `).join('');
}

async function gererOuvrier(roleType, action) {
    const res = await fetch('/api/hr/worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleType, action })
    });
    const data = await res.json();
    if (typeof afficherToast === 'function') {
        afficherToast(data.message || data.error, !data.success);
    } else {
        alert(data.message || data.error);
    }
    chargerModuleRH();
    if (typeof chargerEtatJeu === 'function') chargerEtatJeu();
}

async function gererCadre(code, action) {
    const res = await fetch('/api/hr/cadre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, action })
    });
    const data = await res.json();
    if (typeof afficherToast === 'function') {
        afficherToast(data.message || data.error, !data.success);
    } else {
        alert(data.message || data.error);
    }
    chargerModuleRH();
    if (typeof chargerEtatJeu === 'function') chargerEtatJeu();
}
