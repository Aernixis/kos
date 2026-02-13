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
  listMessages: {
    players: null,
    priority: null,
    clans: null
  }
};

/* ===================== LOAD / SAVE ===================== */
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
    if (p.username) data.players.set(p.username, p);
  });

  data.priority = new Set(raw.priority || []);
  data.clans = new Set(raw.clans || []);
  data.submissionChannel = raw.submissionChannel || null;
  data.listMessages = raw.listMessages || data.listMessages;
}
loadData();

/* ===================== HELPERS ===================== */
function canUsePriority(msg) {
  if (msg.author.id === OWNER_ID) return true;
  return msg.member?.roles.cache.has(PRIORITY_ROLE_ID);
}

function deleteTogether(userMsg, botMsg, delay = 3500) {
  setTimeout(() => {
    userMsg.delete().catch(() => {});
    botMsg.delete().catch(() => {});
  }, delay);
}

/* ===================== FORMATTERS ===================== */
function formatPlayers() {
  const rows = [...data.players.values()]
    .filter(p => !data.priority.has(p.username))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => `${p.name} : ${p.username || 'N/A'}`);
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

/* ===================== SECTION UPDATER ===================== */
async function updateSection(channel, key) {
  if (!channel) return;

  const map = {
    players: ['–––––– PLAYERS ––––––', formatPlayers()],
    priority: ['–––––– PRIORITY ––––––', formatPriority()],
    clans: ['–––––– CLANS ––––––', formatClans()]
  };

  const [title, content] = map[key];
  const text = `\`\`\`${title}\n${content}\n\`\`\``;

  let msg = null;
  if (data.listMessages[key]) {
    msg = await channel.messages.fetch(data.listMessages[key]).catch(() => null);
  }

  if (msg) {
    await msg.edit(text);
  } else {
    msg = await channel.send(text);
    data.listMessages[key] = msg.id;
    saveData();
  }
}

/* ===================== LIST CREATOR (SLASH ONLY) ===================== */
async function createFreshList(channel) {
  if (!channel) return;

  await channel.send(`\`\`\`–––––– PLAYERS ––––––\n${formatPlayers()}\n\`\`\``);
  await channel.send(`\`\`\`–––––– PRIORITY ––––––\n${formatPriority()}\n\`\`\``);
  await channel.send(`\`\`\`–––––– CLANS ––––––\n${formatClans()}\n\`\`\``);
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
      `Players: ^ka name username | ^kr username\n` +
      `Clans: ^kca name region | ^kcr name region\n` +
      `Priority: ^p add username | ^p remove username`
    );

  await channel.send({ embeds: [gif] });
  await channel.send({ embeds: [info] });
}

/* ===================== PREFIX COMMANDS ===================== */
client.on('messageCreate', async msg => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith('^')) return;

  const args = msg.content.trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  if (cmd === '^submission') {
    data.submissionChannel = msg.channel.id;
    saveData();
    const m = await msg.channel.send(`KOS commands locked to <#${msg.channel.id}>`);
    return deleteTogether(msg, m);
  }

  if (data.submissionChannel && msg.channel.id !== data.submissionChannel) {
    const m = await msg.channel.send(`Use KOS messages in <#${data.submissionChannel}>.`);
    return deleteTogether(msg, m);
  }

  let reply = null;
  let section = null;

  if (cmd === '^ka') {
    const [name, username] = args;
    if (!username || data.players.has(username)) return;
    data.players.set(username, { name, username });
    reply = `Added ${name} : ${username}`;
    section = 'players';
  }

  if (cmd === '^kr') {
    const username = args[0];
    if (data.players.delete(username)) {
      data.priority.delete(username);
      reply = `Removed ${username}`;
      section = 'players';
    }
  }

  if (cmd === '^kca') {
    const clan = `${args[1].toUpperCase()}»${args[0].toUpperCase()}`;
    if (!data.clans.has(clan)) {
      data.clans.add(clan);
      reply = `Added clan ${clan}`;
      section = 'clans';
    }
  }

  if (cmd === '^kcr') {
    const clan = `${args[1].toUpperCase()}»${args[0].toUpperCase()}`;
    if (data.clans.delete(clan)) {
      reply = `Removed clan ${clan}`;
      section = 'clans';
    }
  }

  if (cmd === '^p' && canUsePriority(msg)) {
    if (args[0] === 'add') {
      data.priority.add(args[1]);
      reply = `Added ${args[1]} to priority`;
      section = 'priority';
    }
    if (args[0] === 'remove') {
      data.priority.delete(args[1]);
      reply = `Removed ${args[1]} from priority`;
      section = 'priority';
    }
  }

  if (!reply) return;

  saveData();
  await updateSection(msg.channel, section);

  const m = await msg.channel.send(`<@${msg.author.id}> ${reply}`);
  deleteTogether(msg, m);
});

/* ===================== SLASH COMMANDS (SAFE) ===================== */
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;

  try {
    if (i.commandName === 'panel') {
      await i.deferReply({ ephemeral: true });
      await updatePanel(i.channel);
      await i.editReply('Panel created.');
    }

    if (i.commandName === 'list') {
      await i.deferReply({ ephemeral: true });
      await createFreshList(i.channel);
      await i.editReply('New KOS list created.');
    }
  } catch (err) {
    console.error('Interaction error:', err);
    if (!i.replied && !i.deferred) {
      i.reply({ content: 'An error occurred.', ephemeral: true }).catch(() => {});
    }
  }
});

/* ===================== LOGIN ===================== */
client.login(process.env.TOKEN);
