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

/* ===================== DATA (MATHEMATICALLY SAFE) ===================== */

let data = {
  players: new Map(),     // username → { name, username, addedBy }
  priority: new Set(),    // username
  clans: new Set(),       // REGION»NAME
  submissionChannel: null,

  listMessages: {
    players: null,
    priority: null,
    clans: null
  },

  panelMessages: {
    gif: null,
    tutorial: null
  },

  revision: 0             // forces visual refresh
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
    if (p.username) data.players.set(p.username, p);
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
    .filter(p => !data.priority.has(p.username))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => `${p.name} : ${p.username}`);
  return rows.length ? rows.join('\n') : 'None';
}

function formatPriority() {
  const rows = [...data.priority]
    .map(u => data.players.get(u))
    .filter(Boolean)
    .map(p => `${p.name} : ${p.username}`);
  return rows.length ? rows.join('\n') : 'None';
}

function formatClans() {
  return data.clans.size ? [...data.clans].sort().join('\n') : 'None';
}

/* ===================== LIST UPDATER (FORCED VISUAL REFRESH) ===================== */

let updating = false;

async function updateKosList(channel) {
  if (!channel || updating) return;
  updating = true;

  const sections = [
    ['players', '–––––– PLAYERS ––––––', formatPlayers()],
    ['priority', '–––––– PRIORITY ––––––', formatPriority()],
    ['clans', '–––––– CLANS ––––––', formatClans()]
  ];

  for (const [key, title, content] of sections) {
    const text = `\`\`\`${title}\n${content}\n\`\`\`${rev()}`;
    let msg = null;

    if (data.listMessages[key]) {
      msg = await channel.messages.fetch(data.listMessages[key]).catch(() => null);
    }

    if (msg) {
      await msg.edit(text);
    } else {
      msg = await channel.send(text);
      data.listMessages[key] = msg.id;
    }
  }

  saveData();
  updating = false;
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
`Players
^ka name username
^kr name username

Clans
^kca name region
^kcr name region

Priority
^p add username
^p remove username`
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

  /* SUBMISSION */
  if (cmd === '^submission') {
    data.submissionChannel = msg.channel.id;
    saveData();
    const m = await msg.channel.send(`KOS commands locked to <#${msg.channel.id}>`);
    setTimeout(() => m.delete().catch(()=>{}), 4000);
    return msg.delete().catch(()=>{});
  }

  if (data.submissionChannel && msg.channel.id !== data.submissionChannel) {
    const m = await msg.channel.send(`Use KOS messages in <#${data.submissionChannel}>.`);
    setTimeout(() => m.delete().catch(()=>{}), 4000);
    return msg.delete().catch(()=>{});
  }

  let changed = false;
  let reply = '';

  if (cmd === '^ka') {
    const [name, username] = args;
    if (!data.players.has(username)) {
      data.players.set(username, { name, username, addedBy: msg.author.id });
      changed = true;
      reply = `Added ${name} : ${username}`;
    }
  }

  if (cmd === '^kr') {
    const username = args[1];
    if (data.players.delete(username)) {
      data.priority.delete(username);
      changed = true;
      reply = `Removed ${username}`;
    }
  }

  if (cmd === '^kca') {
    const clan = `${args[1].toUpperCase()}»${args[0].toUpperCase()}`;
    if (!data.clans.has(clan)) {
      data.clans.add(clan);
      changed = true;
      reply = `Added clan ${clan}`;
    }
  }

  if (cmd === '^kcr') {
    const clan = `${args[1].toUpperCase()}»${args[0].toUpperCase()}`;
    if (data.clans.delete(clan)) {
      changed = true;
      reply = `Removed clan ${clan}`;
    }
  }

  if (cmd === '^p' && canUsePriority(msg)) {
    if (args[0] === 'add') {
      data.priority.add(args[1]);
      changed = true;
      reply = `Added ${args[1]} to priority`;
    }
    if (args[0] === 'remove') {
      data.priority.delete(args[1]);
      changed = true;
      reply = `Removed ${args[1]} from priority`;
    }
  }

  if (!changed) return;

  saveData();
  updateKosList(msg.channel);

  const m = await msg.channel.send(`<@${msg.author.id}> ${reply}`);
  setTimeout(() => m.delete().catch(()=>{}), 3000);
  msg.delete().catch(()=>{});
});

/* ===================== SLASH COMMANDS ===================== */

client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === 'panel') {
    await i.reply({ content: 'Panel updated.', ephemeral: true });
    await updatePanel(i.channel);
  }

  if (i.commandName === 'list') {
    await i.reply({ content: 'KOS list updated.', ephemeral: true });
    await updateKosList(i.channel);
  }
});

/* ===================== LOGIN ===================== */

client.login(process.env.TOKEN);
