require("dotenv").config();
const axios = require("axios");
const { MessageMedia } = require("whatsapp-web.js");
// ============================================================
// WHATSAPP BOT — VERSION whatsapp-web.js
// Multi-sessions : chaque client a son propre numéro WhatsApp
// ============================================================

const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const admin = require("firebase-admin");

// ============================================================
// 🔐 CONFIGURATION
// ============================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ============================================================
// GESTION MULTI-SESSIONS
// sessions = { clientId: { client, status, qrCode } }
// ============================================================

const sessions = {};

// ============================================================
// UTILITAIRES
// ============================================================

function truncate(text, maxChars = 400) {
    if (!text) return "";
    return text.length > maxChars ? text.substring(0, maxChars) + "…" : text;
}


function detectQuickCommand(text) {
    const t = text.toLowerCase().trim();
    // Promo en premier car "promo" contient "pro" qui peut confondre
    if (/(promo|réduction|offre|promotion|remise|solde|rabais)/.test(t)) return "promo";
    // Ensuite les autres commandes
    if (/(prix|tarif|combien|menu|service|produit|voir|liste|manger|plat|commande|carte)/.test(t)) return "prices";
    if (/(adresse|localisation|où|ou trouver|itinéraire|local|lieu|situé|trouver|emplacement)/.test(t)) return "location";
    // Greeting en dernier
    if (/(bonjour|salut|hello|bonsoir|hey|yo|slt|bsr|bjr|cc|coucou|allo|allô)/.test(t)) return "greeting";
    return null;
}

// ============================================================
// HISTORIQUE DE CONVERSATION
// ============================================================

const MAX_HISTORY = 6;

async function getHistory(clientId, phoneNumber) {
    try {
        const ref = db.collection("conversations").doc(`${clientId}_${phoneNumber}`);
        const snap = await ref.get();
        if (!snap.exists) return [];
        return snap.data().messages || [];
    } catch (e) {
        console.error("Erreur lecture historique:", e.message);
        return [];
    }
}

async function saveHistory(clientId, phoneNumber, messages) {
    try {
        const ref = db.collection("conversations").doc(`${clientId}_${phoneNumber}`);
        await ref.set({ messages: messages.slice(-MAX_HISTORY), updatedAt: new Date() });
    } catch (e) {
        console.error("Erreur sauvegarde historique:", e.message);
    }
}

async function incrementUsage(clientId) {
    try {
        const ref = db.collection("clients").doc(clientId);
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
// TRAITEMENT DES MESSAGES
// ============================================================

async function handleMessage(clientId, msg) {
    const text = msg.body?.trim();
    const fromNumber = msg.from.replace("@c.us", "");

    console.log(`[${clientId}] MESSAGE DE: ${fromNumber} → ${text}`);

    if (!text || text.length < 2 || text.length > 600) return;

    try {
        // Lecture du client dans Firebase
        const snapshot = await db.collection("clients").doc(clientId).get();
        if (!snapshot.exists) return;

        const client = snapshot.data();
        if (client.active === false) return;

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

        const quickCmd = detectQuickCommand(text);
        console.log(`[${clientId}] COMMANDE: ${quickCmd}`);
       console.log(`[${clientId}] LOCATION:`, JSON.stringify(client.location));
        const whatsappClient = sessions[clientId]?.client;
        if (!whatsappClient) return;

        // ----------------------------------------------------------
        // COMMANDES RAPIDES
        // ----------------------------------------------------------

        if (quickCmd === "greeting") {
    await incrementUsage(clientId);
    const promoLine = promoActive ? `\n\n🎉 Promo : ${promoMessage}` : "";
    const horairesLine = client.horaires ? `\n⏰ Horaires : ${client.horaires}` : "";
    await whatsappClient.sendMessage(msg.from,
        `👋 Bonjour et bienvenue chez *${client.name}* !${horairesLine}\n\nComment puis-je vous aider ?\n• Voir nos ${label}\n• Infos de localisation\n• Promotions en cours${promoLine}`
    );
    return;
}

        if (quickCmd === "prices") {
            await incrementUsage(clientId);
            if (menuImages.length > 0) {
                await whatsappClient.sendMessage(msg.from, `📋 Voici nos ${label} 😋`);
                for (const imageUrl of menuImages) {
                    const media = await MessageMedia.fromUrl(imageUrl);
                    await whatsappClient.sendMessage(msg.from, media);
                }
                await whatsappClient.sendMessage(msg.from, "Souhaitez-vous passer commande ? 😊");
            } else {
                const list = items.length
                    ? items.map(i => `• ${i}`).join("\n")
                    : "Non disponible";
                await whatsappClient.sendMessage(msg.from, `📋 Nos ${label} :\n\n${list}\n\nSouhaitez-vous commander ?`);
            }
            return;
        }

        if (quickCmd === "location") {
            await incrementUsage(clientId);
            const loc = locationText || "Non disponible";
            const link = locationLink ? `\n📍 ${locationLink}` : "";
            await whatsappClient.sendMessage(msg.from, `📍 Notre adresse :\n${loc}${link}`);
            return;
        }

        if (quickCmd === "promo") {
            await incrementUsage(clientId);
            if (promoActive && promoMessage) {
                await whatsappClient.sendMessage(msg.from, `🎉 Promotion en cours :\n\n${promoMessage}`);
            } else {
                await whatsappClient.sendMessage(msg.from, "Aucune promotion active pour le moment. Revenez bientôt ! 😊");
            }
            return;
        }

        // ----------------------------------------------------------
        // OPENAI — messages non reconnus
        // ----------------------------------------------------------
        const history = await getHistory(clientId, fromNumber);
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
Horaires:
${client.horaires || "Non disponible"}
Informations supplémentaires:
${client.infos || "Non disponible"}


=========================
🎯 RÈGLES STRICTES
=========================
- Ne jamais inventer d'information
- Si une info est absente → dire "non disponible"
- Si promo active → la mentionner naturellement
- Toujours proposer une action claire à la fin
- Si le client veut commander → dire qu'une personne va prendre sa commande bientôt

=========================
STYLE
=========================
- Professionnel, chaleureux, vendeur
- Messages courts et clairs (WhatsApp)
- Emojis avec modération
- Répondre en français sauf si le client écrit dans une autre langue
`;

        const { default: axios } = await import("axios");
        const response = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                max_tokens: 400,
                messages: [{ role: "system", content: systemPrompt }, ...history],
            },
            {
                headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
                timeout: 10000,
            }
        );

        const reply = response.data?.choices?.[0]?.message?.content || "Désolé, je n'ai pas pu traiter votre demande. 😅";
        history.push({ role: "assistant", content: reply });
        await saveHistory(clientId, fromNumber, history);
        await incrementUsage(clientId);
        await whatsappClient.sendMessage(msg.from, reply);

    } catch (error) {
        console.error(`[${clientId}] ERREUR:`, error.message);
    }
}

// ============================================================
// CRÉATION D'UNE SESSION WHATSAPP
// ============================================================

function createSession(clientId) {
    if (sessions[clientId]) {
        console.log(`[${clientId}] Session déjà existante`);
        return;
    }

    console.log(`[${clientId}] Création de la session...`);

    const client = new Client({
        authStrategy: new LocalAuth({ clientId }),
        puppeteer: {
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        },
    });

    sessions[clientId] = { client, status: "initializing", qrCode: null };

    client.on("qr", async (qr) => {
        console.log(`[${clientId}] QR Code généré`);
        sessions[clientId].status = "qr_ready";
        sessions[clientId].qrCode = await qrcode.toDataURL(qr);
    });

    client.on("ready", async () => {
        console.log(`[${clientId}] ✅ Bot connecté !`);
        sessions[clientId].status = "connected";
        sessions[clientId].qrCode = null;

        // Sauvegarder le statut dans Firebase
        await db.collection("clients").doc(clientId).set(
            { botStatus: "connected", connectedAt: new Date() },
            { merge: true }
        );
    });

    client.on("disconnected", async (reason) => {
        console.log(`[${clientId}] ❌ Déconnecté: ${reason}`);
        sessions[clientId].status = "disconnected";
        await db.collection("clients").doc(clientId).set(
            { botStatus: "disconnected" },
            { merge: true }
        );
    });

    client.on("message", (msg) => {
        if (!msg.fromMe) handleMessage(clientId, msg);
    });

    client.initialize();
}

// ============================================================
// ROUTES API
// ============================================================

// Démarrer un nouveau client → génère un QR code
app.post("/api/client/start", async (req, res) => {
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: "clientId requis" });

    createSession(clientId);
    res.json({ message: `Session démarrée pour ${clientId}` });
});

// Page QR code — à partager au client pour qu'il scanne
app.get("/qr/:clientId", (req, res) => {
    const { clientId } = req.params;
    const session = sessions[clientId];

    if (!session) {
        return res.send(`
            <html>
            <head><meta charset="UTF-8"><title>QR Code</title></head>
            <body style="font-family:sans-serif;text-align:center;padding:40px">
                <h2>Session non trouvée</h2>
                <p>Le clientId "${clientId}" n'existe pas encore.</p>
            </body>
            </html>
        `);
    }

    if (session.status === "connected") {
        return res.send(`
            <html>
            <head><meta charset="UTF-8"><title>Connecté</title></head>
            <body style="font-family:sans-serif;text-align:center;padding:40px;background:#f0fff4">
                <h1>✅ Bot connecté !</h1>
                <p>WhatsApp est bien connecté pour ce compte.</p>
            </body>
            </html>
        `);
    }

    if (session.qrCode) {
        return res.send(`
            <html>
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="refresh" content="30">
                <title>Scanner le QR Code</title>
            </head>
            <body style="font-family:sans-serif;text-align:center;padding:40px;background:#fff">
                <h2>📱 Scanner ce QR Code avec WhatsApp</h2>
                <p>Ouvrez WhatsApp → Menu (⋮) → Appareils connectés → Connecter un appareil</p>
                <img src="${session.qrCode}" style="width:300px;height:300px;border:2px solid #ccc;border-radius:12px"/>
                <p style="color:#888;font-size:13px">La page se rafraîchit automatiquement toutes les 30 secondes</p>
            </body>
            </html>
        `);
    }

    return res.send(`
        <html>
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="refresh" content="5">
            <title>Chargement...</title>
        </head>
        <body style="font-family:sans-serif;text-align:center;padding:40px">
            <h2>⏳ Initialisation en cours...</h2>
            <p>La page va se rafraîchir automatiquement.</p>
        </body>
        </html>
    `);
});

// Statut de tous les clients
app.get("/api/status", (req, res) => {
    const status = {};
    for (const [id, session] of Object.entries(sessions)) {
        status[id] = session.status;
    }
    res.json(status);
});

// ============================================================
// DÉMARRAGE SERVEUR
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`✅ Serveur démarré sur le port ${PORT}`);
    console.log(`📱 Pour connecter un client: POST /api/client/start { clientId: "restaurant-xyz" }`);
    console.log(`🔗 Pour voir le QR code: GET /qr/restaurant-xyz`);

    // Reconnexion automatique de tous les clients Firebase
    try {
        const snapshot = await db.collection("clients").get();
        snapshot.forEach(doc => {
            console.log(`🔄 Reconnexion automatique: ${doc.id}`);
            createSession(doc.id);
        });
    } catch (e) {
        console.error("Erreur reconnexion automatique:", e.message);
    }
});
