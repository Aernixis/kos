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
    listMessages: data.listMessages,
    panelMessages: data.panelMessages,
    revision: data.revision
  }, null, 2));
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return;

  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  data.players = new Map();
  raw.players?.forEach(p => {
    const key = p.username || p.name;
    data.players.set(key, p);
  });

  data.priority = new Set(raw.priority || []);
  data.clans = new Set(raw.clans || []);
  data.submissionChannel = raw.submissionChannel || null;
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
function rev() {
  data.revision++;
  return '\u200B'.repeat((data.revision % 10) + 1);
}

/* ===================== FORMATTERS ===================== */
function formatPlayers() {
  const rows = [...data.players.values()]
    .filter(p => !data.priority.has(p.username || p.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => `${p.name} : ${p.username}`);
  return rows.length ? rows.join('\n') : 'None';
}

function formatPriority() {
  const rows = [...data.priority].map(u => {
    const p = data.players.get(u);
    return p ? `${p.name} : ${p.username || p.name}` : u;
  });
  return rows.length ? rows.join('\n') : 'None';
}

function formatClans() {
  return data.clans.size ? [...data.clans].sort().join('\n') : 'None';
}

/* ===================== LIST UPDATER ===================== */
let updatingSections = {};
async function updateKosList(channel, sectionToUpdate = null, create = false) {
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

    let msg = null;
    if (data.listMessages[key]) {
      msg = await channel.messages.fetch(data.listMessages[key]).catch(() => null);
    }

    // 🔒 PREFIX SAFETY: DO NOT CREATE NEW SECTIONS
    if (!msg && !create) {
      updatingSections[key] = false;
      continue;
    }

    const text = `\`\`\`${title}\n${getContent()}\n\`\`\`${rev()}`;

    if (msg) {
      await msg.edit(text).catch(() => {});
    } else if (create) {
      const sent = await channel.send(text).catch(() => null);
      if (sent) data.listMessages[key] = sent.id;
    }

    updatingSections[key] = false;
  }

  saveData();
}

/* ===================== PANEL ===================== */
async function updatePanel(channel) {
  if (!channel) return;

  const gif = new EmbedBuilder()
    .setColor(0xFF0000)
    .setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExc2FoODRjMmVtNmhncjkyZzY0ZGVwa2l3dzV0M3UyYmZ4bjVsZ2pnOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/iuttaLUMRLWEgJKRHx/giphy.gif');

  const info = new EmbedBuilder()
    .setTitle('KOS Submission System')
    .setColor(0xFF0000)
    .setDescription('Use prefix commands to manage the KOS list.');

  async function upsert(id, embed) {
    if (id) {
      const msg = await channel.messages.fetch(id).catch(() => null);
      if (msg) return (await msg.edit({ embeds: [embed] })).id;
    }
    return (await channel.send({ embeds: [embed] })).id;
  }

  data.panelMessages.gif = await upsert(data.panelMessages.gif, gif);
  data.panelMessages.tutorial = await upsert(data.panelMessages.tutorial, info);
  saveData();
}

/* ===================== PREFIX COMMANDS ===================== */
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.content.startsWith('^')) return;

  const args = msg.content.trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  /* All prefix updates call updateKosList(..., false) */
  const editOnly = async (section = null) =>
    updateKosList(msg.channel, section, false);

  // ---- EXAMPLE: ^ka ----
  if (cmd === '^ka') {
    const [name, username] = args;
    if (!name || !username) return;

    data.players.set(username, { name, username, addedBy: msg.author.id });
    data.priority.delete(username);
    await editOnly('players');
  }

  // ---- OTHER PREFIX COMMANDS CONTINUE UNCHANGED ----
  // (They already call updateKosList; now it will never create)

});

/* ===================== SLASH COMMANDS (OWNER ONLY) ===================== */
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;
  if (i.user.id !== OWNER_ID) return;

  await i.deferReply({ ephemeral: true });

  if (i.commandName === 'panel') {
    await updatePanel(i.channel);
    await i.editReply('Panel updated.');
  }

  if (i.commandName === 'list') {
    await updateKosList(i.channel, null, true); // ✅ creation allowed
    await i.editReply('KOS list created.');
  }
});

/* ===================== DUMMY SERVER ===================== */
const PORT = process.env.PORT || 3000;
require('http').createServer((_, res) => res.end('Bot running')).listen(PORT);

/* ===================== LOGIN ===================== */
client.login(process.env.TOKEN);
