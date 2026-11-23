# 🗄️ MÉMOIRE 2/2 : BASE DE DONNÉES & SUIVI — GOLD MINE

## 1. Les 13 Tables PostgreSQL (`config/db.js`)
1. **`users`** :
   - `id` (SERIAL PK), `username` (UNIQUE), `email` (UNIQUE), `password_hash`, `role` (`'player'` ou `'admin'`), `is_verified` (BOOLEAN), `verification_code`, `reset_code`, `is_banned`, `created_at`.
2. **`mines`** :
   - `user_id` (PK, FK `users.id`), `jour`, `argent`, `stock_or`, `mineurs` (orpailleurs manuels plafonnés à 10), `foreuses`, `conducteurs` (DEFAULT 2), `mecaniciens` (DEFAULT 1), `chefs_equipe` (DEFAULT 1), `cadres` (JSONB), `moral`, `usure`, `cadence`, `marketing_points`, `parcelle_active`, `parcelles` (JSONB des 12 secteurs A à L avec `estSondee`, `estDecapee`, `sterilesTotal`, `sterilesRestants`, `reserveReelle`, `pureteReelle`), `pending_event` (JSONB incident), `tutorial_step` (DEFAULT 1), `pieces_detachees`, `pieces_stock` (JSONB par `Famille:Gabarit`), `frais_semaine_accumules` (NUMERIC), `facture_en_attente` (NUMERIC), `updated_at`.
3. **`market_state`** :
   - `id` (PK = `1`), `cours_or`, `historique_cours` (JSONB des 24 dernières cotations), `last_market_tick` (cycle clients 4h), `last_daily_tick`, `last_hourly_tick` (extraction horaire 1h), `last_weekly_tick` (facture hebdomadaire 7j).
4. **`clients_catalog`** :
   - `id` (SERIAL PK), `nom` (UNIQUE), `type_client`, `secteur`, `min_gr`, `max_gr`, `bonus_min`, `bonus_max`, `poids_apparition`, `actif`.
5. **`market_clients`** :
   - `id` (SERIAL PK), `nom`, `type_client`, `secteur`, `demande_grammes`, `prix_base_gramme`, `marge_acceptee_max`, `expires_at`.
6. **`game_settings`** :
   - `key` (PK), `value` (NUMERIC), `label` (VARCHAR) — **58 variables pilotables (avec import/export en masse) depuis `/admin/settings.html`** :
     - *Économie & Mine (27) :* `argentDepart`, `coursOrInitial`, `coursOrMin` (`35`), `coursOrMax` (`110`), `coutMineur` (`800`), `salaireMineurJour` (`120`), `prodMineurTonnes` (`1.5`), `coutForeuse` (`5000`), `carburantForeuseJour` (`450`), `prodForeuseTonnes` (`30`), `usureParForeuse` (`4`), `coutRevision` (`900`), `coutPanneForcee` (`2500`), `coutPrime` (`600`), `coutCarottage` (`1500`), `ratioSterilesDecapage` (`0.15`), `coutDemenagement` (`1000`), `taxeMiniere` (`0.08`), `chanceEvenement` (`0.25`), `heureClotureJour` (`3`), `cycleMarcheHeures` (`4`), `nbClientsMarche` (`6`), `margeNegociationMax` (`0.15`), `coutUniteMarketing` (`1200`), `usureMarketingJour` (`0.05`), `seuilEtudeMarche` (`25`), `impactOffreDemande` (`0.02`).
     - *Matériel, Enchères & Location (8) :* `dureeEnchereDefautHeures` (`4`), `dureeMaxEnchereHeures` (`168`), `pasEnchereMinPct` (`0.05`), `commissionBrocantePct` (`0.05`), `coeffLoyerJeu` (`0.08`), `dureeMaxLocationJours` (`7`), `commissionLocationPdgPct` (`0.05`), `usureLocataireMultiplicateur` (`1.2`).
     - *Tutoriel (1) :* `recompenseTutorielEtape` (`2000`).
     - *Ressources Humaines & Trombinoscope (14) :* `conducteursRequisParEngin` (`2`), `enginsParMecano` (`3`), `ouvriersParChef` (`8`), `coutConducteur` (`1000`), `salaireConducteurJour` (`160`), `coutMecano` (`1400`), `salaireMecanoJour` (`210`), `coutChef` (`2200`), `salaireChefJour` (`320`), `coutRecrutementCadre` (`5000`), `salaireCadreJour` (`550`), `bonusTrombinoscopeCompletPct` (`0.15`), `malusManqueChefPct` (`0.20`), `usureSansMecanoMult` (`1.5`).
     - *Concessionnaires & Pièces Détachées (11) :* `prixPieceDecapage` (`650`), `prixPieceExcavation` (`500`), `prixPieceTransport` (`600`), `prixPieceChargement` (`550`), `prixPieceTremie` (`450`), `prixPieceConvoyeur` (`500`), `prixPieceTraitement` (`800`), `prixPieceLavage` (`900`), `coeffPiecePetit` (`1`), `coeffPieceMoyen` (`2`), `coeffPieceGeant` (`4`).
7. **`site_texts`** :
   - `key` (PK), `title`, `content` — Textes éditables depuis `/admin/texts.html`.
8. **`admin_logs`** :
   - `id` (SERIAL PK), `admin_username`, `action`, `created_at`.
9. **`player_logs`** :
   - `id` (SERIAL PK), `user_id` (FK `users.id`), `username`, `category`, `details`, `created_at`.
10. **`equipment_catalog`** :
    - `id` (SERIAL PK), `nom` (UNIQUE), `categorie` (`Décapage`, `Excavation`, `Transport`, `Chargement`, `Trémie`, `Convoyeur`, `Traitement`, `Lavage`), `gabarit` (`Petit`, `Moyen`, `Géant`), `prix_neuf`, `prod_tonnes`, `vitesse_min_th`, `vitesse_max_th`, `carburant_jour`, `usure_jour`, `pieces_panne`, `actif` — **24 équipements calibrés (3 gabarits × 8 familles)**.
11. **`player_fleet`** :
    - `id` (SERIAL PK), `owner_id` (FK `users.id`), `catalog_id`, `nom`, `categorie`, `gabarit`, `prod_tonnes`, `vitesse_min_th`, `vitesse_max_th`, `vitesse_reglee_th`, `carburant_jour`, `usure_jour`, `pieces_panne`, `usure_actuelle`, `parcelle_index`, `statut` (`'ACTIF'`, `'EN_PANNE'`, `'EN_VENTE'`, `'OFFRE_LOC'`, `'LOUE'`), `created_at`.
12. **`market_auctions`** :
    - `id` (SERIAL PK), `fleet_id`, `seller_id`, `mode_vente`, `prix_depart`, `prix_actuel`, `highest_bidder_id`, `expires_at`, `created_at`.
13. **`active_rentals`** :
    - `id` (SERIAL PK), `source_type`, `fleet_id`, `catalog_id`, `owner_id`, `renter_id`, `nom`, `categorie`, `prod_tonnes`, `vitesse_min_th`, `vitesse_max_th`, `vitesse_reglee_th`, `carburant_jour`, `usure_jour`, `loyer_jour`, `jours_restants`, `parcelle_index`, `statut`, `created_at`.

---

## 2. Règles de Gameplay Temps Réel (v1.3.1)
- **Phase 1 — Carottage & Décapage des Terres Stériles :**
  - Chaque nouveau secteur sondé génère un volume de terres stériles (`ratioSterilesDecapage` = `15%` de la réserve en tonnes, minimum `50 t`).
  - Tant que `sterilesRestants > 0`, la fosse est verrouillée pour l'extraction d'or et doit être décapée par le trio **Bulldozer (`Décapage`) + Excavatrice (`Excavation`) + Camion benne (`Transport`)** : $\text{Débit Décapage (t/h)} = \min(\text{Décapage}, \text{Excavation}, \text{Transport})$.
- **Phase 2 — Extraction Horaire (toutes les 1h) & Chaîne Logistique 7 Étapes :**
  - Orpaillage artisanal de démarrage : **10 mineurs manuels maximum** (`1,5 t/j` chacun sur la parcelle active).
  - Chaîne mécanisée obligatoire dans l'ordre minier : **1. Excavation → 2. Transport → 3. Chargement → 4. Trémie → 5. Convoyeur → 6. Traitement → 7. Lavage**.
  - $\text{Débit Réel (t/h)} = \min(\text{Excavation}, \text{Transport}, \text{Chargement}, \text{Trémie}, \text{Convoyeur}, \text{Traitement}, \text{Lavage})$.
  - Paliers équilibrés : **Petit (`2–5 t/h`)**, **Moyen (`8–16 t/h`)**, **Géant (`25–50 t/h`)** avec usure non-linéaire ($\text{ratioVitesse}^{1.6}$).
  - Personnel : **2 conducteurs par engin roulant** (`Décapage`, `Excavation`, `Transport`, `Chargement`) ; **1 mécanicien dédié par installation fixe** (`Trémie`, `Convoyeur`, `Traitement`, `Lavage`) + **1 mécanicien d'atelier pour 3 engins roulants** ; **1 chef d'équipe pour 8 ouvriers**.
  - Trombinoscope (6 Directeurs) : bonus individuels actifs + **Synergie Direction (+15% production d'or)** si les 6 postes sont pourvus.
- **Facture Hebdomadaire (1 fois par semaine = 7 jours) :**
  - Les salaires, carburants et loyers s'accumulent heure par heure dans `frais_semaine_accumules` et génèrent une facture unique (`facture_en_attente`) tous les 7 jours.
- **Bourse & Clients Dynamiques (toutes les 4h) :**
  - Le cours mondial de l'or et les prix proposés par les acheteurs sont recalculés automatiquement toutes les 4h selon le ratio **ventes d'or / production mondiale** et le **volume d'achats matériels/prospection** des 4 dernières heures.

---

## 3. Feuille de route / État d'avancement
- [x] **Architecture 100 % autonome & BDD stricte :** Zéro CDN, mode maintenance automatique si BDD vide/indisponible.
- [x] **Décapage de Fosse & Chaîne Industrielle 7 Étapes (`v1.3.1`) :** 24 équipements (8 familles × 3 gabarits), décapage stériles avec calcul d'heures restantes, paliers `2-5 / 8-16 / 25-50 t/h`, filtre boutique, détail matériel & débit t/h par secteur, orpaillage limité à 10 + collecte du jour.
- [x] **Module RH & Trombinoscope (`v1.3.1`) :** 2 conducteurs/engin roulant + 1 mécanicien par installation fixe + 1/3 roulants + 6 Directeurs avec bonus actifs.
- [x] **Moteur Horaire, Prix Clients Dynamiques 4h & Facture Hebdomadaire (`v1.3.1`) :** Extraction toutes les 1h, prix indexés sur production/achats/ventes toutes les 4h, facture toutes les semaines.
- [x] **Panel Admin Modulaire avec Import/Export en masse & Outils Comptes (`v1.3.1`) :** Découpage dans `public/admin/`, crédit/définition exacte € et Or anti-NaN.
- [ ] **Module Banques & Emprunts (`routes/bankRoutes.js`) :** Prêts bancaires, taux d'intérêt et échéances hebdomadaires.
- [ ] **Activation des e-mails réels (Brevo) :** Renseigner `BREVO_API_KEY` et `BREVO_SENDER_EMAIL` sur Render.
- [ ] **Module R&D / Technologies :** Améliorations permanentes de la mine.
