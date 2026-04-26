// ============================================================
// WHATSAPP BOT — CODE FINAL AVEC FIREBASE INTÉGRÉ
// Projet Firebase : bot-whatsapp-cd585
// ============================================================

const express = require("express");
const axios = require("axios");
const twilio = require("twilio");
const admin = require("firebase-admin");

// ============================================================
// 🔐 CONFIGURATION
// Remplace uniquement les valeurs marquées *** CHANGER ***
// ============================================================

const OPENAI_API_KEY = "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";           // *** CHANGER ***
const TWILIO_AUTH_TOKEN = "a68a79973fd3fa95153d600a6839d72a";     // *** CHANGER ***

// Firebase — utilise ta NOUVELLE clé après avoir révoqué l'ancienne
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            type: "service_account",
            project_id: "bot-whatsapp-cd585",
            private_key_id: "c895aeba2a8c7cdc8a486ab13d7568c29785fe7d",   // *** CHANGER après révocation ***
            private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDHo9jHL0mUPVyr\nB0Pr/yPU6CPUWRtjDZJ+NQDkrpwuIeUQqQ+2vD/61gpRAYeoj3ZCQF9dm0ITI9B5\nxIP/+q7ztGq3Iy2J4k9rATgZMbPVcP/r8NSo/7cCRcEkEw4D7dcP6iBgCBcMyAc7\nNreaYzC64iOJPNw77u1P5J7XuC9sYJXaM0XBA5j6IR/f2jy4x5CslGrZ1HV46K9s\njhq2U+pvIxEGjz4K8h1p8+xfjsT4gVzxeENlorfklcBZvkJ1th42Sjti3EyQnXgt\n8wq6o/iugtEjqjzrrIr4j3XTFIcDN6Mk/2ceY/rglFaPnm8rjEvgx9umhht4nGGw\nHWK27Gd/AgMBAAECggEAFLvtGz7LhwRad/7QrJV6jLWxZu/8Oqzhro7lsVp7KQVn\nK3RLiACEKpKJTsF4a+a+cwIJhYjG84LwN31T8kWAXxo5TRzvsVbaRbRCNcemNEBA\nrCn+hDDOuoMxHISIG5tbjzETPLYKYs7xhVJY/kVX/cjXxPyXqPfXGMmXP7NG5Zvx\nPI9fIhN9yqrJ+qXwb+2aNRXz6/ObtbnaawWr4cOy7lTXoZ2cDOyIR3BSYHcfx5OT\nBz1rV3bDL7sOTmYoEq3viTbV4D4Fwo71/1koc7KQOZE1hNeTKU/2/mdc7wSIq1HN\nCbV6+GUhHhsutI1p1U3/hNrxhqC56rzqIlPWEJGzuQKBgQD3tvm9Ry95jbFbLCXH\nqP/Jw5ijbdTjaa+ifUuAHHDPht+7I8t6flhiFt+Y8xlsTxBR6YlBdaUzpcb0oXX3\n9vHdHsU+jfaxWqyyHiGsA38ZuD8gh9K/DAyTGu6tivMK3jX8z1WogQ0/qerCg8w3\nmEkQm0czz9m4wwVMzIsc08hgxwKBgQDOUTzkXJ5wF+vhKDopWwBIV3XKBUgA4wcF\nt8yaSKm0BV0eiuo3CGnFGsDCzFQ9RgDYYDV4Cm1PWHfgCBNkW+aamcWGX12yzwJp\nQ3iKQXVS8yBZ21g3MA0t6vdxx9v9y6mR5IJliZIGVTXMss9c6jUAmortjE6Gf2Yd\n40C3pUd7iQKBgEz3qnNYSfT/xKqqdfaqmQeM4cFt3+blMLBRNANTUu34X03bWl7u\nIPIhX0o7xptzmYOKB56yOilpCf96p5frP81PwUOlgpAqt1wEpru2vmg0alDmQuIf\nkUyn4p9DfC7VSnsJxPi9WGt+lTXpE6v2gkVJqf78Rw70cZIiP9suJqWDAoGAAtIZ\ngwXBJMcu8mUaZnZYCqUndxubYGe6MNnSckmMCGoKW+CKUzZKO+ehuwgQHsZWPJ8U\nHBAIbo1HFkkF+tlGzdZMXQnwvgEWh1nky/8ZG4k3aAMXsal2hKoxt9yDpXSjXNtC\n7SB0XqHLmoDXVO3ey6NRQu4oJK6ZNs9kkx4vXAECgYEAk8RsWAh4qD//UoHyz2t4\neTqtu7mtx/l4sBkCdzWZagXvA6TdxuhXetvzVmylksoh1Lu03EpJdymdQ90P7rWw\nD8KLxkxnCrcEcXf631PaNdMwmpQmSfdb747K/Y0hm+tdNvqqnaJPwxf2gacb+EIV\nuPRYl1FZA2V2iu2ZKfAvSRE=\n-----END PRIVATE KEY-----\n",          // *** CHANGER après révocation ***
            client_email: "firebase-adminsdk-fbsvc@bot-whatsapp-cd585.iam.gserviceaccount.com",
            client_id: "105603007657199749921",               // *** CHANGER après révocation ***
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
        }),
    });
}

const db = admin.firestore();
const app = express();

// ============================================================
// MIDDLEWARES
// ============================================================

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ============================================================
// UTILITAIRES
// ============================================================

function escapeXml(unsafe) {
    if (!unsafe) return "";
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function twimlResponse(res, message) {
    res.set("Content-Type", "text/xml");
    return res.send(`<Response><Message>${escapeXml(message)}</Message></Response>`);
}

function truncate(text, maxChars = 400) {
    if (!text) return "";
    return text.length > maxChars ? text.substring(0, maxChars) + "…" : text;
}

function detectQuickCommand(text) {
    const t = text.toLowerCase().trim();
    if (/(bonjour|salut|hello|bonsoir|hey|slt|bjr)/.test(t)) return "greeting";
    if (/(prix|tarif|combien|coût|menu|services|produits|voir|liste|avez.vous|proposez)/.test(t)) return "prices";
    if (/(adresse|localisation|où|ou trouver|itinéraire|local|lieu|emplacement|situé|trouver vous|vous êtes)/.test(t)) return "location";
    if (/(promo|réduction|offre|promotion|remise|solde)/.test(t)) return "promo";
    return null;
}
// ============================================================
// HISTORIQUE DE CONVERSATION
// ============================================================

const MAX_HISTORY = 6;

async function getHistory(phoneNumber) {
    try {
        const ref = db.collection("conversations").doc(phoneNumber);
        const snap = await ref.get();
        if (!snap.exists) return [];
        return snap.data().messages || [];
    } catch (e) {
        console.error("Erreur lecture historique:", e.message);
        return [];
    }
}

async function saveHistory(phoneNumber, messages) {
    try {
        const ref = db.collection("conversations").doc(phoneNumber);
        const trimmed = messages.slice(-MAX_HISTORY);
        await ref.set({ messages: trimmed, updatedAt: new Date() });
    } catch (e) {
        console.error("Erreur sauvegarde historique:", e.message);
    }
}

// ============================================================
// COMPTEUR D'UTILISATION
// ============================================================

async function incrementUsage(clientNumber) {
    try {
        const ref = db.collection("clients").doc(clientNumber);
        await ref.set({
            "usage": {
                totalMessages: admin.firestore.FieldValue.increment(1),
                lastMessageAt: new Date(),
            }
        }, { merge: true });
    } catch (e) {
        console.error("Erreur compteur usage:", e.message);
    }
}

// ============================================================
// ROUTE PRINCIPALE WHATSAPP
// ============================================================

app.post("/whatsapp", async (req, res) => {

    // ----------------------------------------------------------
    // 🔐 VÉRIFICATION SIGNATURE TWILIO
    // ----------------------------------------------------------
    //const twilioSignature = req.headers["x-twilio-signature"];
   // const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

   //  const isValid = twilio.validateRequest(
      //   TWILIO_AUTH_TOKEN,
        // twilioSignature,
        // url,
        // req.body
    // );

   // if (!isValid) {
    //    console.warn("⚠️ Requête non autorisée — signature Twilio invalide");
      //  return res.status(403).send("Forbidden");
//    }

    // ----------------------------------------------------------
    // LECTURE DES DONNÉES ENTRANTES
    // ----------------------------------------------------------
    const userMessage = req.body.Body;
    const fromNumber = req.body.From;
    const text = userMessage?.trim();

    console.log("MESSAGE REÇU:", text);
    console.log("NUMÉRO:", fromNumber);

    if (!text || text.length < 2) {
        return twimlResponse(res, "⚠️ Message trop court, pouvez-vous préciser votre demande ?");
    }

    if (text.length > 600) {
        return twimlResponse(res, "⚠️ Message trop long. Pouvez-vous le résumer en quelques mots ?");
    }

    try {
        // ----------------------------------------------------------
        // NORMALISATION DU NUMÉRO + LECTURE FIREBASE
        // ----------------------------------------------------------
        const cleanNumber = fromNumber.replace("whatsapp:", "");
        const snapshot = await db.collection("clients").doc(cleanNumber).get();

        console.log("cleanNumber:", cleanNumber, "| exists:", snapshot.exists);

        if (!snapshot.exists) {
            return twimlResponse(
                res,
                "⚠️ Ce numéro n'est pas enregistré dans notre système. Contactez-nous pour activer votre compte."
            );
        }

        const client = snapshot.data();

        if (client.active === false) {
            return twimlResponse(
                res,
                "⚠️ Votre abonnement est inactif. Contactez le support pour réactiver votre service."
            );
        }

        // ----------------------------------------------------------
        // EXTRACTION DONNÉES CLIENT
        // ----------------------------------------------------------
        const items = client.items || [];
        const promoActive = client.promo?.active;
        const promoMessage = client.promo?.message;
        const locationText = client.location?.text;
        const locationLink = client.location?.link;
        const type = client.type || "entreprise";

        let label = "services";
        if (type === "restaurant") label = "menu";
        else if (type === "boutique") label = "produits";

        console.log("CLIENT TROUVÉ:", client.name);

        // ----------------------------------------------------------
        // COMMANDES RAPIDES (sans OpenAI)
        // ----------------------------------------------------------
        const quickCmd = detectQuickCommand(text);

        if (quickCmd === "greeting") {
            await incrementUsage(cleanNumber);
            const promoLine = promoActive ? `\n\n🎉 Promo : ${promoMessage}` : "";
            return twimlResponse(
                res,
                `👋 Bonjour et bienvenue chez *${client.name}* !\n\nComment puis-je vous aider ?\n• Voir nos ${label}\n• Infos de localisation\n• Promotions en cours${promoLine}`
            );
        }

        if (quickCmd === "location") {
            await incrementUsage(cleanNumber);
            const loc = locationText || "Non disponible";
            const link = locationLink ? `\n📍 ${locationLink}` : "";
            return twimlResponse(res, `📍 Notre adresse :\n${loc}${link}`);
        }

        if (quickCmd === "promo") {
            await incrementUsage(cleanNumber);
            if (promoActive && promoMessage) {
                return twimlResponse(res, `🎉 Promotion en cours :\n\n${promoMessage}`);
            } else {
                return twimlResponse(res, "Aucune promotion active pour le moment. Revenez bientôt ! 😊");
            }
        }

        // ----------------------------------------------------------
        // HISTORIQUE DE CONVERSATION
        // ----------------------------------------------------------
        const history = await getHistory(cleanNumber);
        history.push({ role: "user", content: truncate(text) });

        // ----------------------------------------------------------
        // APPEL OPENAI
        // ----------------------------------------------------------
        const systemPrompt = `
Tu es un assistant WhatsApp professionnel pour l'entreprise suivante.

=========================
📦 ENTREPRISE
=========================
Nom: ${client.name}
Type: ${type}

${label}:
${items.length ? items.map(i => `• ${i}`).join("\n") : "Non disponible"}

Promotion:
${promoActive ? promoMessage : "Aucune promotion en cours"}

Localisation:
${locationText || "Non disponible"}
${locationLink || ""}

=========================
🎯 RÈGLES STRICTES
=========================
- Ne jamais inventer d'information
- Si une info est absente → dire "non disponible"
- Si promo active → la mentionner naturellement
- Si localisation demandée → donner texte ET lien
- Toujours proposer une action claire à la fin
- Si le client exprime son envie de commander dire de facon polie qu une personne va bientot prendre sa comande

=========================
STYLE
=========================
- Professionnel, chaleureux, vendeur
- Messages courts et clairs (WhatsApp)
- Emojis avec modération
- Répondre en français sauf si le client écrit dans une autre langue

`;

        const response = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                max_tokens: 400,
                messages: [
                    { role: "system", content: systemPrompt },
                    ...history,
                ],
            },
            {
                headers: {
                    Authorization: `Bearer ${OPENAI_API_KEY}`,
                    "Content-Type": "application/json",
                },
                timeout: 10000,
            }
        );

        const reply =
            response.data?.choices?.[0]?.message?.content ||
            "Désolé, je n'ai pas pu traiter votre demande. 😅";

        history.push({ role: "assistant", content: reply });
        await saveHistory(cleanNumber, history);
        await incrementUsage(cleanNumber);

        return twimlResponse(res, reply);

    } catch (error) {
        if (error.response) {
            const status = error.response.status;
            console.error("Erreur OpenAI:", status, error.response.data);
            if (status === 429) return twimlResponse(res, "⚠️ Service surchargé. Réessayez dans quelques secondes.");
            if (status === 401) return twimlResponse(res, "⚠️ Erreur de configuration. Contactez le support.");
        } else if (error.code === "ECONNABORTED") {
            console.error("Timeout OpenAI");
            return twimlResponse(res, "⚠️ Réponse trop longue. Réessayez svp.");
        } else {
            console.error("Erreur inconnue:", error.message);
        }
        return twimlResponse(res, "😅 Une erreur est survenue. Réessayez dans un moment.");
    }
});

// ============================================================
// DÉMARRAGE SERVEUR
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Bot WhatsApp démarré sur le port ${PORT}`);
});

module.exports = app;
