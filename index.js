require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

/* ================= CLIENT ================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

/* ================= CONSTANTS ================= */

const OWNER_ID = '1283217337084018749';
const PRIORITY_ROLE_ID = '1412837397607092405';
const DATA_FILE = './data.json';

/* ================= DATA ================= */

let data = {
  players: new Map(),     // username|null → { name, username }
  priority: new Set(),    // names ONLY
  clans: new Set(),       // REGION»NAME
  submissionChannel: null,
  listMessages: { players: null, priority: null, clans: null }
};

/* ================= LOAD / SAVE ================= */

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    players: [...data.players.values()],
    priority: [...data.priority],
    clans: [...data.clans],
    submissionChannel: data.submissionChannel,
    listMessages: data.listMessages
  }, null, 2));
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return;
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  data.players = new Map();
  raw.players?.forEach(p => {
    data.players.set(p.username ?? p.name, p);
  });

  data.priority = new Set(raw.priority || []);
  data.clans = new Set(raw.clans || []);
  data.submissionChannel = raw.submissionChannel || null;
  data.listMessages = raw.listMessages || data.listMessages;
}

loadData();

/* ================= HELPERS ================= */

function canUsePriority(msg) {
  return msg.author.id === OWNER_ID ||
         msg.member?.roles.cache.has(PRIORITY_ROLE_ID);
}

/* ================= FORMATTERS ================= */

function formatPlayers() {
  const rows = [...data.players.values()]
    .filter(p => !data.priority.has(p.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => `${p.name} : ${p.username ?? 'N/A'}`);
  return rows.length ? rows.join('\n') : 'None';
}

function formatPriority() {
  const rows = [...data.priority].sort();
  return rows.length ? rows.join('\n') : 'None';
}

function formatClans() {
  return data.clans.size ? [...data.clans].sort().join('\n') : 'None';
}

/* ================= SECTION UPDATER ================= */

async function updateSection(channel, section) {
  if (!channel) return;

  const map = {
    players: ['–––––– PLAYERS ––––––', formatPlayers()],
    priority: ['–––––– TOP PRIORITY ––––––', formatPriority()],
    clans: ['–––––– CLANS ––––––', formatClans()]
  };

  const [title, content] = map[section];
  const text = `\`\`\`\n${title}\n\n${content}\n\`\`\``;

  let msg = null;
  const id = data.listMessages[section];
  if (id) msg = await channel.messages.fetch(id).catch(() => null);

  if (msg) {
    await msg.edit(text);
  } else {
    msg = await channel.send(text);
    data.listMessages[section] = msg.id;
  }

  saveData();
}

/* ================= PREFIX COMMANDS ================= */

client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.content.startsWith('^')) return;

  const args = msg.content.trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  if (cmd === '^submission') {
    data.submissionChannel = msg.channel.id;
    saveData();
    const botMsg = await msg.channel.send(`KOS commands locked to <#${msg.channel.id}>`);
    setTimeout(() => {
      botMsg.delete().catch(()=>{});
      msg.delete().catch(()=>{});
    }, 3000);
    return;
  }

  if (data.submissionChannel && msg.channel.id !== data.submissionChannel) {
    const botMsg = await msg.channel.send(`Use KOS messages in <#${data.submissionChannel}>.`);
    setTimeout(() => {
      botMsg.delete().catch(()=>{});
      msg.delete().catch(()=>{});
    }, 3000);
    return;
  }

  let section = null;
  let reply = '';

  /* PLAYER ADD */
  if (cmd === '^ka') {
    const [name, username] = args;
    data.players.set(username ?? name, { name, username: username ?? null });
    section = 'players';
    reply = `Added ${name}`;
  }

  /* PLAYER REMOVE */
  if (cmd === '^kr') {
    const username = args[1];
    data.players.delete(username);
    section = 'players';
    reply = `Removed ${username}`;
  }

  /* PRIORITY */
  if (cmd === '^p' && canUsePriority(msg)) {
    if (args[0] === 'add') {
      data.priority.add(args[1]);
      section = 'priority';
      reply = `Added ${args[1]} to priority`;
    }
    if (args[0] === 'remove') {
      data.priority.delete(args[1]);
      section = 'priority';
      reply = `Removed ${args[1]} from priority`;
    }
  }

  /* CLANS */
  if (cmd === '^kca') {
    const clan = `${args[1].toUpperCase()}»${args[0].toUpperCase()}`;
    data.clans.add(clan);
    section = 'clans';
    reply = `Added clan ${clan}`;
  }

  if (cmd === '^kcr') {
    const clan = `${args[1].toUpperCase()}»${args[0].toUpperCase()}`;
    data.clans.delete(clan);
    section = 'clans';
    reply = `Removed clan ${clan}`;
  }

  if (!section) return;

  saveData();
  await updateSection(msg.channel, section);

  const botMsg = await msg.channel.send(`<@${msg.author.id}> ${reply}`);
  setTimeout(() => {
    botMsg.delete().catch(()=>{});
    msg.delete().catch(()=>{});
  }, 3000);
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);
