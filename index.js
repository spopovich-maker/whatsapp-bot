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
                        content: "Tu es un assistant WhatsApp professionnel pour entreprise. Tu aides les clients avec des réponses claires."
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