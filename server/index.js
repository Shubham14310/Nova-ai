
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' }));

const API_KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_TEXT_MODEL || 'llama-3.3-70b-versatile';

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'Nova AI backend' });
});

app.post('/api/chat', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(503).json({ error: 'GROQ_API_KEY is not configured.' });
    }

    const messages = req.body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages are required.' });
    }

    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are Nova, a helpful AI assistant. Reply in the language the user uses.'
            },
            ...messages
          ],
          temperature: 0.7,
          max_tokens: 1200
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'Groq request failed.'
      });
    }

    res.json({
      reply: data.choices?.[0]?.message?.content || 'No reply generated.'
    });
  } catch (error) {
    res.status(500).json({ error: 'Backend error: ' + error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Nova AI running on ${port}`));
