function afficherNotificationAdmin(msg, isError = false) {
    const box = document.getElementById('admin-alert');
    box.className = isError ? 'ui red message' : 'ui green message';
    box.innerText = msg;
    box.style.display = 'block';
    setTimeout(() => { box.style.display = 'none'; }, 3500);
}

// 1. CHARGER LES JOUEURS
async function chargerJoueurs() {
    const res = await fetch('/api/admin/users');
    if (res.status === 401 || res.status === 403) {
        alert("Accès refusé. Réservé aux administrateurs.");
        window.location.href = '/index.html';
        return;
    }
    const users = await res.json();
    const tbody = document.getElementById('admin-users-list');
    tbody.innerHTML = '';

    users.forEach(u => {
        const tr = document.createElement('tr');
        const badgeVerif = u.is_verified
            ? '<span class="ui green mini label">Validé</span>'
            : '<span class="ui orange mini label">En attente</span>';

        tr.innerHTML = `
            <td>#${u.id}</td>
            <td><strong>${u.username}</strong> ${u.is_banned ? '<span class="ui red mini label">BANNI</span>' : ''}</td>
            <td>${u.email}</td>
            <td>${badgeVerif}</td>
            <td><span class="ui ${u.role === 'admin' ? 'yellow' : 'grey'} mini label">${u.role}</span></td>
            <td>J${u.jour || 1}</td>
            <td class="money-text">${Math.round(u.argent || 0).toLocaleString()} €</td>
            <td class="gold-text">${Math.round(u.stock_or || 0).toLocaleString()} g</td>
            <td>${u.foreuses || 1}</td>
            <td style="white-space: nowrap;">
                <button class="ui green mini button" onclick="donnerArgent(${u.id}, 10000)">+10k €</button>
                <button class="ui orange mini button" onclick="donnerArgent(${u.id}, -10000)">-10k €</button>
                <button class="ui red mini button" onclick="basculerBan(${u.id})">${u.is_banned ? 'Débannir' : 'Bannir'}</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function donnerArgent(userId, amount) {
    const res = await fetch('/api/admin/give-money', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount })
    });
    if (res.ok) {
        afficherNotificationAdmin(`Trésorerie mise à jour (${amount > 0 ? '+' : ''}${amount} €).`);
        chargerJoueurs();
        chargerLogs();
    }
}

async function basculerBan(userId) {
    const res = await fetch('/api/admin/toggle-ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
    });
    const data = await res.json();
    if (data.success) {
        afficherNotificationAdmin("Statut du joueur mis à jour.");
        chargerJoueurs();
        chargerLogs();
    } else {
        afficherNotificationAdmin(data.error, true);
    }
}

// 2. CHARGER ET MODIFIER LES PARAMÈTRES EN BASE
async function chargerParametres() {
    const res = await fetch('/api/admin/settings');
    if (!res.ok) return;
    const settings = await res.json();
    const grid = document.getElementById('admin-settings-grid');
    grid.innerHTML = '';

    settings.forEach(s => {
        const col = document.createElement('div');
        col.className = 'column';
        col.innerHTML = `
            <div style="background: #1c1917; border: 1px solid #44403c; padding: 12px; border-radius: 6px;">
                <label style="display: block; color: #fbbf24; font-weight: bold; margin-bottom: 5px; font-size: 0.9em;">${s.label}</label>
                <div class="ui fluid action input">
                    <input type="number" step="any" id="setting-${s.key}" value="${parseFloat(s.value)}">
                    <button class="ui yellow button" onclick="sauvegarderParametre('${s.key}')">💾</button>
                </div>
            </div>
        `;
        grid.appendChild(col);
    });
}

async function sauvegarderParametre(key) {
    const val = document.getElementById('setting-' + key).value;
    const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: val })
    });
    const data = await res.json();
    if (data.success) {
        afficherNotificationAdmin(`Paramètre "${key}" enregistré (${val}).`);
        chargerLogs();
    } else {
        afficherNotificationAdmin(data.error, true);
    }
}

// 3. CHARGER ET MODIFIER LES TEXTES DU SITE
async function chargerTextes() {
    const res = await fetch('/api/admin/texts');
    if (!res.ok) return;
    const texts = await res.json();
    const container = document.getElementById('admin-texts-container');
    container.innerHTML = '';

    texts.forEach(t => {
        const div = document.createElement('div');
        div.className = 'ui inverted form';
        div.style.cssText = 'background: #1c1917; border: 1px solid #44403c; padding: 15px; border-radius: 6px; margin-bottom: 10px;';
        div.innerHTML = `
            <div class="field">
                <label style="color: #fbbf24;">Titre principal (${t.key})</label>
                <input type="text" id="text-title-${t.key}" value="${t.title.replace(/"/g, '&quot;')}">
            </div>
            <div class="field">
                <label style="color: #fbbf24;">Description / But du jeu</label>
                <textarea rows="4" id="text-content-${t.key}">${t.content}</textarea>
            </div>
            <button class="ui yellow button" onclick="sauvegarderTexte('${t.key}')">
                <i class="save icon"></i> Enregistrer le texte d'accueil
            </button>
        `;
        container.appendChild(div);
    });
}

async function sauvegarderTexte(key) {
    const title = document.getElementById('text-title-' + key).value;
    const content = document.getElementById('text-content-' + key).value;

    const res = await fetch('/api/admin/texts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, title, content })
    });
    const data = await res.json();
    if (data.success) {
        afficherNotificationAdmin("Texte d'accueil mis à jour avec succès !");
        chargerLogs();
    } else {
        afficherNotificationAdmin(data.error, true);
    }
}

// 4. CHARGER LE SUIVI D'ACTIVITÉ DES JOUEURS
async function chargerLogsJoueurs() {
    const filter = document.getElementById('filter-player-log').value;
    const res = await fetch('/api/admin/player-logs?username=' + encodeURIComponent(filter));
    if (!res.ok) return;
    const logs = await res.json();
    const tbody = document.getElementById('admin-player-logs-list');

    tbody.innerHTML = logs.map(l => {
        const date = new Date(l.created_at).toLocaleString('fr-FR');
        let badgeColor = 'grey';
        if (l.category === 'AUTH') badgeColor = 'blue';
        if (l.category === 'FINANCE') badgeColor = 'green';
        if (l.category === 'PROSPECTION') badgeColor = 'orange';

        return `
            <tr>
                <td style="white-space: nowrap; color: #a8a29e;">${date}</td>
                <td><strong>${l.username}</strong></td>
                <td><span class="ui ${badgeColor} mini label">${l.category}</span></td>
                <td>${l.details}</td>
            </tr>
        `;
    }).join('');
}

// 5. CHARGER LES LOGS ADMIN
async function chargerLogs() {
    const res = await fetch('/api/admin/logs');
    if (!res.ok) return;
    const logs = await res.json();
    const box = document.getElementById('admin-logs-list');
    box.innerHTML = logs.map(l => {
        const date = new Date(l.created_at).toLocaleString('fr-FR');
        return `<div><span style="color:#fbbf24;">[${date}]</span> <strong>${l.admin_username}</strong> : ${l.action}</div>`;
    }).join('');
}

// Initialisation au chargement
chargerJoueurs();
chargerParametres();
chargerTextes();
chargerLogsJoueurs();
chargerLogs();
