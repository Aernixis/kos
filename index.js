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
  players: [], // {name, username, addedBy}
  topPriority: [], // usernames
  clans: [], // "REGION»NAME"
  submissionChannelId: null,
  listData: {
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
  data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
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
  const rows = data.players
    .filter(p => !data.topPriority.includes(p.username))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => `${p.name} : ${p.username || 'N/A'}`);
  return rows.length ? rows.join('\n') : 'None';
}

function formatPriority() {
  return data.topPriority.length ? data.topPriority.join('\n') : 'None';
}

function formatClans() {
  return data.clans.length ? data.clans.sort().join('\n') : 'None';
}

/* ===================== LIST UPDATER ===================== */
async function updateSection(channel, section) {
  if (!channel) return;

  let content = '';
  let messageId = null;

  switch (section) {
    case 'players':
      content = `\`\`\`–––––– PLAYERS ––––––\n${formatPlayers()}\n\`\`\`${rev()}`;
      messageId = data.listData.playersMessageId;
      break;
    case 'topPriority':
      content = `\`\`\`–––––– PRIORITY ––––––\n${formatPriority()}\n\`\`\`${rev()}`;
      messageId = data.listData.priorityMessageId;
      break;
    case 'clans':
      content = `\`\`\`–––––– CLANS ––––––\n${formatClans()}\n\`\`\`${rev()}`;
      messageId = data.listData.clansMessageId;
      break;
    default:
      return;
  }

  let msg = null;
  if (messageId) msg = await channel.messages.fetch(messageId).catch(() => null);

  if (msg) {
    await msg.edit(content);
  } else {
    msg = await channel.send(content);
    if (section === 'players') data.listData.playersMessageId = msg.id;
    if (section === 'topPriority') data.listData.priorityMessageId = msg.id;
    if (section === 'clans') data.listData.clansMessageId = msg.id;
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
    .setDescription(`Players ^ka name username ^kr name username
Clans ^kca name region ^kcr name region
Priority ^p add username ^p remove username`);

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

  const deleteMsg = (m) => setTimeout(() => m?.delete().catch(() => {}), 3000);
  deleteMsg(msg);

  if (cmd === '^submission') {
    data.submissionChannelId = msg.channel.id;
    saveData();
    const m = await msg.channel.send(`KOS commands locked to <#${msg.channel.id}>`);
    return deleteMsg(m);
  }

  if (data.submissionChannelId && msg.channel.id !== data.submissionChannelId) {
    const m = await msg.channel.send(`Use KOS messages in <#${data.submissionChannelId}>.`);
    return deleteMsg(m);
  }

  /* ===================== ADD PLAYER ^ka ===================== */
  if (cmd === '^ka') {
    if (args.length < 2) {
      const m = await msg.channel.send(`<@${msg.author.id}> Usage: ^ka <name> <username>`);
      return deleteMsg(m);
    }

    const replies = [];
    for (let i = 0; i < args.length; i += 2) {
      const name = args[i];
      const username = args[i + 1];
      if (!name || !username) continue;

      const exists = data.players.some(p => p.username === username);
      if (exists) {
        replies.push(`Player already in KOS: ${username}`);
        continue;
      }

      data.players.push({ name, username, addedBy: msg.author.id });
      replies.push(`Added ${username}`);
    }

    saveData();
    if (data.listData.playersMessageId) await updateSection(msg.channel, 'players');

    if (replies.length) {
      const m = await msg.channel.send(`<@${msg.author.id}> ${replies.join('\n')}`);
      deleteMsg(m);
    }
    return;
  }

  /* ===================== REMOVE PLAYER ^kr ===================== */
  if (cmd === '^kr') {
    if (args.length < 1) return;

    const usernameOrName = args[1] || args[0];
    const player = data.players.find(p => p.username === usernameOrName || p.name === usernameOrName);
    if (!player) return;

    // Safety: only remover if they added the player or are owner/priority
    if (player.addedBy !== msg.author.id && !canUsePriority(msg)) {
      const m = await msg.channel.send(`<@${msg.author.id}> You didn't add this player.`);
      return deleteMsg(m);
    }

    data.players = data.players.filter(p => p !== player);
    data.topPriority = data.topPriority.filter(u => u !== player.username);

    saveData();
    if (data.listData.playersMessageId) await updateSection(msg.channel, 'players');

    const m = await msg.channel.send(`<@${msg.author.id}> Removed ${player.username || player.name}`);
    return deleteMsg(m);
  }

  /* ===================== PRIORITY ^p ===================== */
  if (cmd === '^p' && canUsePriority(msg)) {
    const replies = [];
    if (args[0] === 'add' && args[1]) {
      if (!data.topPriority.includes(args[1])) data.topPriority.push(args[1]);
      replies.push(`Added ${args[1]} to priority`);
    }

    if (args[0] === 'remove' && args[1]) {
      data.topPriority = data.topPriority.filter(u => u !== args[1]);
      replies.push(`Removed ${args[1]} from priority`);
    }

    if (!replies.length) return;

    saveData();
    if (data.listData.priorityMessageId) await updateSection(msg.channel, 'topPriority');

    const m = await msg.channel.send(`<@${msg.author.id}> ${replies.join('\n')}`);
    return deleteMsg(m);
  }

  /* ===================== CLANS ^kca / ^kcr ===================== */
  if (cmd === '^kca' && args.length >= 2) {
    const [name, region] = args;
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (!data.clans.includes(clan)) {
      data.clans.push(clan);
      saveData();
      if (data.listData.clansMessageId) await updateSection(msg.channel, 'clans');
      const m = await msg.channel.send(`<@${msg.author.id}> Added clan ${clan}`);
      return deleteMsg(m);
    }
  }

  if (cmd === '^kcr' && args.length >= 2) {
    const [name, region] = args;
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
});

/* ===================== SLASH COMMANDS ===================== */
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === 'panel') {
    if (i.user.id !== OWNER_ID) return i.reply({ content: 'Unauthorized.', ephemeral: true });
    await i.reply({ content: 'Panel updated.', ephemeral: true });
    await updatePanel(i.channel);
  }

  if (i.commandName === 'list') {
    if (i.user.id !== OWNER_ID) return i.reply({ content: 'Unauthorized.', ephemeral: true });
    await i.reply({ content: 'KOS list created.', ephemeral: true });
    await updateSection(i.channel, 'players');
    await updateSection(i.channel, 'topPriority');
    await updateSection(i.channel, 'clans');
  }
});

/* ===================== LOGIN ===================== */
client.login(process.env.TOKEN);
