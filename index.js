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

// ⚠️ IMPORTANT : Remplace les valeurs Firebase par ta NOUVELLE clé
// (celle générée après avoir révoqué l'ancienne)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            type: "service_account",
            project_id: "bot-whatsapp-cd585",
            private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,   // ← mets dans Render
            private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"), // ← mets dans Render
            client_email: "firebase-adminsdk-fbsvc@bot-whatsapp-cd585.iam.gserviceaccount.com",
            client_id: process.env.FIREBASE_CLIENT_ID,              // ← mets dans Render
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

// Réponse avec images (format TwiML correct pour WhatsApp)
function twimlResponseWithMedia(res, message, imageUrls) {
    res.set("Content-Type", "text/xml");
    const mediaXml = imageUrls.map(url => `<Media>${url}</Media>`).join("");
    return res.send(`<Response><Message><Body>${escapeXml(message)}</Body>${mediaXml}</Message></Response>`);
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
        const menuImages = client.menuImages || [];
        const type = client.type || "entreprise";

        let label = "services";
        if (type === "restaurant") label = "menu";
        else if (type === "boutique") label = "produits";

        console.log("CLIENT TROUVÉ:", client.name);

        // ----------------------------------------------------------
        // COMMANDES RAPIDES (sans OpenAI)
        // ----------------------------------------------------------
        const quickCmd = detectQuickCommand(text);
        console.log("COMMANDE DÉTECTÉE:", quickCmd);

        if (quickCmd === "greeting") {
            await incrementUsage(cleanNumber);
            const promoLine = promoActive ? `\n\n🎉 Promo : ${promoMessage}` : "";
            return twimlResponse(
                res,
                `👋 Bonjour et bienvenue chez *${client.name}* !\n\nComment puis-je vous aider ?\n• Voir notre ${label}\n• Infos de localisation\n• Promotions en cours${promoLine}`
            );
        }

        if (quickCmd === "prices") {
            await incrementUsage(cleanNumber);
            console.log("IMAGES MENU:", menuImages.length, "image(s) trouvée(s)");

            if (menuImages.length > 0) {
                // ✅ Format TwiML correct pour envoyer des images sur WhatsApp
                return twimlResponseWithMedia(
                    res,
                    `📋 Voici notre ${label} 😋\n\nSouhaitez-vous passer commande ?`,
                    menuImages
                );
            } else {
                // Fallback texte si pas d'images
                const list = items.length
                    ? items.map(i => `• ${i}`).join("\n")
                    : "Non disponible";
                return twimlResponse(res, `📋 Notre ${label} :\n\n${list}\n\nSouhaitez-vous commander ?`);
            }
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
        // HISTORIQUE + APPEL OPENAI (messages non reconnus)
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

        return twimlResponse(res, reply);

    } catch (error) {
        console.error("=== ERREUR DÉTAILLÉE ===");
        if (error.response) {
            const status = error.response.status;
            console.error("Erreur OpenAI:", status, JSON.stringify(error.response.data));
            if (status === 429) return twimlResponse(res, "⚠️ Service surchargé. Réessayez dans quelques secondes.");
            if (status === 401) return twimlResponse(res, "⚠️ Erreur de configuration. Contactez le support.");
        } else if (error.code === "ECONNABORTED") {
            console.error("Timeout OpenAI");
            return twimlResponse(res, "⚠️ Réponse trop longue. Réessayez svp.");
        } else {
            console.error("Erreur inconnue:", error.message, error.stack);
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
