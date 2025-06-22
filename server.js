const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(express.static(__dirname));

let sock;
let adminNumber = '';
let haterName = '';
let loaderActive = false;
let waitingForHater = false;
let groupConfig = {};

app.post('/launch', upload.single('credFile'), async (req, res) => {
  const botName = req.body.botName;
  adminNumber = req.body.adminNumber;

  const targetPath = path.join(__dirname, 'cred.json');
  fs.renameSync(req.file.path, targetPath);

  startBot();
  res.send("✅ Bot launched! Now send commands from WhatsApp.");
});

function startBot() {
  const { state, saveState } = useSingleFileAuthState('./cred.json');
  sock = makeWASocket({ auth: state });
  sock.ev.on('creds.update', saveState);

  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'open') console.log("✅ Bot connected.");
    if (update.connection === 'close') {
      console.log("❌ Disconnected.");
      if (update.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        startBot();
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    const senderNumber = msg.key.participant || msg.key.remoteJid;

    const isGroup = sender.endsWith('@g.us');
    const isAdmin = senderNumber.includes(adminNumber);

    if (!isAdmin) return;

    if (messageText.toLowerCase() === '/loader') {
      await sock.sendMessage(sender, { text: "Please enter your hater name:" });
      waitingForHater = true;
    } else if (waitingForHater) {
      haterName = messageText;
      loaderActive = true;
      waitingForHater = false;
      await sock.sendMessage(sender, { text: `🔥 Hater mode: ${haterName}` });
      startSpam(sender);
    } else if (messageText === '/loader off') {
      loaderActive = false;
      await sock.sendMessage(sender, { text: "🛑 Loader stopped." });
    } else if (messageText.startsWith('/groupname ')) {
      const name = messageText.replace('/groupname ', '');
      groupConfig[sender] = groupConfig[sender] || {};
      groupConfig[sender].groupName = name;
      await sock.groupUpdateSubject(sender, name);
    } else if (messageText.startsWith('/nickname ')) {
      const parts = messageText.split(' ');
      const number = parts[1]?.replace('@', '').replace(/\D/g, '') + "@s.whatsapp.net";
      const nickname = parts.slice(2).join(' ');
      if (isGroup && number && nickname) {
        groupConfig[sender] = groupConfig[sender] || { nicknames: {} };
        groupConfig[sender].nicknames[number] = nickname;
        await sock.sendMessage(sender, { text: `✅ Nickname set for ${number}` });
      }
    }
  });

  setInterval(async () => {
    for (const groupId in groupConfig) {
      const conf = groupConfig[groupId];
      if (conf.groupName) {
        const metadata = await sock.groupMetadata(groupId);
        if (metadata.subject !== conf.groupName) {
          await sock.groupUpdateSubject(groupId, conf.groupName);
        }
      }
    }
  }, 10000);
}

function startSpam(jid) {
  const lines = fs.readFileSync('./messages.txt', 'utf-8').split('\n').filter(Boolean);
  let i = 0;
  const interval = setInterval(() => {
    if (!loaderActive || i >= lines.length) {
      clearInterval(interval);
      return;
    }
    sock.sendMessage(jid, { text: `${haterName}: ${lines[i++]}` });
  }, 15000);
}

app.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));