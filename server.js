require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Storage } = require('megajs');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;

function randomId(len = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let str = '';
  for (let i = 0; i < len; i++) str += chars[Math.floor(Math.random() * chars.length)];
  return str + Math.floor(Math.random() * 10000);
}

const uploadToMega = async (filePath) => {
  const storage = await new Storage({
    email: process.env.MEGA_EMAIL,
    password: process.env.MEGA_PASSWORD,
  }).ready;

  const up = await storage.upload({
    name: `${randomId()}.json`,
    size: fs.statSync(filePath).size,
  }, fs.createReadStream(filePath)).complete;

  const fileNode = storage.files[up.nodeId];
  return await fileNode.link();
};

const cleanUp = (dir) => fs.rmSync(dir, { recursive: true, force: true });

app.post('/code', async (req, res) => {
  const number = req.body.number?.replace(/[^0-9]/g, '');
  if (!number) return res.status(400).send({ error: 'Missing phone number' });

  const id = randomId();
  const sessionPath = `./session_${id}`;

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
    },
    printQRInTerminal: false,
    logger: pino({ level: "fatal" }),
    browser: Browsers.macOS('Safari'),
  });

  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered) {
    await delay(1500);
    const code = await sock.requestPairingCode(number);
    res.send({ code });

    sock.ev.on("connection.update", async ({ connection }) => {
      if (connection === "open") {
        await delay(7000);

        const filePath = `${sessionPath}/creds.json`;
        if (!fs.existsSync(filePath)) return;

        const megaUrl = await uploadToMega(filePath);
        const sessionId = megaUrl.replace('https://mega.nz/file/', '');

        const message1 = `*✅ Your Session ID:*\n\n${sessionId}`;
        const message2 = `
╭─❍ *Vinnie-MD Session Paired*
├ 📎 Use this ID in your bot repo
├ 🎓 Tutorial: youtube.com/@vinniebot
├ 💬 Support: t.me/vinniebotdevs
├ ⭐ Repo: github.com/vinniebot/vinnie-md
╰─❍ *Enjoy Vinnie MD v5.0.0*
`;

        await sock.sendMessage(sock.user.id, { text: message1 });
        await sock.sendMessage(sock.user.id, { text: message2 });

        await delay(2000);
        await sock.ws.close();
        cleanUp(sessionPath);
      }
    });
  } else {
    res.status(400).send({ error: 'Already registered.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'pair.html'));
});

app.listen(PORT, () => {
  console.log(`Vinnie Pairing Server running on port ${PORT}`);
});
