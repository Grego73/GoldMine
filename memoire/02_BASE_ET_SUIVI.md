# 🗄️ MÉMOIRE 2/2 : BASE DE DONNÉES & SUIVI — GOLD MINE

## 1. Les 13 Tables PostgreSQL (`config/db.js`)
1. **`users`** :
   - `id` (SERIAL PK), `username` (UNIQUE), `email` (UNIQUE), `password_hash`, `role` (`'player'` ou `'admin'`), `is_verified` (BOOLEAN), `verification_code`, `reset_code`, `is_banned`, `created_at`.
2. **`mines`** :
   - `user_id` (PK, FK `users.id`), `jour`, `argent`, `stock_or`, `mineurs`, `foreuses`, `conducteurs` (DEFAULT 2), `mecaniciens` (DEFAULT 1), `chefs_equipe` (DEFAULT 1), `cadres` (JSONB), `moral`, `usure`, `cadence`, `marketing_points`, `parcelle_active`, `parcelles` (JSONB des 12 secteurs A à L), `pending_event` (JSONB incident), `tutorial_step` (DEFAULT 1), `pieces_detachees`, `pieces_stock` (JSONB par `Famille:Gabarit`), `frais_semaine_accumules` (NUMERIC), `facture_en_attente` (NUMERIC), `updated_at`.
3. **`market_state`** :
   - `id` (PK = `1`), `cours_or`, `historique_cours` (JSONB des 24 dernières cotations), `last_market_tick` (cycle clients 4h), `last_daily_tick`, `last_hourly_tick` (extraction horaire 1h), `last_weekly_tick` (facture hebdomadaire 7j).
4. **`clients_catalog`** :
   - `id` (SERIAL PK), `nom` (UNIQUE), `type_client`, `secteur`, `min_gr`, `max_gr`, `bonus_min`, `bonus_max`, `poids_apparition`, `actif`.
5. **`market_clients`** :
   - `id` (SERIAL PK), `nom`, `type_client`, `secteur`, `demande_grammes`, `prix_base_gramme`, `marge_acceptee_max`, `expires_at`.
6. **`game_settings`** :
   - `key` (PK), `value` (NUMERIC), `label` (VARCHAR) — **56 variables pilotables (avec import/export en masse) depuis `/admin/settings.html`** :
     - *Économie & Mine (26) :* `argentDepart`, `coursOrInitial`, `coursOrMin`, `coursOrMax`, `coutMineur`, `salaireMineurJour`, `prodMineurTonnes`, `coutForeuse`, `carburantForeuseJour`, `prodForeuseTonnes`, `usureParForeuse`, `coutRevision`, `coutPanneForcee`, `coutPrime`, `coutCarottage`, `coutDemenagement`, `taxeMiniere`, `chanceEvenement`, `heureClotureJour`, `cycleMarcheHeures` (`4`), `nbClientsMarche` (`10`), `margeNegociationMax` (`0.15`), `coutUniteMarketing`, `usureMarketingJour`, `seuilEtudeMarche` (`25`), `impactOffreDemande` (`0.02`).
     - *Matériel, Enchères & Location (8) :* `dureeEnchereDefautHeures` (`4`), `dureeMaxEnchereHeures` (`168`), `pasEnchereMinPct` (`0.05`), `commissionBrocantePct` (`0.05`), `coeffLoyerJeu` (`0.08`), `dureeMaxLocationJours` (`7`), `commissionLocationPdgPct` (`0.05`), `usureLocataireMultiplicateur` (`1.2`).
     - *Tutoriel (1) :* `recompenseTutorielEtape` (`2000`).
     - *Ressources Humaines & Trombinoscope (14) :* `conducteursRequisParEngin` (`2`), `enginsParMecano` (`3`), `ouvriersParChef` (`8`), `coutConducteur` (`1000`), `salaireConducteurJour` (`160`), `coutMecano` (`1400`), `salaireMecanoJour` (`210`), `coutChef` (`2200`), `salaireChefJour` (`320`), `coutRecrutementCadre` (`5000`), `salaireCadreJour` (`550`), `bonusTrombinoscopeCompletPct` (`0.15`), `malusManqueChefPct` (`0.20`), `usureSansMecanoMult` (`1.5`).
     - *Concessionnaires & Pièces Détachées (7) :* `prixPieceExcavation` (`500`), `prixPieceTransport` (`600`), `prixPieceTraitement` (`800`), `prixPieceLavage` (`900`), `coeffPiecePetit` (`1`), `coeffPieceMoyen` (`2`), `coeffPieceGeant` (`4`).
7. **`site_texts`** :
   - `key` (PK), `title`, `content` — Textes éditables depuis `/admin/texts.html`.
8. **`admin_logs`** :
   - `id` (SERIAL PK), `admin_username`, `action`, `created_at`.
9. **`player_logs`** :
   - `id` (SERIAL PK), `user_id` (FK `users.id`), `username`, `category`, `details`, `created_at`.
10. **`equipment_catalog`** :
    - `id` (SERIAL PK), `nom` (UNIQUE), `categorie` (`Excavation`, `Transport`, `Traitement`, `Lavage`), `gabarit` (`Petit`, `Moyen`, `Géant`), `prix_neuf`, `prod_tonnes`, `vitesse_min_th`, `vitesse_max_th`, `carburant_jour`, `usure_jour`, `pieces_panne`, `actif` — Catalogue importable en masse dans `/admin/catalog.html`.
11. **`player_fleet`** :
    - `id` (SERIAL PK), `owner_id` (FK `users.id`), `catalog_id`, `nom`, `categorie`, `gabarit`, `prod_tonnes`, `vitesse_min_th`, `vitesse_max_th`, `vitesse_reglee_th`, `carburant_jour`, `usure_jour`, `pieces_panne`, `usure_actuelle`, `parcelle_index`, `statut` (`'ACTIF'`, `'EN_PANNE'`, `'EN_VENTE'`, `'OFFRE_LOC'`, `'LOUE'`), `created_at`.
12. **`market_auctions`** :
    - `id` (SERIAL PK), `fleet_id`, `seller_id`, `mode_vente`, `prix_depart`, `prix_actuel`, `highest_bidder_id`, `expires_at`, `created_at`.
13. **`active_rentals`** :
    - `id` (SERIAL PK), `source_type`, `fleet_id`, `catalog_id`, `owner_id`, `renter_id`, `nom`, `categorie`, `prod_tonnes`, `vitesse_min_th`, `vitesse_max_th`, `vitesse_reglee_th`, `carburant_jour`, `usure_jour`, `loyer_jour`, `jours_restants`, `parcelle_index`, `statut`, `created_at`.

---

## 2. Règles de Gameplay Temps Réel (v1.2.1)
- **Extraction Horaire (toutes les 1h) & Chaîne Logistique par Secteur :**
  - Chaque secteur sondé possède sa propre chaîne de production : $\text{Débit Réel (t/h)} = \min(\text{Excavation}, \text{Transport}, \text{Traitement}, \text{Lavage})$.
  - Chaque engin possède un variateur de vitesse (`30–60 t/h` Petit, `80–160 t/h` Moyen, `180–300 t/h` Géant) avec usure non-linéaire ($\text{ratioVitesse}^{1.6}$).
  - Un engin tournant 24h/24 nécessite **2 conducteurs** (poste 12h) ; avec **1 conducteur**, production et usure sont divisées par 2 ; avec **0**, il reste à l'arrêt.
  - Ratios RH : **1 mécano pour 3 engins**, **1 chef d'équipe pour 8 ouvriers** (`1–8` -> 1 chef, `9–16` -> 2 chefs...).
  - Trombinoscope (6 Directeurs) : bonus individuels actifs (`DAF` -2% taxe, `GEOLOGUE` -30% carottage, `METALLURGISTE` +10% or, `MAINTENANCE` -25% usure, `HSE` -50% incidents, `RSE` +2 pts marketing/j) + **Synergie Direction (+15% production d'or)** si les 6 postes sont pourvus.
- **Facture Hebdomadaire (1 fois par semaine = 7 jours) :**
  - Les salaires, carburants et loyers s'accumulent heure par heure dans `frais_semaine_accumules` et génèrent une facture unique (`facture_en_attente`) tous les 7 jours.
- **Bourse & Clients (toutes les 4h) :**
  - Renouvellement du cours mondial et des 10 acheteurs internationaux.

---

## 3. Feuille de route / État d'avancement
- [x] **Architecture 100 % autonome & BDD stricte :** Zéro CDN, mode maintenance automatique si BDD vide/indisponible.
- [x] **Module Matériel, Concessionnaires & Variateur t/h (`v1.2.1`) :** 12 engins par famille/gabarit, pièces détachées par concessionnaire, réparation pannes, variateur `t/h`, chantiers par secteur.
- [x] **Module RH & Trombinoscope (`v1.1.6`) :** Ratios conducteurs/mécanos/chefs + 6 Directeurs avec bonus actifs.
- [x] **Moteur Horaire & Facture Hebdomadaire (`v1.2.1`) :** Extraction toutes les 1h, facture toutes les semaines, clients toutes les 4h.
- [x] **Panel Admin Modulaire avec Import/Export en masse (`v1.1.7`) :** Découpage dans `public/admin/` + copier-coller massif variables & engins.
- [x] **Page Règles, Guide TchatGC & Tutoriel 5 étapes (`v1.1.5`) :** Bouton `👉 Voir` intelligent et récompenses progressives.
- [ ] **Revue & Équilibrage économique :** Ajustement fin des rendements horaires (`t/h`) face aux prix des clients et aux salaires hebdomadaires.
- [ ] **Module Banques & Emprunts (`routes/bankRoutes.js`) :** Prêts bancaires, taux d'intérêt et échéances hebdomadaires.
- [ ] **Activation des e-mails réels (Brevo) :** Renseigner `BREVO_API_KEY` et `BREVO_SENDER_EMAIL` sur Render.
- [ ] **Module R&D / Technologies :** Améliorations permanentes de la mine.
