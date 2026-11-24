# 🏗️ MÉMOIRE 1/2 : ARCHITECTURE & FICHIERS — GOLD MINE (V1.3.5)

## ⛔ RÈGLES IMPÉRATIVES DE COLLABORATION (NE JAMAIS ENFREINDRE)
1. **INTERDICTION DE RÉÉCRIRE UN FICHIER EN ENTIER :** Ne jamais régénérer un fichier complet existant (cela provoque des coupures et des pertes de code). Toujours donner **uniquement le petit bloc précis à modifier ou ajouter**, accompagné des 2 lignes juste avant et juste après pour le repérage.
2. **UN SEUL FICHIER À LA FOIS :** Toujours avancer étape par étape, un fichier après l'autre, en attendant la confirmation de l'utilisateur avant de passer au suivant.
3. **100 % BASE DE DONNÉES & MODE MAINTENANCE STRICT :** Zéro valeur hardcodée en métier. Si la BDD est inaccessible ou vide, `server.js` bascule en mode maintenance (`503`) tout en laissant `/api/auth` et `/api/admin` accessibles.
4. **PAS DE CROCHETS `[]` AVEC CHIFFRES DANS LES EXTRAITS PARTAGÉS :** Utiliser `.at(0)` et `new Array(...)`.

---

## 1. Informations générales
- **Nom du projet :** Gold Mine (`gold-mine`) — Version `1.3.5`
- **Concept :** Simulation économique et gestion d'une mine d'or à ciel ouvert en temps réel (extraction horaire par chantier, forage selon profondeur 10–60 m, décapage des terres stériles après carottage, chaîne logistique 7 maillons, variateur `t/h`, grues Niv. 1–3, RH & Trombinoscope, 10 concessionnaires de pièces détachées, banques/emprunts plafonnés à 33 % du patrimoine net + épargne bloquée, facture hebdomadaire et marché clients dynamique toutes les 4h).
- **Environnement local :** Windows (`C:\Users\gre\Gold Mine`)
- **Dépôt GitHub :** `Grego73/GoldMine` sur `github.com` (branche `main`)
- **Stack Technique :** Node.js v24 + Express + Express-Session + PostgreSQL (`pg`) + Bcrypt + Front-end **100 % autonome** (HTML/CSS/JS natif, graphiques `<canvas>` natifs, zéro CDN externe).
- **Base de données :** PostgreSQL hébergée sur **Neon.tech** (projet `goldmine`, région AWS Europe Central 1 Frankfurt).

---

## 2. Variables d'environnement (`.env` / Render)
- `PORT=3000` : Port local (Render injecte `10000` en production).
- `DATABASE_URL` : Chaîne de connexion PostgreSQL Neon (`postgresql://...sslmode=require`).
- `SESSION_SECRET` : Clé secrète des cookies de session Express.
- `TCHATGC_URL` : URL de la communauté TchatGC (`GET /api/links`).
- `BREVO_API_KEY` : Clé API Brevo pour l'envoi des e-mails.
- `BREVO_SENDER_EMAIL` : Adresse d'expédition validée sur Brevo.
- `NODE_ENV=production` : Active les cookies sécurisés HTTPS sur Render (`trust proxy`).

---

## 3. Arborescence complète du projet (v1.3.5)
```text
Gold Mine/
├── .env                        # Variables locales (ignoré par Git)
├── .gitignore                  # Exclut `node_modules/` et `.env`
├── package.json                # Dépendances + `"version": "1.3.5"`
├── server.js                   # Point d'entrée Express + Mode Maintenance BDD strict + horloge serveur (60s)
│
├── memoire/
│   ├── 01_ARCHITECTURE.md      # Ce fichier (règles strictes, technique, arborescence)
│   └── 02_BASE_ET_SUIVI.md     # Structure SQL PostgreSQL (15 tables), gameplay temps réel et feuille de route
│
├── config/
│   ├── db.js                   # Connexion PostgreSQL (Pool) + création propre des 15 tables SQL
│   ├── gameConfig.js           # Cache en mémoire 100 % alimenté par `game_settings`
│   ├── eventsCatalog.js        # Catalogue des incidents quotidiens de chantier
│   ├── links.js                # Centralisation des URLs externes (TchatGC, API Brevo)
│   └── version.js              # Numéro de version unique
│
├── utils/
│   ├── gameEngine.js           # Moteur temps réel : enchères + marché 4h + décapage & extraction horaire 7 étapes (1h) + facture hebdo (7j) + échéances prêts & épargnes (24h)
│   ├── helpers.js              # Fonctions réutilisables (`genererCodeSecurite`, `nettoyerEmail`, `TEXTES_SECOURS`)
│   ├── mailer.js               # Envoi d'e-mails via `LINKS.brevoApiUrl`
│   └── logger.js               # Enregistrement centralisé de l'activité des joueurs (`logJoueur`) dans `player_logs`
│
├── routes/
│   ├── authRoutes.js           # Inscription + code mail, Connexion, Mot de passe perdu, Session (`/me`, `/logout`)
│   ├── gameRoutes.js           # État (`GET /state` + `orAujourdhui`), Actions mine (carottage avec vérif profondeur/foreuse + init décapage, orpaillage max 10, cadence 0.5–1.5, facture), Vente négociée, Tutoriel, Classement
│   ├── equipmentRoutes.js      # Parc Matériel (`GET /`), Boutique Neuf, Brocante/Enchères, Location (+ annulation offre), 10 Concessionnaires pièces, Réparation pannes avec vérif Grue Niv. 1–3, Variateur `t/h`, Affectation secteur
│   ├── hrRoutes.js             # Gestion RH (`GET /`, 2 conducteurs/engin roulant + 1 mécano/installation fixe + 1/3 roulants), Trombinoscope 6 directeurs
│   ├── bankRoutes.js           # Module Bancaire (`GET /`, calcul patrimoine net avec usure flotte, emprunts plafond 33%, remboursement anticipé, épargne bloquée 7j/14j)
│   └── adminRoutes.js          # Joueurs, Import massif & MAJ variables, Import massif & CRUD Engins/Clients, Textes, Logs, Comparaison version serveur vs GitHub (`/api/admin/version`)
│
└── public/
    ├── favicon.png             # Icône mine d'or à ciel ouvert
    ├── index.html              # Page d'accueil vitrine + Connexion / Inscription / Validation code / Mot de passe perdu
    ├── game.html               # Interface QG (Fosse & ventilation frais cliquable, Matériel & 10 Concessionnaires, RH & Direction, Prospection 10-60m, Bourse, Banques, Classement, Tutoriel)
    ├── regles.html             # Page complète Règles du jeu, Tutoriel 5 étapes & Guide TchatGC
    ├── admin.html              # Redirection automatique vers `/admin/users.html`
    ├── admin/
    │   ├── users.html          # Administration : Gestion des PDG & Comptes + bandeau version serveur vs GitHub
    │   ├── settings.html       # Administration : Import massif & Modification des variables d'équilibrage
    │   ├── catalog.html        # Administration : Import massif & CRUD Catalogue Engins (10 Familles, badges Famille/Gabarit collés) & Clients
    │   ├── texts.html          # Administration : Édition des textes du site
    │   └── logs.html           # Administration : Logs Joueurs & Journal Admin
    ├── css/
    │   └── style.css           # Design compact haute densité 100 % autonome
    └── js/
        ├── version.js          # Vérification version Admin
        ├── auth.js             # Logique client de `index.html`
        ├── main.js             # Logique client de `game.html` (bulle toast haut gauche, détail extraction orpaillage, ventilation frais, carte profondeurs 10-60m & décapage, variateur t/h, tutoriel, négociation)
        ├── equipment.js        # Logique client de l'onglet Matériel (Flotte, Boutique Neuf, 10 Concessionnaires, Enchères, Location)
        ├── hr.js               # Logique client de l'onglet RH & Direction
        └── bank.js             # Logique client de l'onglet Banques, Emprunts & Épargne
```
