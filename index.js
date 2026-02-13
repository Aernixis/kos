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
    topPriority: [...data.priority],
    clans: [...data.clans],
    submissionChannelId: data.submissionChannel,
    messages: data.listMessages,
    panelMessages: data.panelMessages,
    revision: data.revision
  }, null, 2));
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return;

  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  // Load players, keep original usernames (even missing)
  data.players = new Map();
  if (raw.players) {
    raw.players.forEach(p => {
      data.players.set(p.username || p.name, { ...p });
    });
  }

  // Load priority, only keep usernames that exist in players
  data.priority = new Set((raw.topPriority || []).filter(u => data.players.has(u)));

  // Load clans
  data.clans = new Set(raw.clans || []);

  data.submissionChannel = raw.submissionChannelId || null;
  data.listMessages = raw.messages || data.listMessages;
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
    .filter(p => !data.priority.has(p.username)) 
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => `${p.name} : ${p.username || 'N/A'}`);
  return rows.length ? rows.join('\n') : 'None';
}

function formatPriority() {
  const rows = [...data.priority].map(u => {
    const p = data.players.get(u);
    if (!p || !p.username) return null; // skip missing usernames
    return `${p.name} : ${p.username}`;
  }).filter(Boolean);
  return rows.length ? rows.join('\n') : 'None';
}

function formatClans() {
  return data.clans.size ? [...data.clans].sort().join('\n') : 'None';
}

/* ===================== LIST UPDATER ===================== */
let updatingSections = {};
async function updateKosList(channel, sectionToUpdate = null) {
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
    if (data.listMessages[key]) msg = await channel.messages.fetch(data.listMessages[key]).catch(() => null);

    if (msg) await msg.edit(text).catch(() => {});
    else {
      msg = await channel.send(text).catch(() => {});
      if (msg) data.listMessages[key] = msg.id;
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
    .setDescription(
      `Players ^ka <name> <username> ^kr <name>\n` +
      `Clans ^kca <name> <region> ^kcr <name> <region>\n` +
      `Priority ^p <name> ^pa <name> <username> ^pr <name>`
    );

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
  if (msg.author.bot) return;
  if (!msg.content.startsWith('^')) return;
  if (msg._handled) return;
  msg._handled = true;

  const args = msg.content.trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  async function tempReply(content, timeout = 3000) {
    const m = await msg.channel.send(`<@${msg.author.id}> ${content}`);
    setTimeout(() => {
      m.delete().catch(() => {});
      msg.delete().catch(() => {});
    }, timeout);
  }

  // ---------- Submission lock ----------
  if (cmd === '^submission') {
    data.submissionChannel = msg.channel.id;
    saveData();
    return tempReply(`KOS commands locked to <#${msg.channel.id}>`, 4000);
  }
  if (data.submissionChannel && msg.channel.id !== data.submissionChannel) {
    return tempReply(`Use KOS commands in <#${data.submissionChannel}>.`, 4000);
  }

  // ---------- ^ka ----------
  if (cmd === '^ka') {
    const [name, username] = args;
    if (!name || !username) return tempReply('Missing name.');
    if (data.players.has(username)) return tempReply(`Player already in KOS: ${username}`);
    data.players.set(username, { name, username, addedBy: msg.author.id });
    data.priority.delete(username);
    await updateKosList(msg.channel, 'players');
    return tempReply(`Added ${username}`);
  }

  // ---------- ^kr ----------
  if (cmd === '^kr') {
    const [identifier] = args;
    if (!identifier) return tempReply('Missing name.');
    const player = data.players.get(identifier) || [...data.players.values()].find(p => p.name.toLowerCase() === identifier.toLowerCase());
    if (!player) return tempReply('Missing name.');
    if (player.addedBy !== msg.author.id && msg.author.id !== OWNER_ID && !canUsePriority(msg)) {
      return tempReply("You didn't add this player.");
    }
    data.players.delete(player.username || player.name);
    data.priority.delete(player.username || player.name);
    await updateKosList(msg.channel, 'players');
    await updateKosList(msg.channel, 'priority');
    return tempReply(`Removed ${player.username || player.name}`);
  }

  // ---------- ^kca ----------
  if (cmd === '^kca') {
    const [name, region] = args;
    if (!name || !region) return tempReply('Missing name and region.');
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (data.clans.has(clan)) return tempReply(`Clan already exists: ${clan}`);
    data.clans.add(clan);
    await updateKosList(msg.channel, 'clans');
    return tempReply(`Added clan ${clan}`);
  }

  // ---------- ^kcr ----------
  if (cmd === '^kcr') {
    const [name, region] = args;
    if (!name || !region) return tempReply('Missing name and region.');
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (data.clans.delete(clan)) {
      await updateKosList(msg.channel, 'clans');
      return tempReply(`Removed clan ${clan}`);
    }
  }

  // ---------- Priority commands ----------
  if (['^p','^pr','^pa'].includes(cmd)) {
    if (!canUsePriority(msg)) return tempReply('You cannot use priority commands.');

    if (cmd === '^pa') {
      const [name, username] = args;
      if (!name || !username) return tempReply('Missing name.');
      if (data.players.has(username)) return tempReply(`Player already exists: ${username}`);
      data.players.set(username, { name, username, addedBy: msg.author.id });
      data.priority.add(username);
      await updateKosList(msg.channel, 'players');
      await updateKosList(msg.channel, 'priority');
      return tempReply(`Added ${username} directly to priority`);
    }

    const [identifier] = args;
    if (!identifier) return tempReply('Missing name.');
    const player = data.players.get(identifier) || [...data.players.values()].find(p => p.name.toLowerCase() === identifier.toLowerCase());
    if (!player) return tempReply('Missing name.');
    if (!player.username) return tempReply('Missing name.'); // Ensure no N/A in priority

    if (cmd === '^p') {
      data.priority.add(player.username);
      await updateKosList(msg.channel, 'priority');
      return tempReply(`Promoted ${player.username} to priority`);
    } else if (cmd === '^pr') {
      data.priority.delete(player.username);
      await updateKosList(msg.channel, 'priority');
      return tempReply(`Removed ${player.username} from priority`);
    }
  }
});

/* ===================== SLASH COMMANDS ===================== */
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;
  if (i.user.id !== OWNER_ID) return i.reply({ content: 'Only owner can use this.', ephemeral: true });

  await i.deferReply({ ephemeral: true });
  if (i.commandName === 'panel') {
    await updatePanel(i.channel);
    await i.editReply({ content: 'Panel updated.' });
  }
  if (i.commandName === 'list') {
    await updateKosList(i.channel);
    await i.editReply({ content: 'KOS list created.' });
  }
});

/* ===================== DUMMY SERVER FOR RENDER ===================== */
const PORT = process.env.PORT || 3000;
require('http').createServer((req, res) => res.end('Bot running')).listen(PORT);

/* ===================== LOGIN ===================== */
client.login(process.env.TOKEN);
