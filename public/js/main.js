let CONFIG = {};
let etat = {};
let parcelles = new Array();

// 1. MOTEUR GRAPHIQUE 100 % NATIF (SANS CHART.JS)
function creerGraphiqueMaison(canvasId, couleurLigne, couleurFond) {
    const canvas = document.getElementById(canvasId);
    const graph = {
        labels: [],
        values: [],
        update() {
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width = canvas.parentElement.clientWidth - 40;
            const h = canvas.height = 180;
            ctx.clearRect(0, 0, w, h);

            if (this.values.length === 0) return;

            const pad = 35;
            const min = Math.min(...this.values) * 0.95;
            const max = Math.max(...this.values) * 1.05 || 1;
            const range = max - min || 1;

            // Grille horizontale
            ctx.strokeStyle = '#44403c';
            ctx.lineWidth = 1;
            ctx.fillStyle = '#a8a29e';
            ctx.font = '11px sans-serif';
            for (let i = 0; i <= 3; i++) {
                const y = pad + (i / 3) * (h - pad * 2);
                const val = max - (i / 3) * range;
                ctx.beginPath();
                ctx.moveTo(pad, y);
                ctx.lineTo(w - 10, y);
                ctx.stroke();
                ctx.fillText(Math.round(val).toLocaleString(), 2, y + 4);
            }

            // Points de la courbe
            const stepX = this.values.length > 1 ? (w - pad - 15) / (this.values.length - 1) : 0;
            const pts = this.values.map((v, i) => ({
                x: pad + i * stepX,
                y: pad + (1 - (v - min) / range) * (h - pad * 2)
            }));

            // Zone remplie sous la courbe
            if (pts.length > 1) {
                ctx.beginPath();
                ctx.moveTo(pts[0].x, h - pad);
                pts.forEach(p => ctx.lineTo(p.x, p.y));
                ctx.lineTo(pts[pts.length - 1].x, h - pad);
                ctx.closePath();
                ctx.fillStyle = couleurFond;
                ctx.fill();
            }

            // Ligne principale + points
            ctx.beginPath();
            pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
            ctx.strokeStyle = couleurLigne;
            ctx.lineWidth = 2.5;
            ctx.stroke();

            pts.forEach((p, i) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = couleurLigne;
                ctx.fill();
                if (i === 0 || i === pts.length - 1 || pts.length <= 8) {
                    ctx.fillStyle = '#a8a29e';
                    ctx.fillText(this.labels[i], p.x - 10, h - 10);
                }
            });
        }
    };
    return {
        data: { labels: graph.labels, datasets: [{ data: graph.values }] },
        update: () => graph.update()
    };
}

const chartPatrimoine = creerGraphiqueMaison('chartPatrimoine', '#34d399', 'rgba(52, 211, 153, 0.15)');
const chartCoursOr = creerGraphiqueMaison('chartCoursOr', '#fbbf24', 'rgba(251, 191, 36, 0.15)');

// 2. CATALOGUE DES ÉVÉNEMENTS ALÉATOIRES
const EVENEMENTS = new Array(
    {
        titre: "Glissement de terrain sur le gradin Nord",
        desc: "Les fortes pluies fragilisent la paroi de la mine à ciel ouvert.",
        choix: new Array(
            { texte: "Sécuriser avec des soutènements (3 000 €)", action: () => { etat.argent -= 3000; log("Paroi stabilisée. Aucun blessé."); } },
            { texte: "Continuer l'extraction (-25% Moral équipes)", action: () => { etat.moral = Math.max(0, etat.moral - 25); log("Les équipes travaillent sous la peur d'un éboulement."); } }
        )
    },
    {
        titre: "Flambée de la demande en joaillerie",
        desc: "Les acheteurs internationaux se ruent sur l'or physique !",
        choix: new Array(
            { texte: "Excellente nouvelle ! (+12% sur le cours de l'or)", action: () => { etat.coursOr = Math.min(CONFIG.coursOrMax, etat.coursOr * 1.12); log("Le cours de l'or bondit sur les marchés !"); } }
        )
    },
    {
        titre: "Mouvement social des conducteurs d'engins",
        desc: "Les opérateurs réclament une prime de poussière et de chaleur.",
        choix: new Array(
            { texte: "Verser une prime (2 000 € / +20% Moral)", action: () => { etat.argent -= 2000; etat.moral = Math.min(100, etat.moral + 20); log("Prime versée. Le moral remonte en flèche."); } },
            { texte: "Refuser (-30% Moral)", action: () => { etat.moral = Math.max(0, etat.moral - 30); log("Tensions syndicales sur le site."); } }
        )
    }
);

// 3. CHARGEMENT DE LA PARTIE DEPUIS POSTGRESQL
async function initialiserJeu() {
    try {
        const res = await fetch('/api/game/state');
        if (res.status === 401) {
            window.location.href = '/index.html';
            return;
        }
        const data = await res.json();
        CONFIG = data.config;
        etat = data.mine;
        parcelles = data.mine.parcelles;

        document.getElementById('stat-username').innerText = data.user.username;
        if (data.user.role === 'admin') {
            document.getElementById('btn-admin-link').style.display = 'inline-flex';
        }

        // Lien passerelle TchatGC
        const resLinks = await fetch('/api/links');
        const dataLinks = await resLinks.json();
        if (dataLinks.tchatgcUrl) {
            document.getElementById('link-tchatgc-game').href = dataLinks.tchatgcUrl;
        }

        // Affichage des prix dynamiques issus de la table game_settings
        document.getElementById('desc-mineur').innerText = `Extrait ${CONFIG.prodMineurTonnes}t/jour. Salaire : ${CONFIG.salaireMineurJour} €/jour.`;
        document.getElementById('btn-embaucher').innerText = `Recruter (${CONFIG.coutMineur} €)`;
        document.getElementById('desc-foreuse').innerText = `Extrait ${CONFIG.prodForeuseTonnes}t/jour. Carburant : ${CONFIG.carburantForeuseJour} €/jour.`;
        document.getElementById('btn-foreuse').innerText = `Acheter Engin (${CONFIG.coutForeuse} €)`;
        document.getElementById('btn-reparer').innerText = `Réviser (${CONFIG.coutRevision} €)`;
        document.getElementById('btn-prime').innerText = `Prime (${CONFIG.coutPrime} €)`;
        document.getElementById('desc-prospection').innerText = `Carottage géologique : ${CONFIG.coutCarottage} € | Déménagement des engins : ${CONFIG.coutDemenagement} €`;
        document.getElementById('desc-taxe').innerText = `Vendez vos lingots au meilleur cours (Redevance minière : ${Math.round(CONFIG.taxeMiniere * 100)}%).`;

        // Point initial sur les courbes
        if (chartPatrimoine && chartCoursOr) {
            chartPatrimoine.data.labels.push('J' + etat.jour);
            chartPatrimoine.data.datasets.at(0).data.push(Math.round(etat.argent));
            chartPatrimoine.update();

            chartCoursOr.data.labels.push('J' + etat.jour);
            chartCoursOr.data.datasets.at(0).data.push(etat.coursOr.toFixed(2));
            chartCoursOr.update();
        }

        majAffichage();
    } catch (err) {
        console.error("Erreur lors du chargement du jeu :", err);
    }
}

// 4. SAUVEGARDE AUTOMATIQUE EN BASE POSTGRESQL + LOG JOUEUR
async function sauvegarderEnBase(actionCategory = 'MINE', actionLog = '') {
    const badge = document.getElementById('save-indicator');
    badge.className = 'ui yellow mini label';
    badge.innerText = '⏳ Sauvegarde...';

    try {
        await fetch('/api/game/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ etat, parcelles, actionCategory, actionLog })
        });
        badge.className = 'ui green mini label';
        badge.innerText = '💾 Synchronisé';
    } catch (err) {
        badge.className = 'ui red mini label';
        badge.innerText = '⚠️ Erreur Sync';
    }
}

function changerOnglet(nomOnglet, elementMenu) {
    document.querySelectorAll('.tab-section').forEach(el => el.style.display = 'none');
    document.getElementById('tab-' + nomOnglet).style.display = 'block';
    document.querySelectorAll('.mine-nav .item').forEach(el => el.classList.remove('active'));
    elementMenu.classList.add('active');
}

function majAffichage() {
    const pActive = parcelles.at(etat.parcelleActive);
    document.getElementById('stat-jour').innerText = etat.jour;
    document.getElementById('stat-argent').innerText = Math.round(etat.argent).toLocaleString() + " €";
    document.getElementById('stat-stock').innerText = Math.round(etat.stockOr).toLocaleString() + " g";
    document.getElementById('stat-cours').innerText = etat.coursOr.toFixed(2) + " €/g";

    document.getElementById('kpi-reserve').innerText = Math.round(pActive.reserveReelle).toLocaleString() + " t";
    document.getElementById('kpi-purete').innerText = pActive.pureteReelle + " g/t";
    document.getElementById('kpi-engins').innerText = etat.foreuses;
    document.getElementById('kpi-moral').innerText = Math.round(etat.moral) + "%";
    document.getElementById('kpi-usure').innerText = Math.round(etat.usure) + "%";

    document.getElementById('exp-mineurs').innerText = etat.mineurs;
    document.getElementById('exp-foreuses').innerText = etat.foreuses;
    document.getElementById('exp-usure').innerText = Math.round(etat.usure) + "%";

    document.getElementById('coffre-grammes').innerText = Math.round(etat.stockOr).toLocaleString() + " g";
    document.getElementById('coffre-valeur').innerText = Math.round(etat.stockOr * etat.coursOr).toLocaleString() + " €";

    dessinerCarte();
}

function dessinerCarte() {
    const grid = document.getElementById('mapGrid');
    grid.innerHTML = '';
    parcelles.forEach(p => {
        const div = document.createElement('div');
        div.className = 'pit-tile' + (p.id === etat.parcelleActive ? ' active' : '') + (p.reserveReelle <= 0 ? ' depleted' : '');
        if (p.id === etat.parcelleActive) {
            div.innerHTML = `<div class="ui green mini label">EN COURS</div><h4 style="margin:5px 0; color:#fbbf24;">${p.nom}</h4><div>${Math.round(p.reserveReelle)} t (${p.pureteReelle}g/t)</div>`;
        } else if (p.estSondee) {
            div.innerHTML = `<div class="ui blue mini label">SONDÉ</div><h4 style="margin:5px 0; color:#e7e5e4;">${p.nom}</h4><div>Est: ~${p.estimationPurete} g/t</div><small style="color:#a8a29e;">Déplacer : ${CONFIG.coutDemenagement} €</small>`;
        } else {
            div.innerHTML = `<div class="ui grey mini label">VIERGE</div><h4 style="margin:5px 0; color:#a8a29e;">${p.nom}</h4><small>Carottage : ${CONFIG.coutCarottage} €</small>`;
        }
        div.onclick = () => interagirParcelle(p.id);
        grid.appendChild(div);
    });
}

async function interagirParcelle(id) {
    const p = parcelles.at(id);
    if (id === etat.parcelleActive) return;

    if (!p.estSondee) {
        if (etat.argent >= CONFIG.coutCarottage) {
            etat.argent -= CONFIG.coutCarottage;
            p.estSondee = true;
            let erreur = (Math.random() * 0.5) - 0.25;
            p.estimationPurete = Math.max(1, (p.pureteReelle * (1 + erreur))).toFixed(1);
            log(`Rapport géologique (${p.nom}) : teneur estimée à ~${p.estimationPurete} g/t.`);
            majAffichage();
            await sauvegarderEnBase('PROSPECTION', `Carottage sur ${p.nom} (-${CONFIG.coutCarottage} €)`);
        } else {
            log(`❌ Trésorerie insuffisante (${CONFIG.coutCarottage} €).`);
        }
    } else {
        if (etat.argent >= CONFIG.coutDemenagement) {
            etat.argent -= CONFIG.coutDemenagement;
            etat.parcelleActive = id;
            log(`🚜 Transfert des excavatrices vers le ${p.nom} (Teneur réelle : ${p.pureteReelle} g/t).`);
            majAffichage();
            await sauvegarderEnBase('PROSPECTION', `Déménagement vers ${p.nom} (-${CONFIG.coutDemenagement} €)`);
        } else {
            log(`❌ Trésorerie insuffisante (${CONFIG.coutDemenagement} €).`);
        }
    }
}

function log(msg) {
    const box = document.getElementById('journal-log');
    box.innerHTML = `<div><span style="color:#fbbf24;">[Jour ${etat.jour}]</span> ${msg}</div>` + box.innerHTML;
}

// 5. ACTIONS DU JOUEUR
async function embaucher() {
    if (etat.argent >= CONFIG.coutMineur) {
        etat.argent -= CONFIG.coutMineur;
        etat.mineurs++;
        log("Nouvel opérateur recruté.");
        majAffichage();
        await sauvegarderEnBase('MINE', `Recrutement 1 mineur (Total: ${etat.mineurs})`);
    }
}

async function acheterForeuse() {
    if (etat.argent >= CONFIG.coutForeuse) {
        etat.argent -= CONFIG.coutForeuse;
        etat.foreuses++;
        log("Nouvelle excavatrice mise en service !");
        majAffichage();
        await sauvegarderEnBase('MINE', `Achat 1 excavatrice (Total: ${etat.foreuses})`);
    }
}

async function reparer() {
    if (etat.argent >= CONFIG.coutRevision && etat.usure > 0) {
        etat.argent -= CONFIG.coutRevision;
        etat.usure = Math.max(0, etat.usure - 25);
        log("Révision atelier terminée (-25% usure).");
        majAffichage();
        await sauvegarderEnBase('MINE', `Révision atelier (-${CONFIG.coutRevision} €)`);
    }
}

async function primeMoral() {
    if (etat.argent >= CONFIG.coutPrime) {
        etat.argent -= CONFIG.coutPrime;
        etat.moral = Math.min(100, etat.moral + 15);
        log("Prime versée aux équipes (+15% moral).");
        majAffichage();
        await sauvegarderEnBase('MINE', `Prime versée aux équipes (-${CONFIG.coutPrime} €)`);
    }
}

async function vendreOr() {
    if (etat.stockOr <= 0) {
        log("Aucun lingot en stock à vendre.");
        return;
    }
    let brut = etat.stockOr * etat.coursOr;
    let impots = brut * CONFIG.taxeMiniere;
    let net = brut - impots;
    const grammesVendus = Math.round(etat.stockOr);
    etat.argent += net;
    log(`💰 Vente de ${grammesVendus}g d'or à ${etat.coursOr.toFixed(2)}€/g. Gain net : +${Math.round(net).toLocaleString()} €.`);
    etat.stockOr = 0;
    majAffichage();
    await sauvegarderEnBase('FINANCE', `Vente de ${grammesVendus}g d'or (+${Math.round(net)} € net)`);
}

// MODALE 100 % JAVASCRIPT NATIF (SANS JQUERY NI FOMANTIC)
function declencherEvenement() {
    const ev = EVENEMENTS.at(Math.floor(Math.random() * EVENEMENTS.length));
    const modal = document.getElementById('eventModal');
    document.getElementById('eventTitle').innerText = "⚠️ " + ev.titre;
    document.getElementById('eventDesc').innerText = ev.desc;
    
    const choicesDiv = document.getElementById('eventChoices');
    choicesDiv.innerHTML = '';
    
    ev.choix.forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'ui fluid yellow button';
        btn.innerText = c.texte;
        btn.onclick = async () => {
            c.action();
            modal.classList.remove('open');
            majAffichage();
            await sauvegarderEnBase('MINE', `Événement [${ev.titre}] -> ${c.texte}`);
        };
        choicesDiv.appendChild(btn);
    });
    
    modal.classList.add('open');
}

// 6. SIMULATION QUOTIDIENNE
async function jourSuivant() {
    etat.jour++;
    const cadence = parseFloat(document.getElementById('cadence').value);
    const pActive = parcelles.at(etat.parcelleActive);

    etat.coursOr = Math.max(CONFIG.coursOrMin, Math.min(CONFIG.coursOrMax, etat.coursOr * (1 + (Math.random() * 8 - 4) / 100)));
    etat.moral = Math.max(0, Math.min(100, etat.moral - ((cadence - 1) * 20) + 2));
    let greve = etat.moral < 25;

    etat.usure = Math.min(100, etat.usure + (etat.foreuses * CONFIG.usureParForeuse * cadence));
    let panne = (Math.random() * 100) < etat.usure;

    let prodMineurs = greve ? 0 : (etat.mineurs * CONFIG.prodMineurTonnes * cadence * (etat.moral / 100));
    let prodForeuses = panne ? 0 : (etat.foreuses * CONFIG.prodForeuseTonnes * cadence);
    let rocheExtraite = Math.min(pActive.reserveReelle, prodMineurs + prodForeuses);
    pActive.reserveReelle -= rocheExtraite;

    let orProduit = rocheExtraite * pActive.pureteReelle;
    etat.stockOr += orProduit;

    let couts = (etat.mineurs * CONFIG.salaireMineurJour) + (etat.foreuses * CONFIG.carburantForeuseJour);
    etat.argent -= couts;

    if (etat.coursOr > 72) {
        document.getElementById('conseil-assistante').innerText = "« Le cours de l'or est au plus haut (" + etat.coursOr.toFixed(2) + " €/g) ! Allez dans Coffre & Bourse pour vendre vos lingots ! »";
    } else if (pActive.reserveReelle < 250) {
        document.getElementById('conseil-assistante').innerText = "« Attention Patron, notre fosse actuelle est presque épuisée. Sondez un nouveau secteur dans l'onglet Concessions. »";
    } else if (etat.usure > 60) {
        document.getElementById('conseil-assistante').innerText = "« Nos excavatrices souffrent (" + Math.round(etat.usure) + "% d'usure). Une révision éviterait une panne. »";
    }

    let msg = `Extrait : ${Math.round(rocheExtraite)}t (+${Math.round(orProduit)}g d'or) | Frais fixes : -${couts} €`;
    if (greve) msg += " | ✊ GRÈVE !";
    if (panne) {
        msg += ` | ⚠️ PANNE ENGIN (-${CONFIG.coutPanneForcee} € réparation)`;
        etat.usure = 0;
        etat.argent -= CONFIG.coutPanneForcee;
    }
    if (pActive.reserveReelle <= 0) msg += " | 🛑 FOSSE ÉPUISÉE !";
    log(msg);

    if (chartPatrimoine && chartCoursOr) {
        const dsArgent = chartPatrimoine.data.datasets.at(0);
        const dsOr = chartCoursOr.data.datasets.at(0);
        if (chartPatrimoine.data.labels.length > 20) {
            chartPatrimoine.data.labels.shift();
            dsArgent.data.shift();
            chartCoursOr.data.labels.shift();
            dsOr.data.shift();
        }
        chartPatrimoine.data.labels.push('J' + etat.jour);
        dsArgent.data.push(Math.round(etat.argent));
        chartPatrimoine.update();

        chartCoursOr.data.labels.push('J' + etat.jour);
        dsOr.data.push(etat.coursOr.toFixed(2));
        chartCoursOr.update();
    }

    majAffichage();
    await sauvegarderEnBase('MINE', `Jour ${etat.jour} | Trésorerie: ${Math.round(etat.argent)} € | Stock Or: ${Math.round(etat.stockOr)}g`);

    if (Math.random() < CONFIG.chanceEvenement) declencherEvenement();
}

async function chargerClassement() {
    const res = await fetch('/api/game/ranking');
    if (!res.ok) return;
    const joueurs = await res.json();
    const tbody = document.getElementById('ranking-list');
    tbody.innerHTML = joueurs.map((j, index) => `
        <tr>
            <td><strong>#${index + 1}</strong></td>
            <td>${j.username}</td>
            <td>J${j.jour}</td>
            <td class="money-text">${Math.round(j.argent).toLocaleString()} €</td>
            <td class="gold-text">${Math.round(j.stock_or).toLocaleString()} g</td>
            <td>${j.foreuses}</td>
        </tr>
    `).join('');
}

async function deconnexion() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/index.html';
}

initialiserJeu();

