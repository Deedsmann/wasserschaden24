// ============================================================
//  Wasserschaden24.online – Backend Server
//  - Anthropic API Proxy (Key bleibt sicher am Server)
//  - SMS-Bestätigung via Twilio
//  Läuft auf Railway.app
// ============================================================

const express = require('express');
const twilio  = require('twilio');
const cors    = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;
const ADMIN_KEY          = process.env.ADMIN_KEY;

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const pendingConfirmations = new Map();

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

// ROUTE 2: SMS senden
app.post('/send-sms', async (req, res) => {
  const { name, telefon } = req.body;
  if (!name || !telefon) return res.status(400).json({ error: 'Name und Telefon erforderlich' });
  let cleanTel = telefon.replace(/[^0-9+]/g, '');
  if (cleanTel.startsWith('0')) cleanTel = '+49' + cleanTel.slice(1);
  const smsText = `Hallo ${name}! Wasserschaden24.online hier 👋\nWir haben Ihre Rückruf-Anfrage erhalten.\nBitte antworten Sie mit JA – dann rufen wir Sie sofort zurück!`;
  try {
    await twilioClient.messages.create({ body: smsText, from: TWILIO_FROM_NUMBER, to: cleanTel });
    pendingConfirmations.set(cleanTel, { name, telefon: cleanTel, zeit: new Date().toLocaleString('de-DE'), status: 'sms_gesendet' });
    console.log(`✅ SMS gesendet → ${cleanTel} (${name})`);
    res.json({ success: true });
  } catch (err) {
    console.error('SMS-Fehler:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ROUTE 3: Eingehende SMS (Twilio Webhook)
app.post('/sms-eingang', (req, res) => {
  const vonNummer = req.body.From;
  const nachricht = (req.body.Body || '').trim().toLowerCase();
  const eintrag   = pendingConfirmations.get(vonNummer);
  const twiml     = new twilio.twiml.MessagingResponse();
  const jaAntwort = ['ja','j','yes','ok','jo','klar','bitte','gerne'].some(w => nachricht.includes(w));
  if (eintrag && jaAntwort) {
    eintrag.status = 'bestaetigt';
    eintrag.bestaetigtUm = new Date().toLocaleString('de-DE');
    pendingConfirmations.set(vonNummer, eintrag);
    twiml.message(`Super, ${eintrag.name}! ✅ Wir rufen Sie gleich zurück. Ihr Wasserschaden24-Team 🔧`);
  } else if (eintrag) {
    twiml.message(`Bitte antworten Sie einfach mit JA, damit wir Sie zurückrufen können.`);
  } else {
    twiml.message(`Danke! Für Notfälle besuchen Sie bitte wasserschaden24.online`);
  }
  res.type('text/xml').send(twiml.toString());
});

// ROUTE 4: Rückrufliste
app.get('/rueckrufe', (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Nicht autorisiert' });
  res.json(Array.from(pendingConfirmations.values()));
});

app.get('/', (req, res) => res.send('Wasserschaden24 Server läuft ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
