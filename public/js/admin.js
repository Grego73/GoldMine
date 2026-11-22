function afficherNotificationAdmin(msg, isError = false) {
    const box = document.getElementById('admin-alert');
    box.className = isError ? 'ui red message' : 'ui green message';
    box.innerText = msg;
    box.style.display = 'block';
    setTimeout(() => { box.style.display = 'none'; }, 3500);
}

async function chargerJoueurs() {
    const res = await fetch('/api/admin/users');
    if (res.status === 401 || res.status === 403) {
        window.location.href = '/index.html';
        return;
    }
    const users = await res.json();
    document.getElementById('admin-users-list').innerHTML = users.map(u => `
        <tr>
            <td>#${u.id}</td>
            <td><strong>${u.username}</strong> ${u.is_banned ? '<span class="ui red label">BANNI</span>' : ''}</td>
            <td>${u.email}</td>
            <td>${u.is_verified ? '<span class="ui green label">Validé</span>' : '<span class="ui orange label">Attente</span>'}</td>
            <td><span class="ui ${u.role === 'admin' ? 'yellow' : ''} label">${u.role}</span></td>
            <td>J${u.jour || 1}</td>
            <td class="money-text">${Math.round(u.argent || 0).toLocaleString()} €</td>
            <td class="gold-text">${Math.round(u.stock_or || 0).toLocaleString()} g</td>
            <td>${Math.round(u.marketing_points || 10)} pts</td>
            <td style="white-space: nowrap;">
                <button class="ui green mini button" onclick="donnerArgent(${u.id}, 10000)">+10k€</button>
                <button class="ui orange mini button" onclick="donnerArgent(${u.id}, -10000)">-10k€</button>
                <button class="ui red mini button" onclick="basculerBan(${u.id})">${u.is_banned ? 'Débannir' : 'Bannir'}</button>
            </td>
        </tr>
    `).join('');
}

async function donnerArgent(userId, amount) {
    await fetch('/api/admin/give-money', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount })
    });
    afficherNotificationAdmin('Trésorerie mise à jour.');
    chargerJoueurs();
    chargerLogs();
}

async function basculerBan(userId) {
    await fetch('/api/admin/toggle-ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
    });
    afficherNotificationAdmin('Statut joueur mis à jour.');
    chargerJoueurs();
    chargerLogs();
}

async function chargerCatalogueClients() {
    const res = await fetch('/api/admin/clients-catalog');
    if (!res.ok) return;
    const list = await res.json();
    document.getElementById('admin-clients-catalog').innerHTML = list.map(c => `
        <tr>
            <td><strong>${c.nom}</strong></td>
            <td><span class="ui ${c.type_client === 'Particulier' ? 'green' : c.type_client === 'Événementiel' ? 'orange' : 'blue'} label">${c.type_client}</span></td>
            <td>${c.secteur}</td>
            <td>${c.min_gr}g — ${c.max_gr}g</td>
            <td>${Math.round(c.bonus_min * 100)}% à +${Math.round(c.bonus_max * 100)}%</td>
            <td>${c.poids_apparition}</td>
            <td><button class="ui red mini button" onclick="supprimerClientCatalogue(${c.id})">Supprimer</button></td>
        </tr>
    `).join('');
}

async function ajouterClientCatalogue() {
    const body = {
        nom: document.getElementById('new-client-nom').value,
        type_client: document.getElementById('new-client-type').value,
        secteur: document.getElementById('new-client-secteur').value,
        min_gr: parseFloat(document.getElementById('new-client-min').value),
        max_gr: parseFloat(document.getElementById('new-client-max').value),
        bonus_min: parseFloat(document.getElementById('new-client-bmin').value),
        bonus_max: parseFloat(document.getElementById('new-client-bmax').value),
        poids_apparition: parseInt(document.getElementById('new-client-poids').value)
    };
    if (!body.nom || !body.secteur) return afficherNotificationAdmin('Nom et secteur requis.', true);

    await fetch('/api/admin/clients-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    document.getElementById('new-client-nom').value = '';
    afficherNotificationAdmin('Client ajouté au catalogue !');
    chargerCatalogueClients();
    chargerLogs();
}

async function supprimerClientCatalogue(id) {
    await fetch('/api/admin/clients-catalog/' + id, { method: 'DELETE' });
    afficherNotificationAdmin('Client supprimé du catalogue.');
    chargerCatalogueClients();
    chargerLogs();
}

async function chargerParametres() {
    const res = await fetch('/api/admin/settings');
    if (!res.ok) return;
    const settings = await res.json();
    document.getElementById('admin-settings-grid').innerHTML = settings.map(s => `
        <div class="ui inverted segment">
            <label style="display:block; color:#fbbf24; font-weight:bold; margin-bottom:4px; font-size:0.85em;">${s.label}</label>
            <div class="ui action input">
                <input type="number" step="any" id="setting-${s.key}" value="${parseFloat(s.value)}">
                <button class="ui yellow mini button" onclick="sauvegarderParametre('${s.key}')">💾</button>
            </div>
        </div>
    `).join('');
}

async function sauvegarderParametre(key) {
    const val = document.getElementById('setting-' + key).value;
    await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: val })
    });
    afficherNotificationAdmin(`Variable "${key}" enregistrée (${val}).`);
    chargerLogs();
}

async function chargerTextes() {
    const res = await fetch('/api/admin/texts');
    if (!res.ok) return;
    const texts = await res.json();
    document.getElementById('admin-texts-container').innerHTML = texts.map(t => `
        <div class="ui form" style="background:#1c1917; padding:12px; border-radius:6px;">
            <div class="field"><label>Titre (${t.key})</label><input type="text" id="text-title-${t.key}" value="${t.title.replace(/"/g, '&quot;')}"></div>
            <div class="field"><label>Contenu</label><textarea rows="3" id="text-content-${t.key}">${t.content}</textarea></div>
            <button class="ui yellow button" onclick="sauvegarderTexte('${t.key}')">Enregistrer</button>
        </div>
    `).join('');
}

async function sauvegarderTexte(key) {
    await fetch('/api/admin/texts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            key,
            title: document.getElementById('text-title-' + key).value,
            content: document.getElementById('text-content-' + key).value
        })
    });
    afficherNotificationAdmin('Texte mis à jour.');
    chargerLogs();
}

async function chargerLogsJoueurs() {
    const filter = document.getElementById('filter-player-log').value;
    const res = await fetch('/api/admin/player-logs?username=' + encodeURIComponent(filter));
    if (!res.ok) return;
    const logs = await res.json();
    document.getElementById('admin-player-logs-list').innerHTML = logs.map(l => `
        <tr>
            <td style="color:#a8a29e; white-space:nowrap;">${new Date(l.created_at).toLocaleString('fr-FR')}</td>
            <td><strong>${l.username}</strong></td>
            <td><span class="ui label">${l.category}</span></td>
            <td>${l.details}</td>
        </tr>
    `).join('');
}

async function chargerLogs() {
    const res = await fetch('/api/admin/logs');
    if (!res.ok) return;
    const logs = await res.json();
    document.getElementById('admin-logs-list').innerHTML = logs.map(l =>
        `<div><span style="color:#fbbf24;">[${new Date(l.created_at).toLocaleString('fr-FR')}]</span> <strong>${l.admin_username}</strong> : ${l.action}</div>`
    ).join('');
}

chargerJoueurs();
chargerCatalogueClients();
chargerParametres();
chargerTextes();
chargerLogsJoueurs();
chargerLogs();
