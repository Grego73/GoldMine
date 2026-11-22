# 📋 FICHIER MÉMOIRE DU PROJET — GOLD MINE

## 1. Informations générales & Architecture
- **Nom du projet :** Gold Mine (`gold-mine`)
- **Concept :** Jeu de simulation et gestion économique d'une mine d'or à ciel ouvert (interface UI-driven inspirée d'Empire Immo, sans déplacement 2D/3D).
- **Environnement local :** Windows (`C:\Users\gre\Gold Mine`)
- **Stack Technique :** Node.js + Express + Express-Session + PostgreSQL (`pg`) + Bcrypt + Fomantic UI `2.9.4` + Chart.js.
- **Base de données :** PostgreSQL hébergée sur **Neon.tech** (projet `goldmine`, région AWS Europe Central 1 Frankfurt), totalement isolée de TchatGC.
- **Règle de séparation :** Projet 100 % indépendant de TchatGC (dépôt, base de données et code séparés), avec possibilité future de passerelles/liens vers la communauté TchatGC.

---

## 2. Variables d'environnement (`.env`)
- `PORT=3000` : Port d'écoute du serveur local.
- `DATABASE_URL` : Chaîne de connexion PostgreSQL Neon (`postgresql://...sslmode=require&channel_binding=require`).
- `SESSION_SECRET` : Clé secrète pour les cookies de session Express (durée 30 jours).

---

## 3. Arborescence complète du projet (`C:\Users\gre\Gold Mine`)
```text
Gold Mine/
├── .env                        # Variables d'environnement locales (DATABASE_URL, SESSION_SECRET, PORT)
├── MEMOIRE.md                  # Ce fichier mémoire de suivi du projet
├── package.json                # Dépendances Node.js (express, pg, bcrypt, express-session, dotenv)
├── server.js                   # Point d'entrée serveur Express + initialisation BDD + chargement config
│
├── config/
│   ├── db.js                   # Connexion PostgreSQL (Pool) + création automatique des 4 tables SQL & index
│   └── gameConfig.js           # Cache en mémoire de la table `game_settings` + génération des 12 concessions
│
├── utils/
│   └── authMiddleware.js       # Middlewares de sécurité `requireAuth` (joueur connecté) et `requireAdmin` (rôle admin)
│
├── routes/
│   ├── authRoutes.js           # Inscription (`POST /register`, 1er inscrit = admin), Connexion (`POST /login`), Mot de passe perdu (`POST /forgot-password` & `/reset-password`), Session (`GET /me`), Déconnexion (`POST /logout`)
│   ├── gameRoutes.js           # Chargement mine & config (`GET /state`), sauvegarde PostgreSQL (`POST /save`), Top 10 (`GET /ranking`)
│   └── adminRoutes.js          # Gestion joueurs (`GET /users`, `POST /give-money`, `POST /toggle-ban`), édition paramètres BDD (`GET/POST /settings`), logs (`GET /logs`)
│
└── public/
    ├── index.html              # Portail d'accueil : Connexion, Inscription et Mot de passe perdu
    ├── game.html               # Interface principale du jeu (Quartier Général, Fosse & Engins, Concessions, Coffre & Bourse, Classement)
    ├── admin.html              # Dashboard d'administration (Joueurs, Équilibrage `game_settings`, Logs)
    ├── css/
    │   └── style.css           # Feuille de style globale (thème mine à ciel ouvert : ardoise `#1c1917`, pierre `#292524`, ocre `#d97706`, or `#fbbf24`)
    └── js/
        ├── auth.js             # Logique client de `index.html` (vérification session auto, appels API auth)
        ├── main.js             # Moteur client de `game.html` (simulation quotidienne, graphiques Chart.js, prospection, événements, sync PostgreSQL)
        └── admin.js            # Logique client de `admin.html` (gestion joueurs, sauvegarde en direct des 18 paramètres BDD)
```

---

## 4. Base de données PostgreSQL (`config/db.js`)
1. **`users`** : `id`, `username` (UNIQUE), `email` (UNIQUE), `password_hash`, `role` (`'player'` ou `'admin'`, le 1er inscrit reçoit `'admin'`), `is_banned`, `reset_code`, `reset_expires`, `created_at`.
2. **`mines`** : `user_id` (PK, FK `users.id`), `jour`, `argent`, `stock_or`, `cours_or`, `mineurs`, `moral`, `foreuses`, `usure`, `parcelle_active`, `parcelles_json` (JSONB des 12 secteurs A à L), `updated_at`.
3. **`admin_logs`** : `id`, `admin_username`, `action`, `created_at`.
4. **`game_settings`** : `key` (PK), `value`, `label` — Contient les **18 paramètres d'équilibrage** modifiables en direct depuis `admin.html` (`argentDepart`, `coursOrInitial`, `coursOrMin`, `coursOrMax`, `taxeMiniere`, `coutMineur`, `coutForeuse`, `coutRevision`, `coutPrime`, `coutCarottage`, `coutDemenagement`, `coutPanneForcee`, `salaireMineurJour`, `carburantForeuseJour`, `prodMineurTonnes`, `prodForeuseTonnes`, `usureParForeuse`, `chanceEvenement`).

---

## 5. Règles critiques de syntaxe et d'architecture
1. **Éviter les crochets `[]` contenant des chiffres en JS :** Toujours utiliser `new Array(...)` et `.at(0)` (ex. `result.rows.at(0)`, `datasets.at(0)`) pour éviter toute altération de syntaxe lors des échanges de code.
2. **Séparation stricte :** Ne pas mélanger le HTML, le CSS et le JS dans un même fichier. Chaque nouveau module métier doit avoir sa route dans `routes/` et son script dans `public/js/`.
3. **Équilibrage dynamique :** Toujours lire les coûts et rendements depuis `CONFIG` (`game_settings` en base) plutôt que de les écrire en dur.

---

## 6. Idées / Évolutions futures
- [ ] **Envoi d'e-mails réels (Brevo) :** Brancher l'API Brevo (`utils/mailer.js`, comme sur TchatGC) pour envoyer le code à 6 chiffres de récupération de mot de passe par e-mail.
- [ ] **Module Banques & Emprunts (`routes/bankRoutes.js`) :** Permettre aux PDG de contracter des prêts avec intérêts quotidiens pour financer de grosses excavatrices.
- [ ] **Module R&D / Technologies :** Arbre de recherche pour améliorer le rendement des excavatrices, réduire l'usure ou affiner la précision des carottages géologiques.
- [ ] **Passerelle Aide / Communauté :** Ajouter un lien ou encart d'aide reliant Gold Mine à TchatGC et déployer Gold Mine sur GitHub + Render.
