// ============================================================
// WHATSAPP BOT — CODE FINAL CORRIGÉ
// Projet Firebase : bot-whatsapp-cd585
// ============================================================

const express = require("express");
const axios = require("axios");
const twilio = require("twilio");
const admin = require("firebase-admin");

// ============================================================
// 🔐 CONFIGURATION
// ============================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            type: "service_account",
            project_id: "bot-whatsapp-cd585",
            private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
            private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
            client_email: "firebase-adminsdk-fbsvc@bot-whatsapp-cd585.iam.gserviceaccount.com",
            client_id: process.env.FIREBASE_CLIENT_ID,
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
// UTILITAIRES — utilise la librairie Twilio (plus fiable que XML manuel)
// ============================================================

// Réponse texte simple
function sendText(res, message) {
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(message);
    console.log("TWIML ENVOYÉ:", twiml.toString());
   res.status(200).set("Content-Type", "text/xml");
    return res.send(twiml.toString());
}

// Réponse avec image(s)
function sendMedia(res, message, imageUrls) {
    const twiml = new twilio.twiml.MessagingResponse();
    const msg = twiml.message();
    msg.body(message);
    imageUrls.forEach(url => msg.media(url));
    console.log("TWIML MEDIA ENVOYÉ:", twiml.toString());
   res.status(200).set("Content-Type", "text/xml");
    return res.send(twiml.toString());
}

function truncate(text, maxChars = 400) {
    if (!text) return "";
    return text.length > maxChars ? text.substring(0, maxChars) + "…" : text;
}

function detectQuickCommand(text) {
    const t = text.toLowerCase().trim();
    if (/(bonjour|salut|hello|bonsoir|hey|yo|slt|bsr|bjr|cc|coucou|allo|allô)/.test(t)) return "greeting";
    if (/(prix|tarif|combien|menu|service|produit|voir|liste|manger|plat|commande|carte)/.test(t)) return "prices";
    if (/(adresse|localisation|où|ou trouver|itinéraire|local|lieu|situé|trouver|emplacement)/.test(t)) return "location";
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
            usage: {
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

    const userMessage = req.body.Body;
    const fromNumber = req.body.From;
    const text = userMessage?.trim();

    console.log("MESSAGE REÇU:", text);
    console.log("NUMÉRO:", fromNumber);

    if (!text || text.length < 2) {
        return sendText(res, "⚠️ Message trop court, pouvez-vous préciser votre demande ?");
    }

    if (text.length > 600) {
        return sendText(res, "⚠️ Message trop long. Pouvez-vous le résumer en quelques mots ?");
    }

    try {
        const cleanNumber = fromNumber.replace("whatsapp:", "");
        const snapshot = await db.collection("clients").doc(cleanNumber).get();

        console.log("cleanNumber:", cleanNumber, "| exists:", snapshot.exists);

        if (!snapshot.exists) {
            return sendText(res, "⚠️ Ce numéro n'est pas enregistré dans notre système. Contactez-nous pour activer votre compte.");
        }

        const client = snapshot.data();

        if (client.active === false) {
            return sendText(res, "⚠️ Votre abonnement est inactif. Contactez le support pour réactiver votre service.");
        }

        const items = client.items || [];
        const promoActive = client.promo?.active;
        const promoMessage = client.promo?.message;
        const locationText = client.location?.text;
        const locationLink = client.location?.link;
        const menuImages = client.menuImages || [];
        const type = client.type || "entreprise";

        let label = "services";
        if (type === "restaurant") label = "menu";
        else if (type === "boutique") label = "produits";

        console.log("CLIENT TROUVÉ:", client.name);

        const quickCmd = detectQuickCommand(text);
        console.log("COMMANDE DÉTECTÉE:", quickCmd);

        // ----------------------------------------------------------
        // COMMANDES RAPIDES
        // ----------------------------------------------------------

        if (quickCmd === "greeting") {
            await incrementUsage(cleanNumber);
            const promoLine = promoActive ? `\n\n🎉 Promo : ${promoMessage}` : "";
            return sendText(res,
                `👋 Bonjour et bienvenue chez ${client.name} !\n\nComment puis-je vous aider ?\n• Voir notre ${label}\n• Infos de localisation\n• Promotions en cours${promoLine}`
            );
        }

        if (quickCmd === "prices") {
            await incrementUsage(cleanNumber);
            console.log("IMAGES MENU:", menuImages.length, "image(s) trouvée(s)");

            if (menuImages.length > 0) {
                return sendMedia(res,
                    `Voici notre ${label} 😋\n\nSouhaitez-vous passer commande ?`,
                    menuImages
                );
            } else {
                const list = items.length
                    ? items.map(i => `• ${i}`).join("\n")
                    : "Non disponible";
                return sendText(res, `📋 Notre ${label} :\n\n${list}\n\nSouhaitez-vous commander ?`);
            }
        }

        if (quickCmd === "location") {
            await incrementUsage(cleanNumber);
            const loc = locationText || "Non disponible";
            const link = locationLink ? `\n📍 ${locationLink}` : "";
            return sendText(res, `📍 Notre adresse :\n${loc}${link}`);
        }

        if (quickCmd === "promo") {
            await incrementUsage(cleanNumber);
            if (promoActive && promoMessage) {
                return sendText(res, `🎉 Promotion en cours :\n\n${promoMessage}`);
            } else {
                return sendText(res, "Aucune promotion active pour le moment. Revenez bientôt ! 😊");
            }
        }

        // ----------------------------------------------------------
        // OPENAI — messages non reconnus
        // ----------------------------------------------------------
        const history = await getHistory(cleanNumber);
        history.push({ role: "user", content: truncate(text) });

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
- Si le client veut commander → dire poliment qu'une personne va prendre sa commande bientôt

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

        return sendText(res, reply);

    } catch (error) {
        console.error("=== ERREUR DÉTAILLÉE ===");
        if (error.response) {
            const status = error.response.status;
            console.error("Erreur OpenAI:", status, JSON.stringify(error.response.data));
            if (status === 429) return sendText(res, "⚠️ Service surchargé. Réessayez dans quelques secondes.");
            if (status === 401) return sendText(res, "⚠️ Erreur de configuration. Contactez le support.");
        } else if (error.code === "ECONNABORTED") {
            console.error("Timeout OpenAI");
            return sendText(res, "⚠️ Réponse trop longue. Réessayez svp.");
        } else {
            console.error("Erreur inconnue:", error.message, error.stack);
        }
        return sendText(res, "😅 Une erreur est survenue. Réessayez dans un moment.");
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
