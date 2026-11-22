document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/version?t=' + Date.now());
        if (!res.ok) return;
        const data = await res.json();
        
        const elements = document.querySelectorAll('.app-version');
        elements.forEach((el) => {
            el.textContent = 'v' + data.version;
        });
    } catch (err) {
        console.error('Erreur chargement version :', err);
    }
});