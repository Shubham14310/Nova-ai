import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' }));

const API_KEY = process.env.GROQ_API_KEY;
const configuredTextModel = process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b';
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b';

// Older Groq model IDs can remain in Render environment variables after a code update.
const retiredModels = new Set([
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct'
]);
const TEXT_MODEL = retiredModels.has(configuredTextModel)
  ? 'openai/gpt-oss-120b'
  : configuredTextModel;

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'Nova AI backend' });
});

app.post('/api/chat', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(503).json({ error: 'GROQ_API_KEY is not configured on the server.' });
    }

    const messages = req.body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages are required.' });
    }

    const hasImage = messages.some(message =>
      Array.isArray(message?.content) &&
      message.content.some(part => part?.type === 'image_url' && part?.image_url?.url)
    );

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: hasImage ? VISION_MODEL : TEXT_MODEL,
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
    });

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
