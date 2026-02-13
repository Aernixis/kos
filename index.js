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

// ---------------- LOAD/ SAVE ----------------
function loadData() {
  if (fs.existsSync(DATA_FILE)) {
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
}

function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
loadData();

// ---------------- HELPERS ----------------
const norm = s => String(s).toLowerCase();

function canUsePriority(msg) {
  if (msg.author.id === OWNER_ID) return true;
  return msg.member?.roles.cache.has(PRIORITY_ROLE_ID);
}

// ---------------- FORMAT ----------------
function formatPlayers() {
  return data.players
    .filter(p => !data.priority.includes(norm(p.name)))
    .sort((a,b)=>a.name.localeCompare(b.name))
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
let listUpdateQueue = Promise.resolve();
let listUpdating = false;

async function updateKosList(channel) {
  if (!channel) return;

  listUpdateQueue = listUpdateQueue.then(async () => {
    if (listUpdating) return;
    listUpdating = true;

    const sections = [
      { key: 'playersMessageId', title: '–––––– PLAYERS ––––––', content: formatPlayers() },
      { key: 'priorityMessageId', title: '–––––– PRIORITY ––––––', content: formatPriority() },
      { key: 'clansMessageId', title: '–––––– CLANS ––––––', content: formatClans() }
    ];

    for (const section of sections) {
      try {
        let msg;
        const formatted = '```' + section.title + '\n' + section.content + '\n```';
        if (section.key && data.listData[section.key]) {
          msg = await channel.messages.fetch(data.listData[section.key]).catch(()=>null);
          if (msg) {
            if (msg.content !== formatted) await msg.edit({ content: formatted });
            continue;
          }
        }
        msg = await channel.send({ content: formatted });
        if (section.key) data.listData[section.key] = msg.id;
      } catch(e){ console.error('KOS update error', e); }
    }

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
Example:
^kos add poison poisonrebuild
^ka poison poisonrebuild
To remove players, use ^kos remove or ^kr
Example:
^kos remove poison poisonrebuild
^kr poison poisonrebuild

Clans
To add clans, use ^kos clan add or ^kca
Example:
^kos clan add yx eu
^kca yx eu
To remove clans, use ^kos clan remove or ^kcr
Example:
^kos clan remove yx eu
^kcr yx eu

Thank you for being a part of YX!
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

// ---------------- PREFIX COMMANDS ----------------
client.on('messageCreate', async msg => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith('^')) return;
  if (msg._kosProcessed) return;
  msg._kosProcessed = true;

  const argsRaw = msg.content.trim().split(/\s+/);
  let cmd = argsRaw.shift().toLowerCase();
  let args = [...argsRaw];

  // Normalize aliases
  if (cmd === '^kos') {
    const sub = args.shift()?.toLowerCase();
    if (sub === 'add') cmd = '^ka';
    else if (sub === 'remove') cmd = '^kr';
    else if (sub === 'clan') {
      const clanSub = args.shift()?.toLowerCase();
      if (clanSub === 'add') cmd = '^kca';
      else if (clanSub === 'remove') cmd = '^kcr';
    }
  } else if (cmd === '^priority') {
    const sub = args.shift()?.toLowerCase();
    if (sub === 'add') cmd = '^pa';
    else if (sub === 'remove') cmd = '^pr';
    else cmd = '^p';
  }

  // ---------------- PUBLIC CHANNEL CHECK ----------------
  if (data.listData.channelId && msg.channel.id !== data.listData.channelId) {
    if (['^ka','^kr','^p','^pa','^pr','^kca','^kcr'].includes(cmd)) {
      // Public reply, command is ignored
      const botMsg = await msg.channel.send(`KOS commands must be used in <#${data.listData.channelId}>.`);
      setTimeout(()=>{ botMsg.delete().catch(()=>{}); msg.delete().catch(()=>{}); },3000);
      return;
    }
  }

  let changed = false;
  let actionText = '';

  // ---- PLAYER ----
  if (cmd === '^ka') {
    const name = args.shift();
    const username = args.shift();
    if (!name || !username) return;
    if (!data.players.some(p => p.name===name && p.username===username)) {
      data.players.push({name, username, addedBy: msg.author.id});
      changed = true;
      actionText = `Added ${name} : ${username}`;
    }
  }
  if (cmd === '^kr') {
    const name = args.shift();
    const username = args.shift() || null;
    if (!name) return;
    const before = data.players.length;
    data.players = data.players.filter(p => !(p.name===name && (username?p.username===username:true)));
    data.priority = data.priority.filter(p => p!==name);
    if (before !== data.players.length) { changed = true; actionText = `Removed ${name}${username?` : ${username}`:''}`; }
  }

  // ---- CLAN ----
  if (cmd === '^kca') {
    const name = args.shift();
    const region = args.shift();
    if (!name || !region) return;
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (!data.clans.includes(clan)) { data.clans.push(clan); changed=true; actionText=`Added clan ${clan}`; }
  }
  if (cmd === '^kcr') {
    const name = args.shift();
    const region = args.shift();
    if (!name || !region) return;
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    const before = data.clans.length;
    data.clans = data.clans.filter(c=>c!==clan);
    if (before!==data.clans.length) { changed=true; actionText=`Removed clan ${clan}`; }
  }

  // ---- PRIORITY ----
  if (['^p','^pa'].includes(cmd)) {
    const name = args.join(' ');
    if (!name) return;
    if (!canUsePriority(msg)) {
      const botMsg = await msg.channel.send(`<@${msg.author.id}> You don't have permission to use this command.`);
      setTimeout(()=>{ botMsg.delete().catch(()=>{}); msg.delete().catch(()=>{}); },3000);
      return;
    }
    if (!data.priority.includes(name)) { data.priority.push(name); changed=true; actionText=`Added ${name} to priority`; }
  }
  if (cmd==='^pr') {
    const name = args.join(' ');
    if (!name) return;
    if (!canUsePriority(msg)) {
      const botMsg = await msg.channel.send(`<@${msg.author.id}> You don't have permission to use this command.`);
      setTimeout(()=>{ botMsg.delete().catch(()=>{}); msg.delete().catch(()=>{}); },3000);
      return;
    }
    const before = data.priority.length;
    data.priority = data.priority.filter(p=>p!==name);
    if (before!==data.priority.length){ changed=true; actionText=`Removed ${name} from priority`; }
  }

  if (!changed) return;

  saveData();
  updateKosList(msg.channel).catch(console.error);

  // Send single confirmation
  if (actionText){
    const botMsg = await msg.channel.send(`<@${msg.author.id}> ${actionText}`);
    setTimeout(()=>{ botMsg.delete().catch(()=>{}); msg.delete().catch(()=>{}); },3000);
  }
});

// ---------------- SLASH COMMANDS ----------------
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;

  try {
    // ---------------- PANEL ----------------
    if (i.commandName === 'panel') {
      await updatePanel(i.channel);
      await i.reply({ content: 'Panel updated.', ephemeral: true });
      return;
    }

    // ---------------- LIST ----------------
    if (i.commandName === 'list') {
      await updateKosList(i.channel);
      await i.reply({ content: 'KOS list updated.', ephemeral: true });
      return;
    }

    // ---------------- SUBMISSION ----------------
    if (i.commandName === 'submission') {
      // Only the owner can set the submission channel
      if (i.user.id !== OWNER_ID) {
        await i.reply({ content: `Only the bot owner can set the submission channel.`, ephemeral: true });
        return;
      }

      // Set this channel as the submission channel
      data.listData.channelId = i.channel.id;
      saveData();

      // Ephemeral reply to owner
      await i.reply({
        content: `This channel (<#${i.channel.id}>) has been set as the submission channel.`,
        ephemeral: true
      });
    }
  } catch (e) {
    console.error('Slash command error', e);
    if (!i.replied) await i.reply({ content: 'An error occurred.', ephemeral: true });
  }
});

// ---------------- LOGIN ----------------
client.login(process.env.TOKEN);
