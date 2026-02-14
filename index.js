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
  raw.players?.forEach(p => data.players.set(p.username || p.name, p));

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

function respond(msg, text, timeout = 3000) {
  msg.edit(`**${text}**`).catch(() => {});
  setTimeout(() => msg.delete().catch(() => {}), timeout);
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
  const rows = [...data.priority].map(k => {
    const p = data.players.get(k);
    return p ? `${p.name} : ${p.username}` : k;
  });
  return rows.length ? rows.join('\n') : 'None';
}

function formatClans() {
  return data.clans.size ? [...data.clans].sort().join('\n') : 'None';
}

/* ===================== LIST UPDATER ===================== */
async function updateKosList(channel, only = null) {
  if (!channel) return;

  const sections = [
    ['players', '–––––– PLAYERS ––––––', formatPlayers],
    ['priority', '–––––– PRIORITY ––––––', formatPriority],
    ['clans', '–––––– CLANS ––––––', formatClans]
  ];

  for (const [key, title, get] of sections) {
    if (only && key !== only) continue;

    const content = `\`\`\`${title}\n${get()}\n\`\`\`${rev()}`;
    let msg = data.listMessages[key]
      ? await channel.messages.fetch(data.listMessages[key]).catch(() => null)
      : null;

    if (msg) await msg.edit(content).catch(() => {});
    else {
      msg = await channel.send(content);
      data.listMessages[key] = msg.id;
    }
  }
  saveData();
}

/* ===================== PREFIX COMMANDS ===================== */
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.content.startsWith('^')) return;

  const args = msg.content.trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  if (data.submissionChannel && msg.channel.id !== data.submissionChannel)
    return respond(msg, `Use KOS commands in <#${data.submissionChannel}>`);

  /* ---------- ^ka ---------- */
  if (cmd === '^ka') {
    const [name, username] = args;
    if (!name || !username) return respond(msg, 'Missing name and username.');

    if (data.players.has(username))
      return respond(msg, `Player already exists: ${username}`);

    data.players.set(username, { name, username, addedBy: msg.author.id });
    data.priority.delete(username);

    await updateKosList(msg.channel, 'players');
    return respond(msg, `Added ${username}`);
  }

  /* ---------- ^kr ---------- */
  if (cmd === '^kr') {
    const [id] = args;
    if (!id) return respond(msg, 'Missing name.');

    const p = data.players.get(id) || [...data.players.values()]
      .find(x => x.name.toLowerCase() === id.toLowerCase());

    if (!p) return respond(msg, 'Player not found.');

    data.players.delete(p.username || p.name);
    data.priority.delete(p.username || p.name);

    await updateKosList(msg.channel);
    return respond(msg, `Removed ${p.username || p.name}`);
  }

  /* ---------- ^kca ---------- */
  if (cmd === '^kca') {
    const [name, region] = args;
    if (!name || !region) return respond(msg, 'Missing name and region.');

    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (data.clans.has(clan)) return respond(msg, 'Clan already exists.');

    data.clans.add(clan);
    await updateKosList(msg.channel, 'clans');
    return respond(msg, `Added clan ${clan}`);
  }

  /* ---------- ^kcr ---------- */
  if (cmd === '^kcr') {
    const [name, region] = args;
    if (!name || !region) return respond(msg, 'Missing name and region.');

    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (!data.clans.delete(clan)) return respond(msg, 'Clan not found.');

    await updateKosList(msg.channel, 'clans');
    return respond(msg, `Removed clan ${clan}`);
  }

  /* ---------- PRIORITY ---------- */
  if (['^p', '^pr', '^pa'].includes(cmd)) {
    if (!canUsePriority(msg)) return respond(msg, 'No permission.');

    const [name, username] = args;
    if (!name) return respond(msg, 'Missing name.');

    const key = username || name;

    if (cmd === '^pa') {
      if (data.players.has(key)) return respond(msg, 'Player already exists.');

      data.players.set(key, { name, username, addedBy: msg.author.id });
      data.priority.add(key);
      await updateKosList(msg.channel);
      return respond(msg, `Added ${key} to priority`);
    }

    const p = data.players.get(key) || [...data.players.values()]
      .find(x => x.name.toLowerCase() === key.toLowerCase());

    if (!p) return respond(msg, 'Player not found.');

    if (cmd === '^p') {
      data.priority.add(p.username || p.name);
      await updateKosList(msg.channel, 'priority');
      return respond(msg, `Promoted ${p.username}`);
    }

    if (cmd === '^pr') {
      data.priority.delete(p.username || p.name);
      await updateKosList(msg.channel, 'priority');
      return respond(msg, `Removed ${p.username}`);
    }
  }
});

/* ===================== SLASH COMMANDS ===================== */
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand() || i.user.id !== OWNER_ID) return;
  await i.deferReply({ ephemeral: true });

  if (i.commandName === 'panel') {
    await updatePanel(i.channel);
    return i.editReply('Panel updated.');
  }
  if (i.commandName === 'list') {
    await updateKosList(i.channel);
    return i.editReply('KOS list created.');
  }
  if (i.commandName === 'submission') {
    data.submissionChannel = i.channel.id;
    saveData();
    return i.editReply(`Commands locked to <#${i.channel.id}>`);
  }
});

/* ===================== DUMMY SERVER ===================== */
const PORT = process.env.PORT || 3000;
require('http').createServer((_, res) => res.end('Running')).listen(PORT);

/* ===================== LOGIN ===================== */
client.login(process.env.TOKEN);
