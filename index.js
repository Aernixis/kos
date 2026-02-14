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

  // Load players (keep those with or without username)
  data.players = new Map();
  if (raw.players) {
    raw.players.forEach(p => {
      const key = p.username || p.name;
      data.players.set(key, p);
    });
  }

  // Load priority (map usernames or names to actual players)
  data.priority = new Set();
  if (raw.topPriority) {
    raw.topPriority.forEach(u => {
      if (u) data.priority.add(u);
    });
  }

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
    .filter(p => !data.priority.has(p.username || p.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => `${p.name} : ${p.username || 'N/A'}`);
  return rows.length ? rows.join('\n') : 'None';
}

function formatPriority() {
  const rows = [...data.priority].map(u => {
    let p = data.players.get(u);
    if (!p) p = [...data.players.values()].find(pl => pl.name.toLowerCase() === u.toLowerCase());
    return p ? `${p.name} : ${p.username}` : u;
  });
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
    .setDescription(`
This bot organizes LBG players and clans onto the KOS list for YX members.
**If there are multiple users with the same display name on the KOS list, a username will be required.**

Player Commands
^ka name username – Add a player to the KOS list
^kr name  – Remove a player from the KOS list

Examples
^ka poison poisonrebuild
^kr poison poisonrebuild

Clan Commands
^kca name region – Add a clan to the KOS list
^kcr name region – Remove a clan from the KOS list

Examples
^kca yx eu
^kcr yx eu

Priority Commands (YX Founders Only)
^p name  – Promote a player to priority
^pr name  – Remove a player from priority
^pa name  – Add player directly to priority

Examples
^p poison
^pr poison 
^pa poison 

Thank you for being a part of YX!
    `);

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

  // ---------- Submission channel lock ----------
  if (cmd === '^submission') {
    data.submissionChannel = msg.channel.id;
    saveData();
    const m = await msg.channel.send(`<@${msg.author.id}> KOS commands locked to <#${msg.channel.id}>`);
    setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 4000);
    return;
  }
  if (data.submissionChannel && msg.channel.id !== data.submissionChannel) {
    const m = await msg.channel.send(`<@${msg.author.id}> Use KOS commands in <#${data.submissionChannel}>.`);
    setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 4000);
    return;
  }

  // ---------- ^ka ----------
  if (cmd === '^ka') {
    const [name, username] = args;
    if (!name || !username) {
      const m = await msg.channel.send(`<@${msg.author.id}> Missing name and username.`);
      return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    }
    if (data.players.has(username)) {
      const m = await msg.channel.send(`<@${msg.author.id}> Player already in KOS: ${username}`);
      return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    }
    data.players.set(username, { name, username, addedBy: msg.author.id });
    data.priority.delete(username);
    await updateKosList(msg.channel, 'players');
    const m = await msg.channel.send(`<@${msg.author.id}> Added ${username}`);
    return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
  }

  // ---------- ^kr ----------
  if (cmd === '^kr') {
    const [identifier] = args;
    if (!identifier) {
      const m = await msg.channel.send(`<@${msg.author.id}> Missing name.`);
      return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    }
    const player = data.players.get(identifier) || [...data.players.values()].find(p => p.name.toLowerCase() === identifier.toLowerCase());
    if (!player) {
      const m = await msg.channel.send(`<@${msg.author.id}> Player not found.`);
      return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    }

    if (player.addedBy !== msg.author.id && msg.author.id !== OWNER_ID && !canUsePriority(msg)) {
      const m = await msg.channel.send(`<@${msg.author.id}> You didn't add this player.`);
      return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    }

    data.players.delete(player.username || player.name);
    data.priority.delete(player.username || player.name);
    await updateKosList(msg.channel, 'players');
    await updateKosList(msg.channel, 'priority');
    const m = await msg.channel.send(`<@${msg.author.id}> Removed ${player.username || player.name}`);
    return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
  }

  // ---------- ^kca ----------
  if (cmd === '^kca') {
    const [name, region] = args;
    if (!name || !region) {
      const m = await msg.channel.send(`<@${msg.author.id}> Missing name and region.`);
      return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    }
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (data.clans.has(clan)) {
      const m = await msg.channel.send(`<@${msg.author.id}> Clan already exists: ${clan}`);
      return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    }
    data.clans.add(clan);
    await updateKosList(msg.channel, 'clans');
    const m = await msg.channel.send(`<@${msg.author.id}> Added clan ${clan}`);
    return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
  }

  // ---------- ^kcr ----------
  if (cmd === '^kcr') {
    const [name, region] = args;
    if (!name || !region) {
      const m = await msg.channel.send(`<@${msg.author.id}> Missing name and region.`);
      return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    }
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (data.clans.delete(clan)) {
      await updateKosList(msg.channel, 'clans');
      const m = await msg.channel.send(`<@${msg.author.id}> Removed clan ${clan}`);
      return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    }
  }

  // ---------- Priority commands ----------
  if (['^p','^pr','^pa'].includes(cmd)) {
    if (!canUsePriority(msg)) {
      const m = await msg.channel.send(`<@${msg.author.id}> You cannot use priority commands.`);
      return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    }

    // ^pa enforces only name
    if (cmd === '^pa') {
      const [name, username] = args;
      if (!name) {
        const m = await msg.channel.send(`<@${msg.author.id}> Missing name.`);
        return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
      }

      const key = username || name;
      if (data.players.has(key)) {
        const m = await msg.channel.send(`<@${msg.author.id}> Player already exists: ${key}`);
        return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
      }

      data.players.set(key, { name, username, addedBy: msg.author.id });
      data.priority.add(key);
      await updateKosList(msg.channel, 'players');
      await updateKosList(msg.channel, 'priority');
      const m = await msg.channel.send(`<@${msg.author.id}> Added ${key} directly to priority`);
      return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    }

    const [identifier] = args;
    if (!identifier) {
      const m = await msg.channel.send(`<@${msg.author.id}> Missing name.`);
      return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    }

    const player = data.players.get(identifier) || [...data.players.values()].find(p => p.name.toLowerCase() === identifier.toLowerCase());
    if (!player) {
      const m = await msg.channel.send(`<@${msg.author.id}> Player not found.`);
      return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    }

    if (cmd === '^p') {
      data.priority.add(player.username || player.name);
      await updateKosList(msg.channel, 'priority');
      const m = await msg.channel.send(`<@${msg.author.id}> Promoted ${player.username || player.name} to priority`);
      return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    } else if (cmd === '^pr') {
      data.priority.delete(player.username || player.name);
      await updateKosList(msg.channel, 'priority');
      const m = await msg.channel.send(`<@${msg.author.id}> Removed ${player.username || player.name} from priority`);
      return setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    }
  }
});

/* ===================== SLASH COMMANDS (OWNER ONLY) ===================== */
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;
  if (i.user.id !== OWNER_ID) return;

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
