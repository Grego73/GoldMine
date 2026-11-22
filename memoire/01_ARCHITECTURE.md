# 🏗️ MÉMOIRE 1/2 : ARCHITECTURE & FICHIERS — GOLD MINE

## 1. Informations générales
- **Nom du projet :** Gold Mine (`gold-mine`)
- **Concept :** Simulation économique et gestion d'une mine d'or à ciel ouvert en temps réel (clôture quotidienne à 3h00, marché clients toutes les 4h, concurrence marketing entre PDG).
- **Environnement local :** Windows (`C:\Users\gre\Gold Mine`)
- **Dépôt GitHub :** `Grego73/GoldMine` sur `github.com` (branche `main`)
- **URL de production (Render) :** `https://onrender.com`
- **Stack Technique :** Node.js v24 + Express + Express-Session + PostgreSQL (`pg`) + Bcrypt + Front-end **100 % autonome** (HTML/CSS/JS natif, graphiques `<canvas>` natifs, zéro CDN externe).
- **Base de données :** PostgreSQL hébergée sur **Neon.tech** (projet `goldmine`, région AWS Europe Central 1 Frankfurt), isolée de TchatGC.

---

## 2. Variables d'environnement (`.env` / Render)
- `PORT=3000` : Port local (Render injecte son port `10000` en production).
- `DATABASE_URL` : Chaîne de connexion PostgreSQL Neon (`postgresql://...sslmode=require`).
- `SESSION_SECRET` : Clé secrète des cookies de session Express.
- `TCHATGC_URL` : URL de la communauté TchatGC (`GET /api/links`).
- `BREVO_API_KEY` : Clé API Brevo pour l'envoi des e-mails (validation d'inscription et mot de passe perdu).
- `BREVO_SENDER_EMAIL` : Adresse d'expédition validée sur Brevo.
- `NODE_ENV=production` : Active les cookies sécurisés HTTPS sur Render (`trust proxy`).

---

## 3. Arborescence complète du projet
```text
Gold Mine/
├── .env                        # Variables locales (ignoré par Git)
├── .gitignore                  # Exclut `node_modules/` et `.env`
├── package.json                # Dépendances (`start: node server.js`, express, pg, bcrypt, express-session, dotenv)
├── server.js                   # Point d'entrée Express + horloge serveur (60s) + `/api/links`, `/api/version` + anti-cache HTML
│
├── memoire/
│   ├── 01_ARCHITECTURE.md      # Ce fichier (technique, URLs, arborescence, règles)
│   └── 02_BASE_ET_SUIVI.md     # Structure SQL PostgreSQL (9 tables), gameplay temps réel et feuille de route
│
├── config/
│   ├── db.js                   # Connexion PostgreSQL (Pool) + création automatique des 9 tables SQL & peuplement initial
│   ├── gameConfig.js           # Cache en mémoire de `game_settings` (25 variables) + génération des 12 concessions
│   ├── eventsCatalog.js        # Catalogue extensible des incidents quotidiens de chantier
│   └── version.js              # Numéro de version unique (`APP_VERSION = '1.0.6'`) affiché uniquement dans l'Admin
│
├── utils/
│   ├── gameEngine.js           # Moteur temps réel : cycle marché 4h (10 clients) + clôture quotidienne 3h00 (avec rattrapage)
│   ├── helpers.js              # Fonctions réutilisables (`genererCodeSecurite`, `nettoyerEmail`, `TEXTES_SECOURS`)
│   ├── mailer.js               # Envoi d'e-mails via API Brevo (ou mode test dans les logs Render sans clé)
│   └── logger.js               # Enregistrement centralisé de l'activité des joueurs (`logJoueur`) dans `player_logs`
│
├── routes/
│   ├── authRoutes.js           # Texte accueil (`/welcome-text`), Inscription + code mail (`/register`, `/verify-email`), Connexion (`/login`), Mot de passe perdu (`/forgot-password`, `/reset-password`), Session (`/me`, `/logout`)
│   ├── gameRoutes.js           # État temps réel (`GET /state`), Actions mine/marketing (`POST /action`), Vente négociée clients (`POST /sell-client`), Choix événement (`POST /event-choice`), Classement (`GET /ranking`)
│   └── adminRoutes.js          # Gestion joueurs (`/users`, `/give-money`, `/toggle-ban`), Catalogue clients (`/clients-catalog`), 25 variables (`/settings`), Textes (`/texts`), Logs joueurs (`/player-logs`), Logs admin (`/logs`)
│
└── public/
    ├── favicon.png             # Icône mine d'or à ciel ouvert
    ├── index.html              # Page d'accueil vitrine + Connexion / Inscription / Validation code / Mot de passe perdu
    ├── game.html               # Interface compacte du jeu (QG, Fosse & Engins, Concessions, Clients & Marketing, Classement, Compte à rebours 3h00)
    ├── admin.html              # Dashboard d'administration (Joueurs, Catalogue Clients, 25 Variables, Textes, Logs, Version en ligne)
    ├── css/
    │   └── style.css           # Design compact haute densité 100 % autonome (noir/ardoise/or, grilles, tableaux, modales natives)
    └── js/
        ├── version.js          # Vérification anti-cache de la version affichée uniquement sur `admin.html`
        ├── auth.js             # Logique client de `index.html` (texte d'accueil, lien TchatGC, auth & validation mail)
        ├── main.js             # Logique client de `game.html` (graphique `<canvas>` natif, actions serveur, négociation clients `-15%/+15%`, comptes à rebours)
        └── admin.js            # Logique client de `admin.html` (joueurs, CRUD catalogue clients, 25 variables BDD, textes accueil, logs)
```

---

## 4. Règles critiques de code
1. **Zéro dépendance externe côté front-end :** Aucun CDN (ni Fomantic UI, ni jQuery, ni Chart.js externe). Tout le CSS, les modales et les graphiques `<canvas>` sont codés en interne dans `public/css/style.css` et `public/js/`.
2. **Sécurité 100 % côté serveur :** Aucune ressource (`argent`, `stock_or`) n'est modifiée par le client ; toutes les transactions et simulations passent par `routes/gameRoutes.js` et `utils/gameEngine.js`.
3. **Tout en variables et tables SQL :** Les paramètres d'équilibrage (`game_settings`) et les profils d'acheteurs (`clients_catalog`) sont modifiables en direct depuis `admin.html`.
4. **Version visible uniquement en Admin :** `version.js` n'affiche la version que sur `admin.html` (jamais sur les pages publiques).
5. **Pas de crochets `[]` contenant des chiffres dans les extraits partagés :** Privilégier `.at(0)` et `new Array(...)` lors des échanges de code.
