require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

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
if (fs.existsSync(DATA_FILE)) {
  try { data = JSON.parse(fs.readFileSync(DATA_FILE)); } 
  catch { console.error('Failed to load data.json'); }
}

// ---------------- SAVE ----------------
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ---------------- HELPERS ----------------
const norm = s => s.toLowerCase();
let panelUpdating = false;
let listUpdating = false;
let listUpdatePromise = Promise.resolve();

function canUsePriority(msg) {
  if (msg.author.id === OWNER_ID) return true;
  return msg.member?.roles.cache.has(PRIORITY_ROLE_ID);
}

// ---------------- LIST BUILD ----------------
async function updateKosList(channel) {
  if (!channel) return;

  listUpdatePromise = listUpdatePromise.then(async () => {
    if (listUpdating) return;
    listUpdating = true;
    data.listData.channelId = channel.id;

    async function fetchOrSend(id, content) {
      try {
        if (id) {
          const msg = await channel.messages.fetch(id).catch(()=>null);
          if (msg) return (await msg.edit({ content })).id;
        }
      } catch {}
      const msg = await channel.send({ content });
      return msg.id;
    }

    // --- PLAYERS ---
    data.listData.playersMessageId = await fetchOrSend(
      data.listData.playersMessageId,
      "```–––––– PLAYERS ––––––\n" +
      (data.players.length
        ? data.players
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(p => `${p.name} : ${p.username || "N/A"}`)
            .join("\n")
        : "None") +
      "```"
    );

    // --- PRIORITY ---
    data.listData.priorityMessageId = await fetchOrSend(
      data.listData.priorityMessageId,
      "```–––––– PRIORITY ––––––\n" +
      (data.priority.length
        ? data.priority.sort().join("\n")
        : "None") +
      "```"
    );

    // --- CLANS ---
    data.listData.clansMessageId = await fetchOrSend(
      data.listData.clansMessageId,
      "```–––––– CLANS ––––––\n" +
      (data.clans.length
        ? data.clans.sort().join("\n")
        : "None") +
      "```"
    );

    saveData();
    listUpdating = false;
  }).catch(console.error);

  return listUpdatePromise;
}

// ---------------- PANEL ----------------
async function updatePanel(channel) {
  if (!channel || panelUpdating) return;
  panelUpdating = true;

  const gifEmbed = new EmbedBuilder()
    .setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExc2FoODRjMmVtNmhncjkyZzY0ZGVwa2l3dzV0M3UyYmZ4bjVsZ2pnOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/iuttaLUMRLWEgJKRHx/giphy.gif')
    .setColor(0xFF0000);

  const infoEmbed = new EmbedBuilder()
    .setTitle('KOS Submission System')
    .setColor(0xFF0000)
    .setDescription(`This bot organizes LBG players and clans onto the KOS list for YX members.

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
`);

  async function fetchOrSendEmbed(id, embed) {
    try {
      if (id) {
        const msg = await channel.messages.fetch(id).catch(()=>null);
        if (msg) return (await msg.edit({ embeds: [embed] })).id;
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

  const args = msg.content.trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  async function sendReplyOnce(text) {
    try {
      const botMsg = await msg.channel.send(`<@${msg.author.id}> ${text}`);
      setTimeout(()=>{ botMsg.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    } catch {}
  }

  // ---------------- ENFORCE SUBMISSION CHANNEL ----------------
  if (data.listData.channelId && msg.channel.id !== data.listData.channelId) {
    if (['^ka','^kr','^p','^pa','^pr','^kca','^kcr'].includes(cmd)) {
      return sendReplyOnce(`Use KOS commands in <#${data.listData.channelId}>.`);
    }
  }

  let changed = false;

  // ---- PLAYER COMMANDS ----
  if (cmd === '^ka') {
    const name = args.shift();
    const username = args.shift() || null;
    if (!name || !username) return sendReplyOnce('Name and username required.');
    if (!data.players.some(p => p.name === name && p.username === username)) {
      data.players.push({ name, username });
      changed = true;
      await sendReplyOnce(`Added ${name} : ${username}`);
    }
  }

  if (cmd === '^kr') {
    const name = args.shift();
    const username = args.shift() || null;
    const playerExists = data.players.find(p => p.name === name && (username ? p.username === username : true));
    if (!playerExists) return sendReplyOnce('Player not found.');
    data.players = data.players.filter(p => !(p.name === name && (username ? p.username === username : true)));
    changed = true;
    await sendReplyOnce(`Removed ${name}`);
  }

  // ---- PRIORITY COMMANDS ----
  if (['^p','^pa'].includes(cmd)) {
    const name = args.join(' ');
    if (!name) return sendReplyOnce('Name required.');
    if (!data.priority.includes(name)) {
      data.priority.push(name);
      changed = true;
      await sendReplyOnce(`Prioritized ${name}`);
    }
  }

  if (cmd === '^pr') {
    const name = args.join(' ');
    if (!name) return sendReplyOnce('Name required.');
    data.priority = data.priority.filter(p => p !== name);
    changed = true;
    await sendReplyOnce(`Demoted ${name}`);
  }

  // ---- CLAN COMMANDS ----
  if (cmd === '^kca') {
    const clan = args.join(' ');
    if (!clan) return sendReplyOnce('Clan name required.');
    if (!data.clans.includes(clan)) {
      data.clans.push(clan);
      changed = true;
      await sendReplyOnce(`Added clan ${clan}`);
    }
  }

  if (cmd === '^kcr') {
    const clan = args.join(' ');
    if (!clan) return sendReplyOnce('Clan name required.');
    data.clans = data.clans.filter(c => c !== clan);
    changed = true;
    await sendReplyOnce(`Removed clan ${clan}`);
  }

  if (changed && data.listData.channelId) {
    const ch = await client.channels.fetch(data.listData.channelId).catch(()=>null);
    if (ch) updateKosList(ch);
    saveData();
  }
});

// ---------------- SLASH COMMANDS ----------------
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;
  if (i.user.id !== OWNER_ID) return i.reply({ content: 'Not allowed.', ephemeral: true }).catch(()=>{});

  try {
    if (i.commandName === 'panel') await updatePanel(i.channel);
    if (i.commandName === 'list') await updateKosList(i.channel);
    if (i.commandName === 'submission') {
      data.listData.channelId = i.channelId;
      saveData();
      await i.reply({ content: `Submission channel set to <#${i.channelId}>`, ephemeral: true });
    }
  } catch(e) {
    console.error(e);
    if (!i.replied && !i.deferred) await i.reply({ content: 'Error occurred.', ephemeral: true }).catch(()=>{});
  }
});

// ---------------- STARTUP ----------------
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  saveData();
});

// ---------------- AUTO-SAVE ----------------
setInterval(saveData, 60_000);

client.login(process.env.TOKEN);
