# 🏗️ MÉMOIRE 1/2 : ARCHITECTURE & FICHIERS — GOLD MINE

## 1. Informations générales
- **Nom du projet :** Gold Mine (`gold-mine`)
- **Concept :** Simulation économique et gestion d'une mine d'or à ciel ouvert (interface UI-driven inspirée d'Empire Immo).
- **Environnement local :** Windows (`C:\Users\gre\Gold Mine`)
- **Dépôt GitHub :** `Grego73/GoldMine` sur `github.com` (branche `main`)
- **URL de production (Render) :** `://onrender.com`
- **Monitoring anti-veille :** Route `GET /ping` sur `://onrender.com/ping` (UptimeRobot toutes les 5 min).
- **Stack Technique :** Node.js v24 + Express v5 + Express-Session + PostgreSQL (`pg`) + Bcrypt + Fomantic UI `2.9.3` + Chart.js.
- **Base de données :** PostgreSQL hébergée sur **Neon.tech** (projet `goldmine`, région AWS Europe Central 1 Frankfurt), isolée de TchatGC.

---

## 2. Variables d'environnement (`.env` / Render)
- `PORT=3000` : Port local (Render injecte son port en production).
- `DATABASE_URL` : Chaîne de connexion PostgreSQL Neon (`postgresql://...sslmode=require&channel_binding=require`).
- `SESSION_SECRET` : Clé secrète des cookies de session Express (30 jours).
- `APP_URL` : `https://://onrender.com` (lue par `config/links.js`).
- `TCHATGC_URL` : `https://onrender.com` (passerelle communauté TchatGC, lue par `config/links.js`).
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
├── server.js                   # Point d'entrée Express + `/ping`, `/api/links`, `/api/version`, anti-cache HTML + init BDD
│
├── memoire/
│   ├── 01_ARCHITECTURE.md      # Ce fichier (technique, URLs, arborescence, règles)
│   └── 02_BASE_ET_SUIVI.md     # Structure SQL PostgreSQL (6 tables), gameplay et feuille de route
│
├── config/
│   ├── db.js                   # Connexion PostgreSQL (Pool) + création automatique des 6 tables SQL & index
│   ├── gameConfig.js           # Cache en mémoire de `game_settings` + génération des 12 concessions
│   ├── links.js                # Centralisation unique des URLs (`APP_URL`, `TCHATGC_URL`, `brevoApiUrl`)
│   └── version.js              # Numéro de version unique (`APP_VERSION = '1.0.0'`) pour l'anti-cache CSS/JS
│
├── utils/
│   ├── authMiddleware.js       # Middlewares `requireAuth` (joueur connecté) et `requireAdmin` (rôle admin)
│   ├── helpers.js              # Fonctions réutilisables (`genererCodeSecurite`, `nettoyerEmail`, `TEXTES_SECOURS`)
│   ├── mailer.js               # Envoi d'e-mails via API Brevo (`LINKS.brevoApiUrl`)
│   └── logger.js               # Enregistrement centralisé de l'activité des joueurs (`logJoueur`) dans `player_logs`
│
├── routes/
│   ├── authRoutes.js           # Texte accueil (`/welcome-text`), Inscription + code mail (`/register`, `/verify-email`), Connexion (`/login`), Mot de passe perdu (`/forgot-password`, `/reset-password`), Session (`/me`, `/logout`)
│   ├── gameRoutes.js           # Chargement mine & config (`GET /state`), sauvegarde + logs joueurs (`POST /save`), Top 10 (`GET /ranking`)
│   └── adminRoutes.js          # Gestion joueurs (`/users`, `/give-money`, `/toggle-ban`), paramètres (`/settings`), textes (`/texts`), suivi joueurs (`/player-logs`), logs admin (`/logs`)
│
└── public/
    ├── index.html              # Page d'accueil vitrine + Connexion / Inscription / Validation code / Mot de passe perdu
    ├── game.html               # Interface du jeu (Quartier Général, Fosse & Engins, Concessions, Coffre & Bourse, Classement, Aide TchatGC)
    ├── admin.html              # Dashboard d'administration (Joueurs, Équilibrage, Textes accueil, Suivi activité joueurs, Logs Admin)
    ├── css/
    │   └── style.css           # Thème mine à ciel ouvert (ardoise `#1c1917`, pierre `#292524`, ocre `#d97706`, or `#fbbf24`)
    └── js/
        ├── auth.js             # Logique client de `index.html` (texte d'accueil, lien TchatGC, auth & validation mail)
        ├── main.js             # Moteur client de `game.html` (simulation quotidienne, graphiques, prospection, sync & logs PostgreSQL)
        └── admin.js            # Logique client de `admin.html` (joueurs, paramètres BDD, textes accueil, suivi logs joueurs)
```

---

## 4. Règles critiques de code
1. **Pas de crochets `[]` contenant des chiffres en JS :** Toujours utiliser `new Array(...)` et `.at(0)` pour éviter toute coupure de syntaxe lors des échanges.
2. **Séparation stricte :** HTML, CSS et JS toujours dans des fichiers séparés. Chaque nouveau module a sa route dans `routes/` et son script dans `public/js/`.
3. **Centralisation des liens & versions :** Ne jamais écrire d'URL en dur (`config/links.js`) et toujours incrémenter `config/version.js` + `?v=...` dans les pages HTML lors des modifications CSS/JS.
4. **Règle DRY :** Toute fonction répétée (génération de code, logs joueurs, textes de secours) va dans `utils/`.
