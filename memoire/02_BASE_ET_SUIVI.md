# 🗄️ MÉMOIRE 2/2 : BASE DE DONNÉES & SUIVI — GOLD MINE

## 1. Les 9 Tables PostgreSQL (`config/db.js`)
1. **`users`** :
   - `id` (SERIAL PK), `username` (UNIQUE), `email` (UNIQUE), `password_hash`, `role` (`'player'` ou `'admin'`, le 1er inscrit reçoit `'admin'`), `is_verified` (BOOLEAN), `verification_code`, `reset_code`, `is_banned`, `created_at`.
2. **`mines`** :
   - `user_id` (PK, FK `users.id`), `jour`, `argent`, `stock_or`, `mineurs`, `foreuses`, `moral`, `usure`, `cadence` (`0.8`, `1.0` ou `1.25`), `marketing_points`, `parcelle_active`, `parcelles` (JSONB des 12 secteurs A à L), `pending_event` (JSONB incident en attente), `updated_at`.
3. **`market_state`** :
   - `id` (PK = `1`), `cours_or` (cours mondial partagé), `historique_cours` (JSONB des 24 dernières cotations), `last_market_tick` (TIMESTAMP du dernier cycle 4h), `last_daily_tick` (DATE de la dernière clôture 3h00).
4. **`clients_catalog`** :
   - `id` (SERIAL PK), `nom` (UNIQUE), `type_client` (`'Particulier'`, `'Entreprise'`, `'Événementiel'`), `secteur`, `min_gr`, `max_gr`, `bonus_min`, `bonus_max`, `poids_apparition`, `actif` (BOOLEAN) — Catalogue extensible à l'infini depuis l'Admin.
5. **`market_clients`** :
   - `id` (SERIAL PK), `nom`, `type_client`, `secteur`, `demande_grammes`, `prix_base_gramme`, `marge_acceptee_max`, `expires_at` — Les acheteurs actifs générés toutes les `cycleMarcheHeures` (4h).
6. **`game_settings`** :
   - `key` (PK), `value` (NUMERIC), `label` (VARCHAR) — **25 paramètres modifiables depuis l'Admin** :
     `argentDepart`, `coursOrInitial`, `coursOrMin`, `coursOrMax`, `coutMineur`, `salaireMineurJour`, `prodMineurTonnes`, `coutForeuse`, `carburantForeuseJour`, `prodForeuseTonnes`, `usureParForeuse`, `coutRevision`, `coutPanneForcee`, `coutPrime`, `coutCarottage`, `coutDemenagement`, `taxeMiniere`, `chanceEvenement`, `heureClotureJour` (`3`), `cycleMarcheHeures` (`4`), `nbClientsMarche` (`10`), `margeNegociationMax` (`0.15`), `coutUniteMarketing`, `usureMarketingJour`, `seuilEtudeMarche` (`25`).
7. **`site_texts`** :
   - `key` (PK), `title`, `content` — Textes éditables depuis l'Admin (contient `'welcome'` affiché sur `index.html`).
8. **`admin_logs`** :
   - `id` (SERIAL PK), `admin_username`, `action`, `created_at`.
9. **`player_logs`** :
   - `id` (SERIAL PK), `user_id` (FK `users.id`), `username`, `category` (`'AUTH'`, `'CLOTURE'`, `'FINANCE'`, `'MINE'`, `'MARKETING'`, `'PROSPECTION'`), `details`, `created_at`.

---

## 2. Règles de Gameplay Temps Réel (V2)
- **Clôture quotidienne automatique (`heureClotureJour` = 3h00 Paris) :**
  - Exécutée automatiquement par `utils/gameEngine.js` (avec rattrapage immédiat si le serveur Render sort de veille).
  - Calcule l'extraction selon les effectifs, les excavatrices, le moral (< 25 % = grève) et la cadence choisie par le PDG, déduit les frais fixes, applique l'usure mécanique et la baisse quotidienne de notoriété marketing (`usureMarketingJour`), et tire éventuellement un événement aléatoire.
- **Marché Mondial & Clients (`cycleMarcheHeures` = 4h) :**
  - Génère `nbClientsMarche` (`10`) acheteurs pondérés depuis `clients_catalog` (*Particulier*, *Entreprise*, *Événementiel*).
  - Le cours mondial fluctue à chaque cycle de 4h et baisse légèrement lors des ventes massives des PDG (offre/demande).
- **Négociation & Compétition Marketing :**
  - Le PDG propose une quantité d'or à un client avec une marge de `-15 %` à `+15 %` (`margeNegociationMax`).
  - La probabilité d'acceptation dépend du prix demandé et de la notoriété marketing du PDG comparée à la moyenne des autres entreprises actives.
  - À partir de `seuilEtudeMarche` (`25 pts`), l'étude de marché dévoile la tolérance de prix exacte de chaque client.

---

## 3. Feuille de route / État d'avancement
- [x] **Architecture 100 % autonome (sans CDN externe) :** Design compact `style.css`, modales natives, graphiques `<canvas>` natifs et favicon mine à ciel ouvert.
- [x] **Moteur temps réel (Clôture 3h00 + Marché 4h) :** Implémenté dans `utils/gameEngine.js` avec rattrapage automatique post-veille.
- [x] **Système Clients & Marketing compétitif :** Table `clients_catalog` (Particulier / Entreprise / Événementiel) éditable en Admin + négociation `-15% / +15%` + étude de marché.
- [x] **Deploiement V2 (`v1.0.6`) sur Neon & Render :** Opérationnel en production.
- [ ] **Activation des e-mails réels (Brevo) :** Renseigner `BREVO_API_KEY` et `BREVO_SENDER_EMAIL` dans les variables d'environnement Render.
- [ ] **Module Banques & Emprunts (`routes/bankRoutes.js`) :** Prêts bancaires avec intérêts prélevés lors de la clôture quotidienne de 3h00.
- [ ] **Module R&D / Technologies :** Améliorations permanentes (foreuses haute capacité, raffinage amélioré, géologie avancée).
