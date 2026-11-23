# 🏗️ MÉMOIRE 1/2 : ARCHITECTURE & FICHIERS — GOLD MINE

## 1. Informations générales
- **Nom du projet :** Gold Mine (`gold-mine`)
- **Concept :** Simulation économique et gestion d'une mine d'or à ciel ouvert en temps réel (extraction horaire par chantier, chaîne logistique 4 maillons, variateur de vitesse `t/h`, RH & Trombinoscope, concessionnaires de pièces détachées, facture hebdomadaire et marché clients toutes les 4h).
- **Environnement local :** Windows (`C:\Users\gre\Gold Mine`)
- **Dépôt GitHub :** `Grego73/GoldMine` sur `github.com` (branche `main`)
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

## 3. Arborescence complète du projet (v1.2.1)
```text
Gold Mine/
├── .env                        # Variables locales (ignoré par Git)
├── .gitignore                  # Exclut `node_modules/` et `.env`
├── package.json                # Dépendances (`start: node server.js`, express, pg, bcrypt, express-session, dotenv)
├── server.js                   # Point d'entrée Express + Mode Maintenance BDD strict + horloge serveur (60s) + anti-cache
│
├── memoire/
│   ├── 01_ARCHITECTURE.md      # Ce fichier (technique, URLs, arborescence, règles)
│   └── 02_BASE_ET_SUIVI.md     # Structure SQL PostgreSQL (13 tables), gameplay temps réel et feuille de route
│
├── config/
│   ├── db.js                   # Connexion PostgreSQL (Pool) + création propre des 13 tables SQL (sans ALTER TABLE)
│   ├── gameConfig.js           # Cache en mémoire 100 % alimenté par `game_settings` (aucune valeur de secours codée en dur)
│   ├── eventsCatalog.js        # Catalogue extensible des incidents quotidiens de chantier
│   ├── links.js                # Centralisation des URLs externes (TchatGC, API Brevo)
│   └── version.js              # Numéro de version unique (`APP_VERSION = '1.2.1'`) affiché uniquement dans l'Admin
│
├── utils/
│   ├── gameEngine.js           # Moteur temps réel : enchères expirées + marché 4h + extraction horaire (1h) + facture hebdo (7j)
│   ├── helpers.js              # Fonctions réutilisables (`genererCodeSecurite`, `nettoyerEmail`, `TEXTES_SECOURS`)
│   ├── mailer.js               # Envoi d'e-mails via `LINKS.brevoApiUrl` (ou mode test dans les logs Render sans clé)
│   └── logger.js               # Enregistrement centralisé de l'activité des joueurs (`logJoueur`) dans `player_logs`
│
├── routes/
│   ├── authRoutes.js           # Inscription + code mail, Connexion, Mot de passe perdu, Session (`/me`, `/logout`)
│   ├── gameRoutes.js           # État (`GET /state`), Actions mine/paiement facture, Vente négociée (bonus DAF/Géologue), Tutoriel (`POST /claim-tutorial`), Classement
│   ├── equipmentRoutes.js      # Parc Matériel (`GET /`), Boutique Neuf, Brocante/Enchères, Location, Concessionnaires pièces, Réparation pannes, Variateur `t/h`, Affectation secteur
│   ├── hrRoutes.js             # Gestion RH (`GET /`), Recrutement/Licenciement ouvriers (`POST /worker`) & Cadres Trombinoscope (`POST /cadre`)
│   └── adminRoutes.js          # Joueurs, Import massif & MAJ variables (`POST /settings-bulk`), Import massif & CRUD Engins/Clients, Textes, Logs
│
└── public/
    ├── favicon.png             # Icône mine d'or à ciel ouvert
    ├── index.html              # Page d'accueil vitrine + Connexion / Inscription / Validation code / Mot de passe perdu
    ├── game.html               # Interface QG (Fosse, Matériel & Concessionnaires, RH & Direction, Prospection & Chantiers, Bourse & Clients, Classement, Tutoriel)
    ├── regles.html             # Page complète Règles du jeu, Tutoriel 5 étapes & Guide TchatGC
    ├── admin.html              # Redirection automatique vers `/admin/index.html`
    ├── admin/
    │   ├── index.html          # Administration : Gestion des PDG & Comptes
    │   ├── settings.html       # Administration : Import massif & Modification des variables d'équilibrage en direct
    │   ├── catalog.html        # Administration : Import massif & CRUD Catalogue Engins (Familles, Gabarits, t/h, Pièces) & Clients
    │   ├── texts.html          # Administration : Édition des textes du site
    │   └── logs.html           # Administration : Logs Joueurs & Journal Admin
    ├── css/
    │   └── style.css           # Design compact haute densité 100 % autonome (menu 1 ligne, noir/ardoise/or, grilles, modales)
    └── js/
        ├── version.js          # Vérification anti-cache de la version affichée uniquement sur l'Admin
        ├── auth.js             # Logique client de `index.html`
        ├── main.js             # Logique client de `game.html` (graphique `<canvas>`, chantiers par secteur, variateur t/h, tutoriel, négociation)
        ├── equipment.js        # Logique client de l'onglet Matériel (Flotte, Boutique Neuf, Concessionnaires & Pièces, Enchères, Location)
        └── hr.js               # Logique client de l'onglet RH & Direction (ratios ouvriers + Trombinoscope 6 directeurs)
```

---

## 4. Règles critiques de code
1. **Zéro dépendance externe côté front-end :** Aucun CDN (ni Fomantic UI, ni jQuery, ni Chart.js externe). Tout le CSS, les modales et les graphiques `<canvas>` sont codés en interne.
2. **100 % Base de Données & Mode Maintenance strict :** Aucune variable d'équilibrage ni catalogue codé en dur dans le code source. Si la BDD est inaccessible ou non configurée, `server.js` bascule en mode maintenance (`503`) tout en laissant `/api/auth` et `/api/admin` accessibles pour l'administration.
3. **Sécurité 100 % côté serveur :** Toutes les transactions (ventes clients, achats neufs/pièces, surenchères avec blocage/remboursement des fonds, locations, recrutements, validation du tutoriel) utilisent des transactions SQL `BEGIN / COMMIT` avec verrous `FOR UPDATE`.
4. **Liens dynamiques :** Aucune URL externe écrite en dur dans les HTML ; utilisation de `config/links.js` via `/api/links`.
5. **Pas de crochets `[]` contenant des chiffres dans les extraits partagés :** Utiliser `.at(0)` et `new Array(...)` lors des échanges de code.
