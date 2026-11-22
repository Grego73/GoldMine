document.addEventListener('DOMContentLoaded', async () => {
    if (!window.location.pathname.includes('admin.html')) return;
    const el = document.querySelector('.app-version');
    if (!el) return;

    try {
        const res = await fetch('/api/version?t=' + Date.now());
        if (!res.ok) return;
        const data = await res.json();
        el.textContent = `✅ En ligne : v${data.version}`;
        el.style.color = '#4ade80';
    } catch (err) {
        el.textContent = '⚠️ Version inaccessible';
    }
});

