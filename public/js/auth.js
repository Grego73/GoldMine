// Vérifie au chargement si le joueur a déjà une session active
(async function verifierSession() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.loggedIn) {
            window.location.href = '/game.html';
        }
    } catch (err) {
        console.error("Erreur vérification session :", err);
    }
})();

// Bascule entre Connexion, Inscription et Mot de passe perdu
function afficherBloc(bloc) {
    document.getElementById('form-login').style.display = bloc === 'login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = bloc === 'register' ? 'block' : 'none';
    document.getElementById('form-forgot').style.display = bloc === 'forgot' ? 'block' : 'none';
    document.getElementById('auth-message').style.display = 'none';
}

// Affiche un message d'erreur ou de succès
function afficherAlerte(texte, estErreur = true) {
    const box = document.getElementById('auth-message');
    box.className = estErreur ? 'ui red message' : 'ui green message';
    box.innerText = texte;
    box.style.display = 'block';
}

// Envoi formulaire Connexion
document.getElementById('form-login').onsubmit = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: document.getElementById('login-user').value,
            password: document.getElementById('login-pass').value
        })
    });
    const data = await res.json();
    if (data.success) {
        window.location.href = '/game.html';
    } else {
        afficherAlerte(data.error);
    }
};

// Envoi formulaire Inscription
document.getElementById('form-register').onsubmit = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: document.getElementById('reg-user').value,
            email: document.getElementById('reg-email').value,
            password: document.getElementById('reg-pass').value
        })
    });
    const data = await res.json();
    if (data.success) {
        window.location.href = '/game.html';
    } else {
        afficherAlerte(data.error);
    }
};

// Demande de code Mot de passe perdu
document.getElementById('form-forgot').onsubmit = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: document.getElementById('forgot-email').value
        })
    });
    const data = await res.json();
    if (data.success) {
        afficherAlerte(data.message, false);
        document.getElementById('reset-step2').style.display = 'block';
    } else {
        afficherAlerte(data.error);
    }
};

// Validation du nouveau mot de passe avec le code à 6 chiffres
async function validerNouveauMdp() {
    const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: document.getElementById('forgot-email').value,
            code: document.getElementById('reset-code').value,
            newPassword: document.getElementById('reset-newpass').value
        })
    });
    const data = await res.json();
    if (data.success) {
        afficherBloc('login');
        afficherAlerte(data.message, false);
    } else {
        afficherAlerte(data.error);
    }
}
