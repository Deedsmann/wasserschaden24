const express = require('express');
const cors    = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ADMIN_KEY         = process.env.ADMIN_KEY;

const rueckrufe = [];

// ROUTE 1: Anthropic API Proxy
app.post('/chat', async (req, res) => {
  const { messages, system } = req.body;
  if (!messages) return res.status(400).json({ error: 'messages fehlt' });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        system,
        messages
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Anthropic Fehler');
    res.json(data);
  } catch (err) {
    console.error('Chat-Fehler:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ROUTE 2: Rückruf speichern (SMS kommt später)
app.post('/send-sms', async (req, res) => {
  const { name, telefon } = req.body;
  if (!name || !telefon) return res.status(400).json({ error: 'Name und Telefon erforderlich' });
  const eintrag = { name, telefon, zeit: new Date().toLocaleString('de-DE'), status: 'neu' };
  rueckrufe.push(eintrag);
  console.log(`📞 NEUER RÜCKRUF: ${name} – ${telefon}`);
  res.json({ success: true });
});

// ROUTE 3: Rückrufliste
app.get('/rueckrufe', (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Nicht autorisiert' });
  res.json(rueckrufe);
});

app.get('/', (req, res) => res.send('Wasserschaden24 Server läuft ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
