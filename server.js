const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const { delay } = require('@whiskeysockets/baileys/lib/Utils');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { uploadToMega } = require('./src/id');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static('public'));
app.use(express.json());

app.post('/code', async (req, res) => {
  const phone = req.body.phone;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  const sessionPath = `./session/${phone}`;
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    printQRInTerminal: false,
    logger: pino({ level: 'fatal' }),
    browser: Browsers.macOS('Safari'),
  });

  sock.ev.on('creds.update', saveCreds);

  try {
    // Generate fresh pairing code
    if (!sock.authState.creds.registered) {
      await delay(1000); // Short delay before requesting code
      const code = await sock.requestPairingCode(phone);
      console.log(`Pairing code for ${phone}: ${code}`);
      res.json({ code }); // Send pairing code back to frontend

      sock.ev.on('connection.update', async ({ connection }) => {
        console.log('Connection status:', connection);

        if (connection === 'open') {
          await delay(7000); // Wait a bit for session file to be saved

          const filePath = `${sessionPath}/creds.json`;
          if (!fs.existsSync(filePath)) return;

          const megaUrl = await uploadToMega(filePath, `${phone}.json`);
          const sessionId = megaUrl.replace('https://mega.nz/file/', '');

          const message1 = `*✅ Your Session ID:*\n\`\`\`${sessionId}\`\`\``;
          const message2 = `
*Vinnie-MD Session Paired*
🔗 Use this ID in your bot repo

🎓 Tutorial: youtube.com/@vinniebot
💬 Support: t.me/vinniebotdevs
📁 Repo: github.com/vinniebot/vinnie-md
          `;

          console.log('Session ID sent:', sessionId);

          // Clean up after sending
          fs.rmSync(sessionPath, { recursive: true, force: true });

          // Optionally send this to user via a bot/webhook if needed
        }

        if (connection === 'close') {
          console.warn('Connection closed before pairing.');
        }
      });
    } else {
      res.status(400).json({ error: 'Already registered' });
    }
  } catch (err) {
    console.error('Error during pairing:', err);
    res.status(500).json({ error: 'Failed to generate pairing code' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
