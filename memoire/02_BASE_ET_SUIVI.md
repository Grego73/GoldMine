# 🗄️ MÉMOIRE 2/2 : BASE DE DONNÉES & SUIVI — GOLD MINE

## 1. Les 13 Tables PostgreSQL (`config/db.js`)
1. **`users`** :
   - `id` (SERIAL PK), `username` (UNIQUE), `email` (UNIQUE), `password_hash`, `role` (`'player'` ou `'admin'`), `is_verified` (BOOLEAN), `verification_code`, `reset_code`, `is_banned`, `created_at`.
2. **`mines`** :
   - `user_id` (PK, FK `users.id`), `jour`, `argent`, `stock_or`, `mineurs`, `foreuses`, `moral`, `usure`, `cadence`, `marketing_points`, `parcelle_active`, `parcelles` (JSONB des 12 secteurs A à L), `pending_event` (JSONB incident), `tutorial_step` (INTEGER DEFAULT 1), `updated_at`.
3. **`market_state`** :
   - `id` (PK = `1`), `cours_or` (cours mondial partagé), `historique_cours` (JSONB des 24 dernières cotations), `last_market_tick` (TIMESTAMP du dernier cycle 4h), `last_daily_tick` (DATE de la dernière clôture 3h00).
4. **`clients_catalog`** :
   - `id` (SERIAL PK), `nom` (UNIQUE), `type_client` (`'Particulier'`, `'Entreprise'`, `'Événementiel'`), `secteur`, `min_gr`, `max_gr`, `bonus_min`, `bonus_max`, `poids_apparition`, `actif` (BOOLEAN).
5. **`market_clients`** :
   - `id` (SERIAL PK), `nom`, `type_client`, `secteur`, `demande_grammes`, `prix_base_gramme`, `marge_acceptee_max`, `expires_at`.
6. **`game_settings`** :
   - `key` (PK), `value` (NUMERIC), `label` (VARCHAR) — **35 variables pilotables depuis `/admin/settings.html`** :
     - *Économie & Mine (26) :* `argentDepart`, `coursOrInitial`, `coursOrMin`, `coursOrMax`, `coutMineur`, `salaireMineurJour`, `prodMineurTonnes`, `coutForeuse`, `carburantForeuseJour`, `prodForeuseTonnes`, `usureParForeuse`, `coutRevision`, `coutPanneForcee`, `coutPrime`, `coutCarottage`, `coutDemenagement`, `taxeMiniere`, `chanceEvenement`, `heureClotureJour` (`3`), `cycleMarcheHeures` (`4`), `nbClientsMarche` (`10`), `margeNegociationMax` (`0.15`), `coutUniteMarketing`, `usureMarketingJour`, `seuilEtudeMarche` (`25`), `impactOffreDemande` (`0.02`).
     - *Matériel, Enchères & Location (8) :* `dureeEnchereDefautHeures` (`4`), `dureeMaxEnchereHeures` (`168`), `pasEnchereMinPct` (`0.05`), `commissionBrocantePct` (`0.05`), `coeffLoyerJeu` (`0.08`), `dureeMaxLocationJours` (`7`), `commissionLocationPdgPct` (`0.05`), `usureLocataireMultiplicateur` (`1.2`).
     - *Tutoriel (1) :* `recompenseTutorielEtape` (`2000`).
7. **`site_texts`** :
   - `key` (PK), `title`, `content` — Textes éditables depuis `/admin/texts.html`.
8. **`admin_logs`** :
   - `id` (SERIAL PK), `admin_username`, `action`, `created_at`.
9. **`player_logs`** :
   - `id` (SERIAL PK), `user_id` (FK `users.id`), `username`, `category` (`'AUTH'`, `'CLOTURE'`, `'FINANCE'`, `'MINE'`, `'MARKETING'`, `'PROSPECTION'`, `'MATERIEL'`, `'TUTORIEL'`), `details`, `created_at`.
10. **`equipment_catalog`** :
    - `id` (SERIAL PK), `nom` (UNIQUE), `categorie`, `prix_neuf`, `prod_tonnes`, `carburant_jour`, `usure_jour`, `actif` (BOOLEAN) — Catalogue des engins neufs géré dans `/admin/catalog.html`.
11. **`player_fleet`** :
    - `id` (SERIAL PK), `owner_id` (FK `users.id`), `catalog_id` (FK `equipment_catalog.id`), `nom`, `categorie`, `prod_tonnes`, `carburant_jour`, `usure_jour`, `usure_actuelle`, `statut` (`'ACTIF'`, `'EN_VENTE'`, `'OFFRE_LOC'`, `'LOUE'`), `created_at`.
12. **`market_auctions`** :
    - `id` (SERIAL PK), `fleet_id` (FK `player_fleet.id`), `seller_id` (FK `users.id`), `mode_vente` (`'BROCANTE'` ou `'ENCHERE'`), `prix_depart`, `prix_actuel`, `highest_bidder_id` (FK `users.id`), `expires_at`, `created_at`.
13. **`active_rentals`** :
    - `id` (SERIAL PK), `source_type` (`'OFFICIEL'` ou `'PDG'`), `fleet_id`, `catalog_id`, `owner_id`, `renter_id`, `nom`, `categorie`, `prod_tonnes`, `carburant_jour`, `usure_jour`, `loyer_jour`, `jours_restants`, `statut` (`'DISPONIBLE'` ou `'EN_COURS'`), `created_at`.

---

## 2. Règles de Gameplay Temps Réel (v1.1.3)
- **Clôture quotidienne automatique (`heureClotureJour` = 3h00 Paris) :**
  - Résout les enchères/annonces expirées, calcule la production de chaque engin actif de `player_fleet` et de chaque contrat de location `active_rentals`, prélève les loyers quotidiens (résiliation immédiate en cas d'impayé), applique l'usure, les pannes, le moral et les événements aléatoires.
- **Marché Mondial & Clients (`cycleMarcheHeures` = 4h) :**
  - Génère `nbClientsMarche` (`10`) acheteurs pondérés depuis `clients_catalog` et ajuste le cours mondial selon l'offre et la demande.
- **Tutoriel de démarrage (5 étapes récompensées) :**
  - 1) Sonder 2 parcelles (1x prime), 2) Avoir 6 mineurs (1x), 3) Posséder 2 engins (1.5x), 4) Atteindre 20 pts marketing (1.5x), 5) Effectuer 1 vente d'or (2.5x).

---

## 3. Feuille de route / État d'avancement
- [x] **Architecture 100 % autonome & BDD stricte :** Zéro CDN, mode maintenance automatique si BDD vide/indisponible.
- [x] **Module Matériel & Marché (`v1.1.0`) :** Boutique Neuf (0 % usure), Brocante & Enchères jusqu'à 7 jours, Location officielle & entre PDG.
- [x] **Panel Admin Modulaire (`v1.1.2`) :** Découpage dans `public/admin/` (`index.html`, `settings.html`, `catalog.html`, `texts.html`, `logs.html`).
- [x] **Page Règles, Guide TchatGC & Tutoriel 5 étapes (`v1.1.3`) :** Implémentés dans `public/regles.html`, `game.html` et `gameRoutes.js`.
- [ ] **Revue & Équilibrage économique :** Vérification des coûts/rendements entre les 5 engins, les salaires et les prix de l'or.
- [ ] **Module Banques & Emprunts (`routes/bankRoutes.js`) :** Prêts bancaires, taux d'intérêt, remboursement automatique à la clôture de 3h00.
- [ ] **Activation des e-mails réels (Brevo) :** Renseigner `BREVO_API_KEY` et `BREVO_SENDER_EMAIL` sur Render.
- [ ] **Module R&D / Technologies :** Améliorations permanentes de la mine.
