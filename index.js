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
  players: [], // { name, username, addedBy }
  priority: [], // array of player names
  clans: [], // array of clan strings
  panelMessages: { gif: null, tutorial: null },
  listData: { channelId: null, playersMessageId: null, priorityMessageId: null, clansMessageId: null }
};

// ---------------- LOAD / SAVE ----------------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    const oldData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (Array.isArray(oldData.players))
      data.players = oldData.players.map(p => ({
        name: String(p.name || '').trim(),
        username: p.username ? String(p.username).trim() : null,
        addedBy: p.addedBy || null
      }));
    if (Array.isArray(oldData.topPriority) && oldData.topPriority.length)
      data.priority = [...new Set(oldData.topPriority.map(p => String(p).trim()))];
    else if (Array.isArray(oldData.priority))
      data.priority = [...new Set(oldData.priority.map(p => String(p).trim()))];
    if (Array.isArray(oldData.clans))
      data.clans = [...new Set(oldData.clans.map(c => typeof c === 'string' ? c.trim().toUpperCase() : null).filter(Boolean))];
    if (oldData.panelMessages) data.panelMessages = oldData.panelMessages;
    if (oldData.listData) data.listData = oldData.listData;
  } catch (err) { console.error('Failed to load data.json', err); }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

loadData();

// ---------------- HELPERS ----------------
const norm = s => String(s).toLowerCase();
function canUsePriority(msg) {
  if (msg.author.id === OWNER_ID) return true;
  return msg.member?.roles.cache.has(PRIORITY_ROLE_ID);
}

// ---------------- DEDUPLICATED MESSAGE SENDER (CHANNEL SPECIFIC) ----------------
async function sendOnce(channel, content, options = {}) {
  const messages = await channel.messages.fetch({ limit: 10 }); // only this channel
  const duplicate = messages.find(m => m.author.id === channel.client.user.id && m.content === content);
  if (duplicate) return duplicate;
  return await channel.send({ content, ...options });
}

// ---------------- FORMATTING ----------------
function formatPlayers() {
  return data.players
    .filter(p => !data.priority.some(pr => norm(pr) === norm(p.name)))
    .sort((a,b) => a.name.localeCompare(b.name))
    .map(p => p.username ? `${p.name} : ${p.username}` : p.name)
    .join('\n') || 'None';
}

function formatPriority() {
  return data.priority
    .map(n => data.players.find(p => norm(p.name) === norm(n))?.name || n)
    .sort()
    .join('\n') || 'None';
}

function formatClans() {
  return data.clans.length ? data.clans.sort().join('\n') : 'None';
}

// ---------------- KOS LIST UPDATE ----------------
let listUpdating = false;
async function updateKosList(channel) {
  if (!channel || !data.listData.channelId || listUpdating) return;
  listUpdating = true;

  const sections = [
    { key: 'playersMessageId', title: '–––––– PLAYERS ––––––', content: formatPlayers() },
    { key: 'priorityMessageId', title: '–––––– PRIORITY ––––––', content: formatPriority() },
    { key: 'clansMessageId', title: '–––––– CLANS ––––––', content: formatClans() }
  ];

  for (const section of sections) {
    try {
      const formatted = '```' + section.title + '\n' + section.content + '\n```';
      let msg = null;

      // fetch existing message by ID in this channel
      if (section.key && data.listData[section.key]) {
        msg = await channel.messages.fetch(data.listData[section.key]).catch(() => null);
      }

      if (!msg) {
        msg = await channel.send({ content: formatted });
        if (section.key) data.listData[section.key] = msg.id;
      } else if (msg.content !== formatted) {
        await msg.edit({ content: formatted });
      }
    } catch (e) {
      console.error('KOS update error', e);
    }
  }

  saveData();
  listUpdating = false;
}

// ---------------- PANEL ----------------
let panelUpdating = false;
async function updatePanel(channel) {
  if (!channel || panelUpdating) return;
  panelUpdating = true;

  const gifEmbed = new EmbedBuilder()
    .setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExc2FoODRjMmVtNmhncjkyZzY0ZGVwa2l3dzV0M3UyYmZ4bjVsZ2pnOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/iuttaLUMRLWEgJKRHx/giphy.gif')
    .setColor(0xFF0000);

  const infoEmbed = new EmbedBuilder()
    .setTitle('KOS Submission System')
    .setColor(0xFF0000)
    .setDescription(`
This bot organizes LBG players and clans onto the KOS list for YX members.

Players
Use ^kos add or ^ka to add
Use ^kos remove or ^kr to remove

Clans
Use ^kos clan add or ^kca to add
Use ^kos clan remove or ^kcr to remove

Thank you for being part of YX!
  `);

  async function fetchOrSendEmbed(id, embed) {
    if (id) {
      const msg = await channel.messages.fetch(id).catch(()=>null);
      if (msg) return (await msg.edit({ embeds: [embed] }))?.id;
    }
    const msg = await channel.send({ embeds: [embed] });
    return msg.id;
  }

  data.panelMessages.gif = await fetchOrSendEmbed(data.panelMessages.gif, gifEmbed);
  data.panelMessages.tutorial = await fetchOrSendEmbed(data.panelMessages.tutorial, infoEmbed);

  saveData();
  panelUpdating = false;
}

// ---------------- PREFIX COMMANDS ----------------
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.content.startsWith('^') || msg._kosProcessed) return;
  msg._kosProcessed = true;

  const argsRaw = msg.content.trim().split(/\s+/);
  let cmd = argsRaw.shift()?.toLowerCase();
  let args = [...argsRaw];

  // Aliases
  if (cmd === '^kos') {
    const sub = args.shift()?.toLowerCase();
    if (sub === 'add') cmd = '^ka';
    else if (sub === 'remove') cmd = '^kr';
    else if (sub === 'clan') {
      const clanSub = args.shift()?.toLowerCase();
      if (clanSub === 'add') cmd = '^kca';
      else if (clanSub === 'remove') cmd = '^kcr';
    }
  }
  if (cmd === '^priority') {
    const sub = args.shift()?.toLowerCase();
    if (sub === 'add') cmd = '^pa';
    else if (sub === 'remove') cmd = '^pr';
    else cmd = '^p';
  }

  // Submission channel check
  if (data.listData.channelId && msg.channel.id !== data.listData.channelId) {
    if (['^ka','^kr','^p','^pa','^pr','^kca','^kcr'].includes(cmd)) {
      await sendOnce(msg.channel, `<@${msg.author.id}> Use KOS commands in <#${data.listData.channelId}>.`);
      setTimeout(()=>{ msg.delete().catch(()=>{}); },3000);
      return;
    }
  }

  let changed = false;
  let actionText = '';

  // ---- PLAYER ----
  if (cmd === '^ka') {
    const name = args.shift();
    const username = args.shift();
    if (name && username && !data.players.some(p => norm(p.name) === norm(name) && p.username === username)) {
      data.players.push({ name, username, addedBy: msg.author.id });
      changed = true;
      actionText = `Added ${name} : ${username}`;
    }
  }
  if (cmd === '^kr') {
    const name = args.shift();
    const username = args.shift() || null;
    if (name) {
      const before = data.players.length;
      data.players = data.players.filter(p => !(norm(p.name) === norm(name) && (username ? p.username === username : true)));
      data.priority = data.priority.filter(p => norm(p) !== norm(name));
      if (before !== data.players.length) { changed = true; actionText = `Removed ${name}${username?` : ${username}`:''}`; }
    }
  }

  // ---- CLAN ----
  if (cmd === '^kca') {
    const name = args.shift();
    const region = args.shift();
    if (name && region) {
      const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
      if (!data.clans.includes(clan)) { data.clans.push(clan); changed = true; actionText = `Added clan ${clan}`; }
    }
  }
  if (cmd === '^kcr') {
    const name = args.shift();
    const region = args.shift();
    if (name && region) {
      const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
      const before = data.clans.length;
      data.clans = data.clans.filter(c => c !== clan);
      if (before !== data.clans.length) { changed = true; actionText = `Removed clan ${clan}`; }
    }
  }

  // ---- PRIORITY ----
  if (['^p','^pa'].includes(cmd)) {
    const name = args.join(' ');
    if (name && canUsePriority(msg) && !data.priority.includes(name)) {
      data.priority.push(name); changed = true; actionText = `Added ${name} to priority`;
    }
  }
  if (cmd === '^pr') {
    const name = args.join(' ');
    if (name && canUsePriority(msg)) {
      const before = data.priority.length;
      data.priority = data.priority.filter(p => p !== name);
      if (before !== data.priority.length){ changed = true; actionText = `Removed ${name} from priority`; }
    }
  }

  if (!changed) return;

  saveData();
  if (data.listData.channelId) {
    const listChannel = msg.guild.channels.cache.get(data.listData.channelId);
    if (listChannel) updateKosList(listChannel).catch(console.error);
  }

  if (actionText) await sendOnce(msg.channel, `<@${msg.author.id}> ${actionText}`);
});

// ---------------- SLASH COMMANDS ----------------
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;
  try {
    if (i.commandName === 'list') {
      await i.deferReply({ ephemeral: true, flags: 64 });
      const listChannel = i.guild.channels.cache.get(data.listData.channelId);
      if (listChannel) await updateKosList(listChannel);
      await i.editReply({ content: 'KOS list updated.' });
    }

    if (i.commandName === 'panel') {
      await i.deferReply({ ephemeral: true, flags: 64 });
      await updatePanel(i.channel);
      await i.editReply({ content: 'Panel updated.' });
    }

    if (i.commandName === 'submission') {
      data.listData.channelId = i.channelId;
      saveData();
      await i.reply({ content: `Submission channel set to <#${i.channelId}>`, ephemeral: true, flags: 64 });
    }
  } catch (e) {
    console.error('Slash command error:', e);
    if (!i.replied && !i.deferred) await i.reply({ content: 'Error occurred.', ephemeral: true, flags: 64 }).catch(()=>{});
  }
});

// ---------------- LOGIN ----------------
client.login(process.env.TOKEN);
