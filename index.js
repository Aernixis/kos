require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

// ---------------- CLIENT ----------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ---------------- CONSTANTS ----------------
const OWNER_ID = '1283217337084018749';
const PRIORITY_ROLE_ID = '1412837397607092405';
const DATA_FILE = './data.json';

// ---------------- DATA ----------------
let data = {
  players: [],
  priority: [],
  clans: [],
  panelMessages: { gif: null, tutorial: null },
  listData: { channelId: null, playersMessageId: null, priorityMessageId: null, clansMessageId: null }
};

// ---------------- LOAD DATA ----------------
function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const oldData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (Array.isArray(oldData.players)) {
        data.players = oldData.players.map(p => ({
          name: String(p.name || p).trim(),
          username: p.username ? String(p.username).trim() : null,
          addedBy: p.addedBy || null
        }));
      }
      if (Array.isArray(oldData.topPriority) && oldData.topPriority.length) {
        data.priority = [...new Set(oldData.topPriority.map(p => String(p).trim()))];
      } else if (Array.isArray(oldData.priority)) {
        data.priority = [...new Set(oldData.priority.map(p => String(p).trim()))];
      }
      if (Array.isArray(oldData.clans)) {
        data.clans = [...new Set(oldData.clans.map(c => {
          if (typeof c === 'string') return c.trim();
          if (c?.name && c?.region) return `${c.region}»${c.name}`.toUpperCase();
          if (c?.clan) return c.clan.trim().toUpperCase();
          return null;
        }).filter(Boolean))];
      }
      if (oldData.panelMessages) data.panelMessages = oldData.panelMessages;
      if (oldData.listData) data.listData = oldData.listData;
    } catch (err) {
      console.error('Failed to load data.json', err);
    }
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ---------------- HELPERS ----------------
function canUsePriority(msg) {
  if (msg.author.id === OWNER_ID) return true;
  return msg.member?.roles.cache.has(PRIORITY_ROLE_ID);
}

function formatPlayers() {
  return data.players
    .filter(p => !data.priority.includes(p.name))
    .sort((a,b)=>a.name.localeCompare(b.name))
    .map(p => p.username ? `${p.name} : ${p.username}` : p.name)
    .join('\n') || 'None';
}

function formatPriority() {
  return data.priority
    .map(n => data.players.find(p => p.name === n)?.name || n)
    .sort()
    .join('\n') || 'None';
}

function formatClans() {
  return data.clans.length ? data.clans.sort().join('\n') : 'None';
}

// ---------------- KOS LIST ----------------
let listUpdating = false;
let listUpdateQueue = Promise.resolve();

async function updateKosList(channel) {
  if (!channel) return;
  listUpdateQueue = listUpdateQueue.then(async () => {
    if (listUpdating) return;
    listUpdating = true;

    async function fetchOrSend(id, content) {
      try {
        if (id) {
          const msg = await channel.messages.fetch(id).catch(()=>null);
          if (msg) return (await msg.edit({ content }))?.id;
        }
      } catch {}
      const msg = await channel.send({ content });
      return msg.id;
    }

    data.listData.playersMessageId = await fetchOrSend(
      data.listData.playersMessageId,
      '```–––––– PLAYERS ––––––\n' + formatPlayers() + '\n```'
    );

    data.listData.priorityMessageId = await fetchOrSend(
      data.listData.priorityMessageId,
      '```–––––– PRIORITY ––––––\n' + formatPriority() + '\n```'
    );

    data.listData.clansMessageId = await fetchOrSend(
      data.listData.clansMessageId,
      '```–––––– CLANS ––––––\n' + formatClans() + '\n```'
    );

    saveData();
    listUpdating = false;
  }).catch(console.error);

  return listUpdateQueue;
}

// ---------------- PANEL ----------------
let panelUpdating = false;
async function updatePanel(channel) {
  if (!channel || panelUpdating) return;
  panelUpdating = true;

  const gifEmbed = new EmbedBuilder()
    .setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExc2FoODRjMmVtNmhncjkyZzY0ZGVwa2l3dzV0M3UyYmZ4bjVsZ2pnOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/iuttaLUMRLWEgJKRHx/giphy.gif')
    .setColor(0xFF0000);

  const tutorialText = `
This bot organizes LBG players and clans onto the KOS list for YX members.

Players
To add players, use the command ^kos add or ^ka
When adding players, place the name before the username
Example:
^kos add poison poisonrebuild
^ka poison poisonrebuild
To remove players, use the command ^kos remove or ^kr
Removing players follows the same format as adding them
Example:
^kos remove poison poisonrebuild
^kr poison poisonrebuild

Clans
To add clans, use the command ^kos clan add or ^kca
When adding clans, place the name before the region and use the short region code
Example:
^kos clan add yx eu
^kca yx eu
To remove clans, use the command ^kos clan remove or ^kcr
Removing clans follows the same format as adding them
Example:
^kos clan remove yx eu
^kcr yx eu

Thank you for being apart of YX!
  `;

  const infoEmbed = new EmbedBuilder()
    .setTitle('KOS Submission System')
    .setColor(0xFF0000)
    .setDescription(tutorialText);

  async function fetchOrSendEmbed(id, embed) {
    try {
      if (id) {
        const msg = await channel.messages.fetch(id).catch(()=>null);
        if (msg) return (await msg.edit({ embeds: [embed] }))?.id;
      }
    } catch {}
    const msg = await channel.send({ embeds: [embed] });
    return msg.id;
  }

  data.panelMessages.gif = await fetchOrSendEmbed(data.panelMessages.gif, gifEmbed);
  data.panelMessages.tutorial = await fetchOrSendEmbed(data.panelMessages.tutorial, infoEmbed);

  saveData();
  panelUpdating = false;
}

// ---------------- CONFIRMATION ----------------
async function confirmAction(msg, text) {
  const confirmMsg = await msg.channel.send(`<@${msg.author.id}> ${text}`);
  setTimeout(() => {
    confirmMsg.delete().catch(() => {});
    msg.delete().catch(() => {});
  }, 3000);
}

// ---------------- PREFIX COMMANDS ----------------
client.on('messageCreate', async msg => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith('^')) return;

  const args = msg.content.trim().split(/\s+/);
  const rawCmd = args.shift().toLowerCase();

  // Normalize command aliases
  let cmd = rawCmd;
  if (['^kos', '^priority'].includes(cmd)) cmd += ' ' + (args.shift()?.toLowerCase() || '');

  // Submission channel check
  if (data.listData.channelId && msg.channel.id !== data.listData.channelId) {
    if (['^ka','^kr','^kos add','^kos remove','^kca','^kcr','^priority','^priority add','^priority remove','^p','^pa','^pr'].includes(cmd)) {
      return confirmAction(msg, `Use KOS commands in <#${data.listData.channelId}>.`);
    }
  }

  let changed = false;

  // PLAYER ADD
  if (['^ka','^kos add'].includes(cmd)) {
    const name = args.shift();
    const username = args.shift();
    if (!name || !username) return;
    if (!data.players.some(p=>p.name===name && p.username===username)) {
      data.players.push({ name, username, addedBy: msg.author.id });
      changed = true;
      confirmAction(msg, `Added ${name} : ${username}`);
    }
  }

  // PLAYER REMOVE
  if (['^kr','^kos remove'].includes(cmd)) {
    const name = args.shift();
    const username = args.shift() || null;
    if (!name) return;
    const before = data.players.length;
    data.players = data.players.filter(p => !(p.name===name && (username ? p.username===username : true)));
    if (before !== data.players.length) {
      changed = true;
      confirmAction(msg, `Removed ${name}${username ? ' : '+username : ''}`);
    }
    data.priority = data.priority.filter(p => p !== name);
  }

  // CLAN ADD
  if (['^kca','^kos clan add'].includes(cmd)) {
    const name = args.shift();
    const region = args.shift();
    if (!name || !region) return;
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (!data.clans.includes(clan)) {
      data.clans.push(clan);
      changed = true;
      confirmAction(msg, `Added clan ${clan}`);
    }
  }

  // CLAN REMOVE
  if (['^kcr','^kos clan remove'].includes(cmd)) {
    const name = args.shift();
    const region = args.shift();
    if (!name || !region) return;
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    const before = data.clans.length;
    data.clans = data.clans.filter(c => c !== clan);
    if (before !== data.clans.length) {
      changed = true;
      confirmAction(msg, `Removed clan ${clan}`);
    }
  }

  // PRIORITY ADD
  if (['^p','^pa','^priority add'].includes(cmd)) {
    const name = args.join(' ');
    if (!name) return;
    if (!canUsePriority(msg)) return confirmAction(msg, `You don't have permission to use this command.`);
    if (!data.priority.includes(name)) {
      data.priority.push(name);
      changed = true;
      confirmAction(msg, `Added ${name} to priority`);
    }
  }

  // PRIORITY REMOVE
  if (['^pr','^priority remove'].includes(cmd)) {
    const name = args.join(' ');
    if (!name) return;
    if (!canUsePriority(msg)) return confirmAction(msg, `You don't have permission to use this command.`);
    const before = data.priority.length;
    data.priority = data.priority.filter(p => p !== name);
    if (before !== data.priority.length) {
      changed = true;
      confirmAction(msg, `Removed ${name} from priority`);
    }
  }

  if (changed) {
    saveData();
    updateKosList(msg.channel).catch(console.error);
  }
});

// ---------------- SLASH COMMANDS ----------------
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;

  try {
    if (i.commandName === 'panel') {
      await updatePanel(i.channel);
    }

    if (i.commandName === 'list') {
      await updateKosList(i.channel);
    }

    if (i.commandName === 'submission') {
      data.listData.channelId = i.channelId;
      saveData();
    }
  } catch (e) {
    console.error('Slash command error:', e);
  }
});

// ---------------- PERIODIC SAVE ----------------
setInterval(saveData, 60_000);

// ---------------- READY ----------------
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  loadData();
});

// ---------------- LOGIN ----------------
client.login(process.env.TOKEN);
