require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

/* ===================== CLIENT ===================== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

/* ===================== CONSTANTS ===================== */
const OWNER_ID = '1283217337084018749';
const PRIORITY_ROLE_ID = '1412837397607092405';
const DATA_FILE = './data.json';

/* ===================== DATA ===================== */
let data = {
  players: new Map(),
  priority: new Set(),
  clans: new Set(),
  submissionChannel: null,
  listChannel: null, // ✅ ADDED (where list lives)
  listMessages: { players: null, priority: null, clans: null },
  panelMessages: { gif: null, tutorial: null },
  revision: 0
};

/* ===================== LOAD / SAVE ===================== */
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    players: [...data.players.values()],
    priority: [...data.priority],
    clans: [...data.clans],
    submissionChannel: data.submissionChannel,
    listChannel: data.listChannel, // ✅ SAVED
    listMessages: data.listMessages,
    panelMessages: data.panelMessages,
    revision: data.revision
  }, null, 2));
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return;

  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  data.players = new Map();
  if (raw.players) {
    raw.players.forEach(p => {
      const key = p.username || p.name;
      data.players.set(key, p);
    });
  }

  data.priority = new Set(raw.priority || []);
  data.clans = new Set(raw.clans || []);

  data.submissionChannel = raw.submissionChannel || null;
  data.listChannel = raw.listChannel || null; // ✅ LOADED
  data.listMessages = raw.listMessages || data.listMessages;
  data.panelMessages = raw.panelMessages || data.panelMessages;
  data.revision = raw.revision || 0;
}
loadData();

/* ===================== HELPERS ===================== */
function canUsePriority(msg) {
  if (msg.author.id === OWNER_ID) return true;
  return msg.member?.roles.cache.has(PRIORITY_ROLE_ID);
}
function rev() { data.revision++; return '\u200B'.repeat((data.revision % 10) + 1); }

/* ===================== FORMATTERS ===================== */
function formatPlayers() {
  const rows = [...data.players.values()]
    .filter(p => !data.priority.has(p.username || p.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => `${p.name} : ${p.username || 'N/A'}`);
  return rows.length ? rows.join('\n') : 'None';
}

function formatPriority() {
  const rows = [...data.priority].map(u => {
    const p = data.players.get(u);
    return p ? `${p.name} : ${p.username}` : u;
  });
  return rows.length ? rows.join('\n') : 'None';
}

function formatClans() {
  return data.clans.size ? [...data.clans].sort().join('\n') : 'None';
}

/* ===================== LIST UPDATER ===================== */
let updatingSections = {};
async function updateKosList(sectionToUpdate = null) {
  if (!data.listChannel) return;

  const channel = await client.channels.fetch(data.listChannel).catch(() => null);
  if (!channel) return;

  const sections = [
    ['players', '–––––– PLAYERS ––––––', formatPlayers],
    ['priority', '–––––– PRIORITY ––––––', formatPriority],
    ['clans', '–––––– CLANS ––––––', formatClans]
  ];

  for (const [key, title, getContent] of sections) {
    if (sectionToUpdate && key !== sectionToUpdate) continue;
    if (updatingSections[key]) continue;
    updatingSections[key] = true;

    const text = `\`\`\`${title}\n${getContent()}\n\`\`\`${rev()}`;
    let msg = null;

    if (data.listMessages[key]) {
      msg = await channel.messages.fetch(data.listMessages[key]).catch(() => null);
    }

    if (msg) await msg.edit(text).catch(() => {});
    else {
      msg = await channel.send(text).catch(() => {});
      if (msg) data.listMessages[key] = msg.id;
    }

    updatingSections[key] = false;
  }
  saveData();
}

/* ===================== PREFIX COMMANDS ===================== */
client.on('messageCreate', async msg => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith('^')) return;

  const args = msg.content.trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  if (data.submissionChannel && msg.channel.id !== data.submissionChannel) return;

  if (cmd === '^ka') {
    const [name, username] = args;
    if (!name || !username) return;

    data.players.set(username, { name, username, addedBy: msg.author.id });
    data.priority.delete(username);
    await updateKosList('players');
  }

  if (cmd === '^kr') {
    const [id] = args;
    data.players.delete(id);
    data.priority.delete(id);
    await updateKosList();
  }

  if (cmd === '^kca') {
    const [name, region] = args;
    data.clans.add(`${region.toUpperCase()}»${name.toUpperCase()}`);
    await updateKosList('clans');
  }

  if (cmd === '^kcr') {
    const [name, region] = args;
    data.clans.delete(`${region.toUpperCase()}»${name.toUpperCase()}`);
    await updateKosList('clans');
  }

  if (['^p','^pr','^pa'].includes(cmd) && canUsePriority(msg)) {
    const [id] = args;
    if (cmd === '^pr') data.priority.delete(id);
    else data.priority.add(id);
    await updateKosList('priority');
  }
});

/* ===================== SLASH COMMANDS ===================== */
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;
  if (i.user.id !== OWNER_ID) return;

  await i.deferReply({ ephemeral: true });

  if (i.commandName === 'list') {
    data.listChannel = i.channel.id; // ✅ STORE LIST CHANNEL
    await updateKosList();
    await i.editReply({ content: 'KOS list created.' });
  }
});

/* ===================== DUMMY SERVER ===================== */
const PORT = process.env.PORT || 3000;
require('http').createServer((req, res) => res.end('Bot running')).listen(PORT);

/* ===================== LOGIN ===================== */
client.login(process.env.TOKEN);
