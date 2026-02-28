require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder, AttachmentBuilder } = require('discord.js');

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
const OWNER_ID         = '1283217337084018749';
const PRIORITY_ROLE_ID = '1412837397607092405';
const DATA_FILE        = './data.json';
const SPECIAL_USER_ID  = '760369177180897290';
const SPECIAL_GIF_URL  = 'https://tenor.com/view/chainsawman-chainsaw-man-reze-reze-arc-chainsaw-man-reze-gif-13447210726051357373';

/* ===================== DATA ===================== */
let data = {
  players:           new Map(),
  priority:          new Set(),
  clans:             new Set(),
  bannedUsers:       new Set(),
  submissionChannel: null,
  logsChannel:       null,
  backupChannel:     null,
  backupMessageId:   null,
  listMessages:      { players: [], priority: [], clans: [] },
  panelMessages:     { gif: null, tutorial: null },
  ownerRoleId:       null,
  revision:          0
};

/* ===================== HELPERS ===================== */
function canUsePriority(msg) {
  if (msg.author.id === OWNER_ID) return true;
  return msg.member?.roles.cache.has(PRIORITY_ROLE_ID);
}

function isOwner(i) {
  if (i.user.id === OWNER_ID) return true;
  if (data.ownerRoleId && i.member?.roles.cache.has(data.ownerRoleId)) return true;
  return false;
}

function rev() {
  data.revision++;
  return '\u200B'.repeat((data.revision % 10) + 1);
}

async function reply(msg, text, ms = 3000) {
  const m = await msg.channel.send(`<@${msg.author.id}> ${text}`);
  setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, ms);
}

// Treat empty string, "N/A", null, undefined as no username
function cleanUsername(u) {
  if (!u || u.trim() === '' || u === 'N/A') return null;
  return u.trim();
}

// The map key for a player
function playerKey(p) {
  return cleanUsername(p.username) || p.name;
}

// Case-insensitive alphabetical comparator
const alpha = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });

// Sort all data in memory alphabetically so data.json backup is always clean
function sortData() {
  const sortedPlayers = [...data.players.values()]
    .sort((a, b) => alpha(a.name, b.name));
  data.players = new Map(sortedPlayers.map(p => [playerKey(p), p]));

  const sortedPriority = [...data.priority].sort((a, b) => {
    const pa = [...data.players.values()].find(p => playerKey(p).toLowerCase() === a.toLowerCase());
    const pb = [...data.players.values()].find(p => playerKey(p).toLowerCase() === b.toLowerCase());
    return alpha(pa ? pa.name : a, pb ? pb.name : b);
  });
  data.priority = new Set(sortedPriority);

  data.clans = new Set([...data.clans].sort((a, b) => alpha(a, b)));
}

function findPlayer(identifier) {
  const id = identifier.toLowerCase();
  const byName     = [...data.players.values()].find(p => p.name.toLowerCase() === id);
  if (byName) return byName;
  const byUsername = [...data.players.values()].find(p => p.username && p.username.toLowerCase() === id);
  if (byUsername) return byUsername;
  const priorityKey = [...data.priority].find(k => k.toLowerCase() === id);
  if (priorityKey) return { name: priorityKey, username: null, addedBy: null, _orphaned: true };
  return null;
}

/* ===================== BUILD / PARSE ===================== */
function buildPayload() {
  sortData(); // always sort before saving so backup is alphabetical
  return JSON.stringify({
    players: [...data.players.values()].map(p => ({
      name:     p.name,
      username: cleanUsername(p.username) || null,
      addedBy:  p.addedBy
    })),
    priority:          [...data.priority],
    clans:             [...data.clans],
    bannedUsers:       [...data.bannedUsers],
    submissionChannel: data.submissionChannel,
    logsChannel:       data.logsChannel,
    backupChannel:     data.backupChannel,
    backupMessageId:   data.backupMessageId,
    listMessages:      data.listMessages,
    panelMessages:     data.panelMessages,
    ownerRoleId:       data.ownerRoleId,
    revision:          data.revision
  }, null, 2);
}

function parseRaw(raw) {
  data.players = new Map();
  if (raw.players) {
    raw.players.forEach(p => {
      const uname = cleanUsername(p.username);
      const key   = uname || p.name;
      data.players.set(key, { name: p.name, username: uname, addedBy: p.addedBy });
    });
  }

  data.priority = new Set();
  if (raw.topPriority) raw.topPriority.forEach(u => { if (u) data.priority.add(u); });
  if (raw.priority)    raw.priority.forEach(u => { if (u) data.priority.add(u); });

  data.clans             = new Set(raw.clans       || []);
  data.bannedUsers       = new Set(raw.bannedUsers || []);
  data.submissionChannel = raw.submissionChannelId || raw.submissionChannel || null;
  data.logsChannel       = raw.logsChannel       || null;
  data.backupChannel     = raw.backupChannel     || process.env.BACKUP_CHANNEL_ID || null;
  data.backupMessageId   = raw.backupMessageId   || null;
  data.ownerRoleId       = raw.ownerRoleId       || null;

  if (raw.messages || raw.listMessages) {
    const msgs = raw.messages || raw.listMessages;
    data.listMessages = {
      players:  Array.isArray(msgs.players)  ? msgs.players  : (msgs.players  ? [msgs.players]  : []),
      priority: Array.isArray(msgs.priority) ? msgs.priority : (msgs.priority ? [msgs.priority] : []),
      clans:    Array.isArray(msgs.clans)    ? msgs.clans    : (msgs.clans    ? [msgs.clans]    : [])
    };
  }

  data.panelMessages = raw.panelMessages || data.panelMessages;
  data.revision      = raw.revision      || 0;

  sortData(); // sort immediately after loading
}

/* ===================== SAVE / LOAD ===================== */
async function pushBackup() {
  const payload = buildPayload();

  try { fs.writeFileSync(DATA_FILE, payload); } catch (e) { console.error('[Backup] Local write failed:', e.message); }

  if (!data.backupChannel) return;
  try {
    const ch = await client.channels.fetch(data.backupChannel).catch(() => null);
    if (!ch) return;

    const buf        = Buffer.from(payload, 'utf8');
    const attachment = new AttachmentBuilder(buf, { name: 'data.json' });
    const content    = `Last save: <t:${Math.floor(Date.now() / 1000)}:F>`;

    if (data.backupMessageId) {
      const existing = await ch.messages.fetch(data.backupMessageId).catch(() => null);
      if (existing) {
        await existing.edit({ content, files: [attachment] });
        return;
      }
    }

    const sent = await ch.send({ content, files: [attachment] });
    data.backupMessageId = sent.id;
    fs.writeFileSync(DATA_FILE, buildPayload());
  } catch (e) { console.error('[Backup] Discord push failed:', e.message); }
}

let _saveTimer = null;
function saveData() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => pushBackup(), 1000);
}

async function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      parseRaw(raw);
      console.log('[Load] Loaded from local data.json');
      return;
    } catch (e) {
      console.warn('[Load] Local file corrupt, trying Discord…', e.message);
    }
  }

  const channelId = process.env.BACKUP_CHANNEL_ID;
  if (!channelId) {
    console.warn('[Load] No BACKUP_CHANNEL_ID and no local file. Starting fresh.');
    return;
  }

  try {
    const ch        = await client.channels.fetch(channelId);
    const messages  = await ch.messages.fetch({ limit: 20 });
    const backupMsg = messages.find(m => m.attachments.some(a => a.name === 'data.json'));

    if (!backupMsg) {
      console.warn('[Load] No backup found. Starting fresh.');
      data.backupChannel = channelId;
      return;
    }

    const att = backupMsg.attachments.find(a => a.name === 'data.json');
    const res  = await fetch(att.url);
    const raw  = await res.json();
    parseRaw(raw);
    data.backupChannel   = channelId;
    data.backupMessageId = backupMsg.id;
    console.log(`[Load] Loaded from Discord backup (msg ${backupMsg.id})`);
    fs.writeFileSync(DATA_FILE, buildPayload());
  } catch (e) { console.error('[Load] Discord load failed:', e.message); }
}

/* ===================== LOGGER ===================== */
const LOG_COLORS = {
  ADD:      0x57F287,
  REMOVE:   0xED4245,
  PRIORITY: 0xFEE75C,
  CLAN_ADD: 0x5865F2,
  CLAN_REM: 0xEB459E,
  BAN:      0xFF6B35,
  ERROR:    0x95A5A6
};

async function sendLog(msg, action, color, fields) {
  if (!data.logsChannel) return;
  const logChannel = await client.channels.fetch(data.logsChannel).catch(() => null);
  if (!logChannel) return;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: `${msg.author.username} (${msg.author.id})`, iconURL: msg.author.displayAvatarURL() })
    .setTitle(action)
    .addFields(fields)
    .setTimestamp()
    .setFooter({ text: `#${msg.channel.name}` });
  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

/* ===================== FORMATTERS ===================== */
function formatPlayers() {
  const rows = [...data.players.values()]
    .filter(p => !data.priority.has(playerKey(p)))
    .sort((a, b) => alpha(a.name, b.name))
    .map(p => `${p.name} : ${p.username || 'N/A'}`);
  return rows.length ? rows.join('\n') : 'None';
}

function formatPriority() {
  const rows = [...data.priority]
    .map(u => {
      let p = data.players.get(u);
      if (!p) p = [...data.players.values()].find(pl => playerKey(pl).toLowerCase() === u.toLowerCase());
      return {
        sortKey: p ? p.name : u,
        display: p ? `${p.name} : ${p.username || 'N/A'}` : u
      };
    })
    .sort((a, b) => alpha(a.sortKey, b.sortKey))
    .map(r => r.display);
  return rows.length ? rows.join('\n') : 'None';
}

function formatClans() {
  return data.clans.size
    ? [...data.clans].sort((a, b) => alpha(a, b)).join('\n')
    : 'None';
}

/* ===================== LIST UPDATER ===================== */
let updatingSections = {};

function splitIntoChunks(title, content, revMarker) {
  const MAX_LENGTH = 1900;
  const header = `\`\`\`${title}\n`;
  const footer = `\n\`\`\``;
  const lines  = content.split('\n');
  const chunks = [];
  let cur = '';
  for (const line of lines) {
    const test = cur ? `${cur}\n${line}` : line;
    if (header.length + test.length + footer.length + revMarker.length > MAX_LENGTH && cur) {
      chunks.push(`${header}${cur}${footer}${revMarker}`);
      cur = line;
    } else { cur = test; }
  }
  if (cur) chunks.push(`${header}${cur}${footer}${revMarker}`);
  return chunks.length ? chunks : [`${header}None${footer}${revMarker}`];
}

async function updateKosList(channel, sectionToUpdate = null, forceCreate = false) {
  if (!channel) return;
  const sections = [
    ['players',  '–––––– PLAYERS ––––––',  formatPlayers],
    ['priority', '–––––– PRIORITY ––––––', formatPriority],
    ['clans',    '–––––– CLANS ––––––',    formatClans]
  ];
  for (const [key, title, getContent] of sections) {
    if (sectionToUpdate && key !== sectionToUpdate) continue;
    if (updatingSections[key]) continue;
    updatingSections[key] = true;
    const chunks = splitIntoChunks(title, getContent(), rev());
    if (forceCreate) {
      const newMessages = [];
      for (const chunk of chunks) {
        const m = await channel.send(chunk).catch(() => null);
        if (m) newMessages.push(m.id);
      }
      data.listMessages[key] = newMessages;
    } else {
      const storedIds = data.listMessages[key] || [];
      if (storedIds.length > 0) {
        for (let i = 0; i < Math.max(chunks.length, storedIds.length); i++) {
          if (i < storedIds.length) {
            const m = await channel.messages.fetch(storedIds[i]).catch(() => null);
            if (m) {
              if (i < chunks.length) { await m.edit(chunks[i]).catch(() => {}); }
              else { await m.delete().catch(() => {}); storedIds.splice(i, 1); i--; }
            }
          } else {
            const m = await channel.send(chunks[i]).catch(() => null);
            if (m) storedIds.push(m.id);
          }
        }
        data.listMessages[key] = storedIds.filter(Boolean);
      }
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
^ka name username – Add a player to the KOS list (username optional)
^kr name  – Remove a player from the KOS list

Examples
^ka poison poisonrebuild
^ka poison
^kr poison

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
      const m = await channel.messages.fetch(id).catch(() => null);
      if (m) return (await m.edit({ embeds: [embed] })).id;
    }
    return (await channel.send({ embeds: [embed] })).id;
  }
  data.panelMessages.gif      = await upsert(data.panelMessages.gif,      gif);
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
  const cmd  = args.shift().toLowerCase();

  // Special user handler
  if (msg.author.id === SPECIAL_USER_ID) {
    await msg.channel.send(`<@${msg.author.id}> fuck u kid`);
    await msg.channel.send(SPECIAL_GIF_URL);
    msg.delete().catch(() => {});
    return;
  }

  if (data.bannedUsers.has(msg.author.id) && msg.author.id !== OWNER_ID) {
    return reply(msg, 'You have been banned from using KOS commands.');
  }

  if (data.submissionChannel && msg.channel.id !== data.submissionChannel) {
    const m = await msg.channel.send(`<@${msg.author.id}> Use KOS commands in <#${data.submissionChannel}>.`);
    setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 4000);
    return;
  }

  // ---------- ^ka ----------
  if (cmd === '^ka') {
    const [name, rawUsername] = args;
    if (!name) return reply(msg, 'Missing name.');
    const username = cleanUsername(rawUsername) || null;
    const key      = username || name;

    const duplicate = data.players.has(key)
      || [...data.players.values()].find(p => p.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      await sendLog(msg, '⚠️ Add Player — Already Exists', LOG_COLORS.ERROR, [
        { name: 'Name',     value: name,             inline: true },
        { name: 'Username', value: username || 'N/A', inline: true },
        { name: 'Result',   value: 'Already on KOS list', inline: false }
      ]);
      return reply(msg, `Player already in KOS: ${name}`);
    }

    data.players.set(key, { name, username, addedBy: msg.author.id });
    data.priority.delete(key);
    await updateKosList(msg.channel, 'players');
    await sendLog(msg, '✅ Player Added', LOG_COLORS.ADD, [
      { name: 'Name',     value: name,             inline: true },
      { name: 'Username', value: username || 'N/A', inline: true },
      { name: 'Result',   value: 'Added to KOS list', inline: false }
    ]);
    return reply(msg, `Added ${name}${username ? ` (${username})` : ''}`);
  }

  // ---------- ^kr ----------
  if (cmd === '^kr') {
    const [identifier] = args;
    if (!identifier) return reply(msg, 'Missing name.');
    const player = findPlayer(identifier);
    if (!player) {
      await sendLog(msg, '⚠️ Remove Player — Not Found', LOG_COLORS.ERROR, [
        { name: 'Identifier', value: identifier, inline: true },
        { name: 'Result',     value: 'Player not found', inline: false }
      ]);
      return reply(msg, 'Player not found.');
    }
    if (player.addedBy !== msg.author.id && msg.author.id !== OWNER_ID && !canUsePriority(msg)) {
      await sendLog(msg, '⛔ Remove Player — Permission Denied', LOG_COLORS.ERROR, [
        { name: 'Target', value: player.username || player.name, inline: true },
        { name: 'Result', value: 'User did not add this player', inline: false }
      ]);
      return reply(msg, "You didn't add this player.");
    }
    const removed = playerKey(player);
    data.players.delete(removed);
    data.priority.delete(removed);
    await updateKosList(msg.channel, 'players');
    await updateKosList(msg.channel, 'priority');
    await sendLog(msg, '🗑️ Player Removed', LOG_COLORS.REMOVE, [
      { name: 'Name',     value: player.name,              inline: true },
      { name: 'Username', value: player.username || 'N/A', inline: true },
      { name: 'Result',   value: 'Removed from KOS list',  inline: false }
    ]);
    return reply(msg, `Removed ${player.name}`);
  }

  // ---------- ^kca ----------
  if (cmd === '^kca') {
    const [name, region] = args;
    if (!name)   return reply(msg, 'Missing name and region.');
    if (!region) return reply(msg, 'Missing region.');
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (data.clans.has(clan)) {
      await sendLog(msg, '⚠️ Add Clan — Already Exists', LOG_COLORS.ERROR, [
        { name: 'Name', value: name.toUpperCase(), inline: true },
        { name: 'Region', value: region.toUpperCase(), inline: true },
        { name: 'Result', value: 'Already on KOS list', inline: false }
      ]);
      return reply(msg, `Clan already exists: ${clan}`);
    }
    data.clans.add(clan);
    await updateKosList(msg.channel, 'clans');
    await sendLog(msg, '✅ Clan Added', LOG_COLORS.CLAN_ADD, [
      { name: 'Name', value: name.toUpperCase(), inline: true },
      { name: 'Region', value: region.toUpperCase(), inline: true },
      { name: 'Result', value: 'Clan Added to KOS list', inline: false }
    ]);
    return reply(msg, `Added clan ${clan}`);
  }

  // ---------- ^kcr ----------
  if (cmd === '^kcr') {
    const [name, region] = args;
    if (!name)   return reply(msg, 'Missing name and region.');
    if (!region) return reply(msg, 'Missing region.');
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (data.clans.delete(clan)) {
      await updateKosList(msg.channel, 'clans');
      await sendLog(msg, '🗑️ Clan Removed', LOG_COLORS.CLAN_REM, [
        { name: 'Name', value: name.toUpperCase(), inline: true },
        { name: 'Region', value: region.toUpperCase(), inline: true },
        { name: 'Result', value: 'Clan Removed from KOS list', inline: false }
      ]);
      return reply(msg, `Removed clan ${clan}`);
    } else {
      await sendLog(msg, '⚠️ Remove Clan — Not Found', LOG_COLORS.ERROR, [
        { name: 'Name', value: name.toUpperCase(), inline: true },
        { name: 'Region', value: region.toUpperCase(), inline: true },
        { name: 'Result', value: 'Clan not found', inline: false }
      ]);
      return reply(msg, `Clan not found: ${clan}`);
    }
  }

  // ---------- Priority commands ----------
  if (['^p', '^pr', '^pa'].includes(cmd)) {
    if (!canUsePriority(msg)) return reply(msg, 'You cannot use priority commands.');

    if (cmd === '^pa') {
      const [name, rawUsername] = args;
      if (!name) return reply(msg, 'Missing name.');
      const username = cleanUsername(rawUsername) || null;
      const key      = username || name;
      const duplicate = data.players.has(key)
        || [...data.players.values()].find(p => p.name.toLowerCase() === name.toLowerCase());
      if (duplicate) return reply(msg, `Player already exists: ${name}`);
      data.players.set(key, { name, username, addedBy: msg.author.id });
      data.priority.add(key);
      await updateKosList(msg.channel, 'players');
      await updateKosList(msg.channel, 'priority');
      await sendLog(msg, '⭐ Player Added to Priority (Direct)', LOG_COLORS.PRIORITY, [
        { name: 'Name',     value: name,             inline: true },
        { name: 'Username', value: username || 'N/A', inline: true },
        { name: 'Result',   value: 'Added directly to Priority', inline: false }
      ]);
      return reply(msg, `Added ${name}${username ? ` (${username})` : ''} directly to priority`);
    }

    const [identifier] = args;
    if (!identifier) return reply(msg, 'Missing name.');
    const player = findPlayer(identifier);
    if (!player) return reply(msg, 'Player not found.');

    if (cmd === '^p') {
      const key = playerKey(player);
      data.priority.add(key);
      await updateKosList(msg.channel, 'players');
      await updateKosList(msg.channel, 'priority');
      await sendLog(msg, '⭐ Player Promoted to Priority', LOG_COLORS.PRIORITY, [
        { name: 'Name',     value: player.name,              inline: true },
        { name: 'Username', value: player.username || 'N/A', inline: true },
        { name: 'Result',   value: 'Promoted to Priority',   inline: false }
      ]);
      return reply(msg, `Promoted ${player.name} to priority`);
    }

    if (cmd === '^pr') {
      const key       = playerKey(player);
      const actualKey = [...data.priority].find(k => k.toLowerCase() === key.toLowerCase()) || key;
      data.priority.delete(actualKey);
      if (!player._orphaned) await updateKosList(msg.channel, 'players');
      await updateKosList(msg.channel, 'priority');
      await sendLog(msg, '🔻 Player Removed from Priority', LOG_COLORS.REMOVE, [
        { name: 'Name',     value: player.name,              inline: true },
        { name: 'Username', value: player.username || 'N/A', inline: true },
        { name: 'Result',   value: 'Removed from Priority',  inline: false }
      ]);
      return reply(msg, `Removed ${player.name} from priority`);
    }
  }
});

/* ===================== SLASH COMMANDS (OWNER ONLY) ===================== */
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;

  // Owner-only gate: must be owner ID or have the owner role
  if (!isOwner(i)) {
    return i.reply({ content: '❌ You are not the owner.', flags: 64 });
  }

  if (i.commandName === 'submission') {
    data.submissionChannel = i.channel.id;
    saveData();
    return i.reply({ content: `✅ KOS submission commands locked to <#${i.channel.id}>`, flags: 64 });
  }

  if (i.commandName === 'logs') {
    data.logsChannel = i.channel.id;
    saveData();
    return i.reply({ content: `✅ KOS logs will be sent to <#${i.channel.id}>`, flags: 64 });
  }

  if (i.commandName === 'backup') {
    await i.deferReply({ flags: 64 });
    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        parseRaw(raw);
        console.log('[/backup] Reloaded from local data.json');
      } catch (e) {
        console.warn('[/backup] Could not read local data.json:', e.message);
      }
    }
    data.backupChannel   = i.channel.id;
    data.backupMessageId = null;
    await pushBackup();
    return i.editReply({ content: `✅ Backup channel set to <#${i.channel.id}>. Current data.json pushed as backup.` });
  }

  if (i.commandName === 'save') {
    await i.deferReply({ flags: 64 });
    await pushBackup();
    return i.editReply({ content: '✅ List manually saved to backup channel.' });
  }

  if (i.commandName === 'list') {
    await i.deferReply({ flags: 64 });
    if (!data.backupChannel) {
      return i.editReply({ content: '❌ No backup channel set. Use `/backup` first.' });
    }
    try {
      const ch        = await client.channels.fetch(data.backupChannel);
      const messages  = await ch.messages.fetch({ limit: 20 });
      const backupMsg = messages.find(m => m.attachments.some(a => a.name === 'data.json'));
      if (!backupMsg) {
        return i.editReply({ content: '❌ No backup found in the backup channel. Use `/save` first.' });
      }
      const att = backupMsg.attachments.find(a => a.name === 'data.json');
      const res  = await fetch(att.url);
      const raw  = await res.json();
      parseRaw(raw);
      console.log(`[/list] Reloaded from backup msg ${backupMsg.id}`);
    } catch (e) {
      console.error('[/list] Failed to reload from backup:', e.message);
      return i.editReply({ content: '❌ Failed to load from backup channel.' });
    }
    await updateKosList(i.channel, null, true);
    return i.editReply({ content: '✅ KOS list created from latest backup.' });
  }

  if (i.commandName === 'panel') {
    await i.deferReply({ flags: 64 });
    await updatePanel(i.channel);
    return i.editReply({ content: '✅ Panel updated.' });
  }

  if (i.commandName === 'say') {
    const text = i.options.getString('text');
    await i.channel.send(text);
    return i.reply({ content: '✅ Message sent.', flags: 64 });
  }

  if (i.commandName === 'setrole') {
    const role = i.options.getRole('role');
    data.ownerRoleId = role.id;
    saveData();
    return i.reply({ content: `✅ Owner role set to <@&${role.id}>. Members with this role can use all slash commands.`, flags: 64 });
  }

  if (i.commandName === 'ban') {
    const target = i.options.getUser('user');
    if (target.id === OWNER_ID)          return i.reply({ content: '❌ You cannot ban the bot owner.', flags: 64 });
    if (data.bannedUsers.has(target.id)) return i.reply({ content: `⚠️ ${target.username} is already banned.`, flags: 64 });
    data.bannedUsers.add(target.id);
    saveData();
    if (data.logsChannel) {
      const logCh = await client.channels.fetch(data.logsChannel).catch(() => null);
      if (logCh) {
        await logCh.send({ embeds: [new EmbedBuilder()
          .setColor(LOG_COLORS.BAN)
          .setAuthor({ name: `${i.user.username} (${i.user.id})`, iconURL: i.user.displayAvatarURL() })
          .setTitle('🔨 User Banned from KOS Commands')
          .addFields({ name: 'Banned User', value: `${target.username} (${target.id})`, inline: true })
          .setTimestamp()
        ]}).catch(() => {});
      }
    }
    return i.reply({ content: `🔨 **${target.username}** has been banned from using KOS commands.`, flags: 64 });
  }

  if (i.commandName === 'unban') {
    const target = i.options.getUser('user');
    if (!data.bannedUsers.has(target.id)) return i.reply({ content: `⚠️ ${target.username} is not currently banned.`, flags: 64 });
    data.bannedUsers.delete(target.id);
    saveData();
    if (data.logsChannel) {
      const logCh = await client.channels.fetch(data.logsChannel).catch(() => null);
      if (logCh) {
        await logCh.send({ embeds: [new EmbedBuilder()
          .setColor(LOG_COLORS.ADD)
          .setAuthor({ name: `${i.user.username} (${i.user.id})`, iconURL: i.user.displayAvatarURL() })
          .setTitle('✅ User Unbanned from KOS Commands')
          .addFields({ name: 'Unbanned User', value: `${target.username} (${target.id})`, inline: true })
          .setTimestamp()
        ]}).catch(() => {});
      }
    }
    return i.reply({ content: `✅ **${target.username}** has been unbanned from KOS commands.`, flags: 64 });
  }
});

/* ===================== AUTO-SAVE EVERY 10 HOURS ===================== */
setInterval(async () => {
  console.log(`[AutoSave] Triggered at ${new Date().toISOString()}`);
  await pushBackup();
}, 10 * 60 * 60 * 1000);

/* ===================== DUMMY SERVER FOR RENDER ===================== */
const PORT = process.env.PORT || 3000;
require('http').createServer((req, res) => res.end('Bot running')).listen(PORT);

/* ===================== LOGIN + LOAD ===================== */
client.once('ready', async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);
  await loadData();
});

client.login(process.env.TOKEN);
