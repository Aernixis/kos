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
  players: [],        // { name, username, addedBy }
  topPriority: [],    // usernames
  clans: [],          // REGION»NAME
  submissionChannelId: null,
  listData: {         // keeps track of message IDs for sections
    channelId: null,
    playersMessageId: null,
    priorityMessageId: null,
    clansMessageId: null
  },
  panelMessages: {
    gif: null,
    tutorial: null
  },
  revision: 0
};

/* ===================== LOAD / SAVE ===================== */
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return;
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  data = { ...data, ...raw };
}

loadData();

/* ===================== HELPERS ===================== */
function canUsePriority(msg) {
  return msg.author.id === OWNER_ID || msg.member?.roles.cache.has(PRIORITY_ROLE_ID);
}

function rev() {
  data.revision++;
  return '\u200B'.repeat((data.revision % 10) + 1);
}

async function deleteMsg(msg, delay = 3000) {
  setTimeout(() => msg.delete().catch(() => {}), delay);
}

/* ===================== FORMATTERS ===================== */
function formatPlayers() {
  return data.players
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => `${p.name} : ${p.username || 'N/A'}`)
    .join('\n') || 'None';
}

function formatPriority() {
  return data.topPriority
    .map(u => {
      const p = data.players.find(p => p.username === u);
      return p ? `${p.name} : ${p.username}` : u;
    })
    .join('\n') || 'None';
}

function formatClans() {
  return data.clans.sort().join('\n') || 'None';
}

/* ===================== LIST UPDATER ===================== */
let updating = false;

async function updateSection(channel, section) {
  if (!channel || updating) return;
  updating = true;

  const sections = {
    players: formatPlayers(),
    priority: formatPriority(),
    clans: formatClans()
  };

  const messageIdKey = {
    players: 'playersMessageId',
    priority: 'priorityMessageId',
    clans: 'clansMessageId'
  };

  let msg = null;
  const id = data.listData[messageIdKey[section]];
  if (id) msg = await channel.messages.fetch(id).catch(() => null);

  const text = `\`\`\`–––––– ${section.toUpperCase()} ––––––\n${sections[section]}\n\`\`\`${rev()}`;

  if (msg) await msg.edit(text);
  else {
    msg = await channel.send(text);
    data.listData[messageIdKey[section]] = msg.id;
    saveData();
  }

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
      `Players: ^ka <name> <username> | ^kr <name|username>\n` +
      `Clans: ^kca <name> <region> | ^kcr <name> <region>\n` +
      `Priority: ^p add/remove <username> | ^pr <username>`
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

  /* ====== SUBMISSION ====== */
  if (cmd === '^submission') {
    data.submissionChannelId = msg.channel.id;
    saveData();
    const m = await msg.channel.send(`KOS commands locked to <#${msg.channel.id}>`);
    deleteMsg(m, 4000);
    return deleteMsg(msg, 4000);
  }

  if (data.submissionChannelId && msg.channel.id !== data.submissionChannelId) {
    const m = await msg.channel.send(`Use KOS commands in <#${data.submissionChannelId}>.`);
    deleteMsg(m, 4000);
    return deleteMsg(msg, 4000);
  }

  /* ====== ^ka Add Player ====== */
  if (cmd === '^ka') {
    const name = args[0];
    const username = args[1];
    const missing = [];
    if (!name) missing.push('name');
    if (!username) missing.push('username');
    if (missing.length) {
      const m = await msg.channel.send(`<@${msg.author.id}> Missing ${missing.join(' and ')}.`);
      return deleteMsg(m);
    }

    if (data.players.some(p => p.username === username)) {
      const m = await msg.channel.send(`<@${msg.author.id}> Player already in KOS: ${username}`);
      return deleteMsg(m);
    }

    data.players.push({ name, username, addedBy: msg.author.id });
    saveData();
    if (data.listData.playersMessageId) await updateSection(msg.channel, 'players');

    const m = await msg.channel.send(`<@${msg.author.id}> Added ${username}`);
    return deleteMsg(m);
  }

  /* ====== ^kr Remove Player ====== */
  if (cmd === '^kr') {
    const target = args[0];
    if (!target) {
      const m = await msg.channel.send(`<@${msg.author.id}> Missing name and username.`);
      return deleteMsg(m);
    }

    const player = data.players.find(p => p.username === target || p.name === target);
    if (!player) return;

    if (player.addedBy !== msg.author.id && !canUsePriority(msg)) {
      const m = await msg.channel.send(`<@${msg.author.id}> You didn't add this player.`);
      return deleteMsg(m);
    }

    data.players = data.players.filter(p => p !== player);
    data.topPriority = data.topPriority.filter(u => u !== player.username);
    saveData();
    if (data.listData.playersMessageId) await updateSection(msg.channel, 'players');

    const m = await msg.channel.send(`<@${msg.author.id}> Removed ${player.username}`);
    return deleteMsg(m);
  }

  /* ====== ^kca Add Clan ====== */
  if (cmd === '^kca') {
    const name = args[0];
    const region = args[1];
    const missing = [];
    if (!name) missing.push('name');
    if (!region) missing.push('region');
    if (missing.length) {
      const m = await msg.channel.send(`<@${msg.author.id}> Missing ${missing.join(' and ')}.`);
      return deleteMsg(m);
    }

    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (!data.clans.includes(clan)) data.clans.push(clan);
    saveData();
    if (data.listData.clansMessageId) await updateSection(msg.channel, 'clans');

    const m = await msg.channel.send(`<@${msg.author.id}> Added clan ${clan}`);
    return deleteMsg(m);
  }

  /* ====== ^kcr Remove Clan ====== */
  if (cmd === '^kcr') {
    const name = args[0];
    const region = args[1];
    const missing = [];
    if (!name) missing.push('name');
    if (!region) missing.push('region');
    if (missing.length) {
      const m = await msg.channel.send(`<@${msg.author.id}> Missing ${missing.join(' and ')}.`);
      return deleteMsg(m);
    }

    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    const index = data.clans.indexOf(clan);
    if (index !== -1) {
      data.clans.splice(index, 1);
      saveData();
      if (data.listData.clansMessageId) await updateSection(msg.channel, 'clans');

      const m = await msg.channel.send(`<@${msg.author.id}> Removed clan ${clan}`);
      return deleteMsg(m);
    }
  }

  /* ====== ^p Priority ====== */
  if ((cmd === '^p' || cmd === '^pr') && canUsePriority(msg)) {
    const action = args[0];
    const username = args[1] || args[0];

    if (cmd === '^p' && (!action || !username)) {
      const missing = !action ? 'add/remove action' : 'username';
      const m = await msg.channel.send(`<@${msg.author.id}> Missing ${missing}.`);
      return deleteMsg(m);
    }

    if (cmd === '^p') {
      if (action === 'add') {
        if (!data.topPriority.includes(username)) data.topPriority.push(username);
        const m = await msg.channel.send(`<@${msg.author.id}> Added ${username} to priority`);
        saveData();
        if (data.listData.priorityMessageId) await updateSection(msg.channel, 'priority');
        return deleteMsg(m);
      }

      if (action === 'remove') {
        data.topPriority = data.topPriority.filter(u => u !== username);
        const m = await msg.channel.send(`<@${msg.author.id}> Removed ${username} from priority`);
        saveData();
        if (data.listData.priorityMessageId) await updateSection(msg.channel, 'priority');
        return deleteMsg(m);
      }
    }

    if (cmd === '^pr') {
      if (!username) {
        const m = await msg.channel.send(`<@${msg.author.id}> Missing name or username.`);
        return deleteMsg(m);
      }
      if (data.topPriority.includes(username)) {
        data.topPriority = data.topPriority.filter(u => u !== username);
        const m = await msg.channel.send(`<@${msg.author.id}> Removed ${username} from priority`);
        saveData();
        if (data.listData.priorityMessageId) await updateSection(msg.channel, 'priority');
        return deleteMsg(m);
      } else {
        data.topPriority.push(username);
        const m = await msg.channel.send(`<@${msg.author.id}> Added ${username} to priority`);
        saveData();
        if (data.listData.priorityMessageId) await updateSection(msg.channel, 'priority');
        return deleteMsg(m);
      }
    }
  }
});

/* ===================== SLASH COMMANDS ===================== */
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === 'panel') {
    await i.reply({ content: 'Panel updated.', ephemeral: true });
    await updatePanel(i.channel);
  }

  if (i.commandName === 'list') {
    await i.reply({ content: 'KOS list created.', ephemeral: true });
    // Creates new messages for each section
    if (i.channel) {
      await updateSection(i.channel, 'players');
      await updateSection(i.channel, 'priority');
      await updateSection(i.channel, 'clans');
    }
  }
});

/* ===================== LOGIN ===================== */
client.login(process.env.TOKEN);
