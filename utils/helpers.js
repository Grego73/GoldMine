// FONCTIONS UTILITAIRES PARTAGÉES DANS TOUT LE PROJET

// 1. Génère un code de sécurité aléatoire à 6 chiffres (pour validation mail & mot de passe perdu)
function genererCodeSecurite() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// 2. Nettoie une adresse e-mail (minuscules + sans espaces)
function nettoyerEmail(email) {
    return (email || '').trim().toLowerCase();
}

// 3. Textes de secours si la base de données est momentanément indisponible
const TEXTES_SECOURS = {
    welcome_intro: {
        title: "Bienvenue dans Gold Mine — Simulation Minière",
        content: "Prenez la tête d'une exploitation aurifère à ciel ouvert ! Prospectez de nouveaux filons, gérez votre flotte d'excavatrices, surveillez le moral de vos équipes et spéculez sur le cours mondial de l'or."
    }
};

module.exports = { genererCodeSecurite, nettoyerEmail, TEXTES_SECOURS };
