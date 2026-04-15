const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.urlencoded({ extended: false }));

// ⚠️ Mets ta clé OpenAI ici
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Route WhatsApp
app.post("/whatsapp", async (req, res) => {
    const userMessage = req.body.Body;

    // 🔒 Filtre anti-spam simple
    const text = userMessage.trim();

    if (!text || text.length < 2) {
        return res.send(`
            <Response>
                <Message>⚠️ Message invalide</Message>
            </Response>
        `);
    }

    try {
        const response = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                messages: [
                    {
  role: "system",
  content: `
Tu es un assistant WhatsApp professionnel pour une entreprise.

TON RÔLE :
- répondre uniquement aux questions liées aux services (produits, prix, commandes, devis, horaires)
- aider à vendre ou informer les clients

INTERDICTIONS :
- ne jamais parler de toi-même
- ne jamais répondre à "qui t’a créé", "comment tu fonctionnes", "OpenAI", "code", etc.

Si la question est hors sujet :
"Je suis un assistant commercial. Comment puis-je vous aider avec nos services ?"

STYLE :
- court
- professionnel
- orienté vente
`
},
                    {
                        role: "user",
                        content: text
                    }
                ]
            },
            {
                headers: {
                    "Authorization": `Bearer ${OPENAI_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const reply = response.data.choices[0].message.content;

        res.send(`
            <Response>
                <Message>${reply}</Message>
            </Response>
        `);

    } catch (error) {
        console.log("ERREUR OPENAI:", error.response?.data || error.message);

        res.send(`
            <Response>



                <Message>Erreur serveur 😅</Message>
            </Response>
        `);
    }
});

// 🔥 IMPORTANT POUR RENDER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Bot lancé sur port " + PORT);
});