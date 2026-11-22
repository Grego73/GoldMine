require('dotenv').config();

async function envoyerEmail(destinataire, sujet, contenuHtml) {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;

    if (!apiKey || !senderEmail) {
        console.log(`⚠️ [MODE TEST SANS BREVO] Mail pour ${destinataire} | Sujet: ${sujet} | Contenu: ${contenuHtml}`);
        return false;
    }

    const texteBrut = contenuHtml.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();

    const htmlComplet = `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 20px; background: #1c1917; color: #f5f5f4; border-radius: 8px; border: 1px solid #44403c;">
            <div style="border-bottom: 2px solid #d97706; padding-bottom: 10px; margin-bottom: 16px;">
                <strong style="color: #fbbf24; font-size: 18px;">GOLD MINE — Simulation Minière</strong>
            </div>
            <div style="line-height: 1.6; font-size: 15px;">
                ${contenuHtml}
            </div>
            <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #44403c; font-size: 12px; color: #a8a29e;">
                Cet e-mail automatique vous a été envoyé suite à une demande sur votre compte Gold Mine. Si vous n'êtes pas à l'origine de cette action, vous pouvez ignorer ce message.
            </div>
        </div>
    `;

    try {
        const LINKS = require('../config/links');
        // ... et dans fetch :
        const response = await fetch(LINKS.brevoApiUrl, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: 'Gold Mine', email: senderEmail },
                to: new Array({ email: destinataire }),
                subject: sujet,
                htmlContent: htmlComplet,
                textContent: texteBrut
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('❌ Erreur API Brevo :', errText);
            return false;
        }
        return true;
    } catch (err) {
        console.error('❌ Erreur envoi mail :', err);
        return false;
    }
}

module.exports = { envoyerEmail };
