# 🗄️ MÉMOIRE 2/2 : BASE DE DONNÉES & SUIVI — GOLD MINE

## 1. Les 6 Tables PostgreSQL (`config/db.js`)
1. **`users`** :
   - `id` (SERIAL PK), `username` (UNIQUE), `email` (UNIQUE), `password_hash`, `role` (`'player'` ou `'admin'`, le 1er inscrit reçoit `'admin'`), `is_banned`, `is_verified` (BOOLEAN), `verification_code` (VARCHAR), `reset_code`, `reset_expires`, `created_at`.
2. **`mines`** :
   - `user_id` (PK, FK `users.id`), `jour`, `argent`, `stock_or`, `cours_or`, `mineurs`, `moral`, `foreuses`, `usure`, `parcelle_active`, `parcelles_json` (JSONB des 12 secteurs A à L), `updated_at`.
3. **`admin_logs`** :
   - `id` (SERIAL PK), `admin_username`, `action`, `created_at`.
4. **`game_settings`** :
   - `key` (PK), `value` (NUMERIC), `label` (VARCHAR) — **18 paramètres modifiables depuis l'Admin** (`argentDepart`, `coursOrInitial`, `coursOrMin`, `coursOrMax`, `taxeMiniere`, `coutMineur`, `coutForeuse`, `coutRevision`, `coutPrime`, `coutCarottage`, `coutDemenagement`, `coutPanneForcee`, `salaireMineurJour`, `carburantForeuseJour`, `prodMineurTonnes`, `prodForeuseTonnes`, `usureParForeuse`, `chanceEvenement`).
5. **`site_texts`** :
   - `key` (PK), `title` (VARCHAR), `content` (TEXT) — Textes éditables depuis l'Admin (contient `'welcome_intro'` affiché sur `index.html`).
6. **`player_logs`** :
   - `id` (SERIAL PK), `user_id` (FK `users.id`), `username`, `category` (`'AUTH'`, `'FINANCE'`, `'MINE'`, `'PROSPECTION'`), `details` (TEXT), `created_at` — Journal complet des actions des joueurs consultable et filtrable dans `admin.html`.

---

## 2. Règles de Gameplay Actuelles
- **Extraction :** `(Mineurs * prodMineurTonnes * Cadence * Moral%) + (Excavatrices * prodForeuseTonnes * Cadence)`.
- **Stockage & Bourse :** L'or extrait est stocké en grammes (`stockOr`). La revente s'effectue manuellement au cours du jour (borné entre `coursOrMin` et `coursOrMax`) avec prélèvement de `taxeMiniere` (20 % par défaut).
- **Prospection (12 concessions) :** Carottage géologique (marge d'erreur ±25 %) puis déménagement des excavatrices.
- **Usure & Moral :** Cadence *Intensif* accélère la production mais dégrade le moral (< 25 % = grève) et augmente le risque de panne mécanique.

---

## 3. Feuille de route / État d'avancement
- [x] **Édition des textes (`site_texts`) dans l'Admin :** Implémenté dans `routes/adminRoutes.js`, `public/admin.html` et `public/js/admin.js`.
- [x] **Passerelle Aide & Communauté (TchatGC) :** Bouton intégré dans `index.html` et `game.html` via `/api/links`.
- [x] **Envoi d'e-mails réels (Brevo) :** Implémenté dans `utils/mailer.js` pour la validation d'inscription et le mot de passe perdu.
- [x] **Suivi complet de l'activité des joueurs (`player_logs`) :** Table SQL, `utils/logger.js` et tableau filtrable dans `admin.html`.
- [ ] **Finalisation mise en ligne v1.0.0 :** Ajouter `?v=1.0.0` dans les 3 pages HTML (`index.html`, `game.html`, `admin.html`), vider les tables sur Neon (`DROP TABLE...`) et exécuter `git push` vers Render.
- [ ] **Module Banques & Emprunts (`routes/bankRoutes.js`) :** Prêts bancaires avec intérêts quotidiens pour financer l'expansion.
- [ ] **Module R&D / Technologies :** Amélioration des excavatrices, du raffinage et des sondages géologiques.
