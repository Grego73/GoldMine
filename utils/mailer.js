const LINKS = require('../config/links');
require('dotenv').config();

// Envoie un e-mail via l'API Brevo (ou affiche le code dans la console en mode test local)
async function envoyerEmail(destinataire, sujet, contenuHtml) {
    if (!process.env.BREVO_API_KEY) {
        console.log(`⚠️ [MODE TEST SANS BREVO] À : ${destinataire} | Sujet : ${sujet}`);
        console.log(`📩 Contenu : ${contenuHtml}`);
        return true;
    }

    try {
        const response = await fetch(LINKS.brevoApiUrl, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': process.env.BREVO_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: {
                    name: 'Gold Mine',
                    email: process.env.BREVO_SENDER_EMAIL || 'noreply@goldmine.fr'
                },
                to: new Array({ email: destinataire }),
                subject: sujet,
                htmlContent: contenuHtml
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("❌ Erreur réponse Brevo :", errText);
            return false;
        }
        return true;
    } catch (err) {
        console.error("❌ Erreur réseau envoi e-mail Brevo :", err);
        return false;
    }
}

module.exports = { envoyerEmail };
