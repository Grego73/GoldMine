document.addEventListener('DOMContentLoaded', async () => {
    const el = document.querySelector('.app-version');
    if (!el) return;

    try {
        // 1. Récupère la vraie version actuellement en ligne sur Render
        const res = await fetch('/api/version?t=' + Date.now());
        if (!res.ok) return;
        const data = await res.json();
        const serverVersion = data.version;

        // 2. Compare avec la version mémorisée par le navigateur
        const cachedVersion = localStorage.getItem('goldmine_admin_version');

        if (!cachedVersion || cachedVersion === serverVersion) {
            el.textContent = `✅ En ligne : v${serverVersion} (À jour)`;
            el.style.color = '#4ade80';
        } else {
            el.textContent = `🔄 Serveur : v${serverVersion} | Cache local : v${cachedVersion} (Fais Ctrl+F5)`;
            el.style.color = '#fbbf24';
        }

        // 3. Met à jour la mémoire locale
        localStorage.setItem('goldmine_admin_version', serverVersion);
    } catch (err) {
        el.textContent = '⚠️ Version serveur inaccessible';
    }
});
