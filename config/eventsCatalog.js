// Catalogue extensible des événements quotidiens de chantier
const EVENTS_CATALOG = [
    {
        id: "glissement",
        titre: "Glissement de terrain sur le gradin Nord",
        desc: "Les fortes pluies fragilisent la paroi de la mine à ciel ouvert.",
        choix: [
            { id: "securiser", texte: "Sécuriser avec des soutènements (-3 000 €)", effet: { argent: -3000, moral: 0, usure: 0, bonusOr: 0 } },
            { id: "continuer", texte: "Continuer l'extraction (-25% Moral équipes)", effet: { argent: 0, moral: -25, usure: 5, bonusOr: 0 } }
        ]
    },
    {
        id: "greve_engins",
        titre: "Revendication des conducteurs d'engins",
        desc: "Les opérateurs réclament une prime de poussière et de chaleur.",
        choix: [
            { id: "prime", texte: "Verser une prime (-2 000 € / +20% Moral)", effet: { argent: -2000, moral: 20, usure: 0, bonusOr: 0 } },
            { id: "refus", texte: "Refuser (-30% Moral)", effet: { argent: 0, moral: -30, usure: 0, bonusOr: 0 } }
        ]
    },
    {
        id: "filon_surface",
        titre: "Poche aurifère affleurante détectée",
        desc: "Vos géologues ont repéré une veine riche juste sous la couche supérieure !",
        choix: [
            { id: "extraire", texte: "Mobiliser l'équipe (+150 g d'or / +10% Usure)", effet: { argent: 0, moral: 5, usure: 10, bonusOr: 150 } }
        ]
    },
    {
        id: "inspection_securite",
        titre: "Inspection surprise de la DREAL",
        desc: "Les inspecteurs contrôlent la conformité des pistes et des engins.",
        choix: [
            { id: "mise_aux_normes", texte: "Mise aux normes immédiate (-1 500 €)", effet: { argent: -1500, moral: 5, usure: -5, bonusOr: 0 } },
            { id: "amende", texte: "Laisser passer et payer l'amende (-2 500 € / -10% Moral)", effet: { argent: -2500, moral: -10, usure: 0, bonusOr: 0 } }
        ]
    }
];

module.exports = { EVENTS_CATALOG };
