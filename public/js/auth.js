let emailEnAttenteValidation = '';

// 1. VÉRIFICATION DE SESSION + CHARGEMENT TEXTE ACCUEIL & LIEN TCHATGC
(async function initialiserAccueil() {
    try {
        const resMe = await fetch('/api/auth/me');
        const dataMe = await resMe.json();
        if (dataMe.loggedIn) {
            window.location.href = '/game.html';
            return;
        }
    } catch (err) {
        console.error("Erreur vérification session :", err);
    }

    // Chargement du texte d'accueil depuis PostgreSQL
    try {
        const resText = await fetch('/api/auth/welcome-text');
        if (resText.ok) {
            const textData = await resText.json();
            const elTitle = document.getElementById('welcome-title');
            const elContent = document.getElementById('welcome-content');
            if (elTitle && textData.title) elTitle.innerText = textData.title;
            if (elContent && textData.content) elContent.innerText = textData.content;
        }
    } catch (err) {
        console.error("Erreur chargement texte accueil :", err);
    }

    // Chargement du lien passerelle TchatGC
    try {
        const resLinks = await fetch('/api/links');
        if (resLinks.ok) {
            const linksData = await resLinks.json();
            const elLink = document.getElementById('link-tchatgc');
            if (elLink && linksData.tchatgcUrl) elLink.href = linksData.tchatgcUrl;
        }
    } catch (err) {
        console.error("Erreur chargement liens :", err);
    }
})();

// 2. BASCULE ENTRE CONNEXION, INSCRIPTION, VALIDATION MAIL ET MOT DE PASSE PERDU
function afficherBloc(bloc) {
    const blocs = new Array('login', 'register', 'verify', 'forgot');
    blocs.forEach((nom) => {
        const el = document.getElementById('form-' + nom);
        if (el) el.style.display = bloc === nom ? 'block' : 'none';
    });
    const alertBox = document.getElementById('auth-message');
    if (alertBox) alertBox.style.display = 'none';
}

// Affiche un message d'erreur ou de succès
function afficherAlerte(texte, estErreur = true) {
    const box = document.getElementById('auth-message');
    if (!box) return;
    box.className = estErreur ? 'ui red message' : 'ui green message';
    box.innerText = texte;
    box.style.display = 'block';
}

// 3. ENVOI FORMULAIRE CONNEXION
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
    } else if (data.unverifiedEmail) {
        emailEnAttenteValidation = data.unverifiedEmail;
        const elDisplay = document.getElementById('verify-email-display');
        if (elDisplay) elDisplay.innerText = emailEnAttenteValidation;
        afficherBloc('verify');
        afficherAlerte(data.error, true);
    } else {
        afficherAlerte(data.error);
    }
};

// 4. ENVOI FORMULAIRE INSCRIPTION (ENVOIE LE CODE À 6 CHIFFRES)
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
    if (data.success && data.requireVerification) {
        emailEnAttenteValidation = data.email;
        const elDisplay = document.getElementById('verify-email-display');
        if (elDisplay) elDisplay.innerText = emailEnAttenteValidation;
        afficherBloc('verify');
        afficherAlerte("Un code de validation à 6 chiffres vient d'être envoyé par e-mail.", false);
    } else if (data.success) {
        window.location.href = '/game.html';
    } else {
        afficherAlerte(data.error);
    }
};

// 5. VALIDATION DU CODE REÇU PAR E-MAIL
const formVerify = document.getElementById('form-verify');
if (formVerify) {
    formVerify.onsubmit = async (e) => {
        e.preventDefault();
        const codeSaisi = document.getElementById('verify-code').value;
        const res = await fetch('/api/auth/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: emailEnAttenteValidation,
                code: codeSaisi
            })
        });
        const data = await res.json();
        if (data.success) {
            window.location.href = '/game.html';
        } else {
            afficherAlerte(data.error);
        }
    };
}

// 6. DEMANDE DE CODE MOT DE PASSE PERDU
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

// 7. VALIDATION DU NOUVEAU MOT DE PASSE AVEC LE CODE À 6 CHIFFRES
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
