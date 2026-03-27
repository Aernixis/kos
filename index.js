const express = require('express')
const app = express()
app.get('/', (req, res) => res.send('Bot is alive!'))
app.listen(3000)
process.on('uncaughtException', err => console.error('[CRASH]', err));
process.on('unhandledRejection', err => console.error('[REJECTION]', err));
console.log('[Startup] Process started');
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
const OWNER_ID           = '1283217337084018749';
const PRIORITY_ROLE_ID   = '1412837397607092405';
const DATA_FILE          = './data.json';
const SPECIAL_USER_ID    = '760369177180897290';
const SPECIAL_GIF_URL    = 'https://tenor.com/view/chainsawman-chainsaw-man-reze-reze-arc-chainsaw-man-reze-gif-13447210726051357373';
const SUBMISSION_CHANNEL = '1450867784543113318';
const LOGS_CHANNEL       = '1473800222927880223';
const BACKUP_CHANNEL     = '1475960780976292051';

/* ===================== STATE ===================== */
let prefixEnabled = true;

// Hard dedup guard — prevents double-firing if event somehow triggers twice
const handledMessages = new Set();

/* ===================== DATA ===================== */
let data = {
  players:         new Map(),
  priority:        new Set(),
  clans:           new Set(),
  bannedUsers:     new Set(),
  backupMessageId: null,
  listMessages:    { players: [], priority: [], clans: [] },
  panelMessages:   { gif: null, tutorial: null },
  ownerRoleId:     null,
  revision:        0
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

function cleanUsername(u) {
  if (!u || u.trim() === '' || u === 'N/A') return null;
  return u.trim();
}

function playerKey(p) {
  return cleanUsername(p.username) || p.name;
}

const alpha = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });

function sortData() {
  const sortedPlayers = [...data.players.values()].sort((a, b) => alpha(a.name, b.name));
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
  const byName = [...data.players.values()].find(p => p.name.toLowerCase() === id);
  if (byName) return byName;
  const byUsername = [...data.players.values()].find(p => p.username && p.username.toLowerCase() === id);
  if (byUsername) return byUsername;
  const priorityKey = [...data.priority].find(k => k.toLowerCase() === id);
  if (priorityKey) return { name: priorityKey, username: null, addedBy: null, _orphaned: true };
  return null;
}

function removePlayerEverywhere(identifier) {
  const id = identifier.toLowerCase();
  const removed = [];

  for (const [key, player] of [...data.players.entries()]) {
    if (
      player.name.toLowerCase() === id ||
      (player.username && player.username.toLowerCase() === id) ||
      key.toLowerCase() === id
    ) {
      removed.push(player);
      data.players.delete(key);
    }
  }

  const removedIdentifiers = new Set([id]);
  for (const p of removed) {
    removedIdentifiers.add(p.name.toLowerCase());
    if (p.username) removedIdentifiers.add(p.username.toLowerCase());
  }
  for (const key of [...data.priority]) {
    if (removedIdentifiers.has(key.toLowerCase())) data.priority.delete(key);
  }

  if (removed.length === 0) {
    let foundOrphaned = false;
    for (const key of [...data.priority]) {
      if (key.toLowerCase() === id) { data.priority.delete(key); foundOrphaned = true; }
    }
    if (foundOrphaned) removed.push({ name: identifier, username: null, addedBy: null, _orphaned: true });
  }

  return removed;
}

/* ===================== BUILD / PARSE ===================== */
function buildPayload() {
  sortData();
  return JSON.stringify({
    players:         [...data.players.values()].map(p => ({
      name:     p.name,
      username: cleanUsername(p.username) || null,
      addedBy:  p.addedBy
    })),
    priority:        [...data.priority],
    clans:           [...data.clans],
    bannedUsers:     [...data.bannedUsers],
    backupMessageId: data.backupMessageId,
    listMessages:    data.listMessages,
    panelMessages:   data.panelMessages,
    ownerRoleId:     data.ownerRoleId,
    revision:        data.revision
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

  data.clans           = new Set(raw.clans       || []);
  data.bannedUsers     = new Set(raw.bannedUsers || []);
  data.backupMessageId = raw.backupMessageId     || null;
  data.ownerRoleId     = raw.ownerRoleId         || null;

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

  sortData();
}

/* ===================== SAVE / LOAD ===================== */
async function pushBackup() {
  const payload = buildPayload();
  try { fs.writeFileSync(DATA_FILE, payload); } catch (e) { console.error('[Backup] Local write failed:', e.message); }

  try {
    const ch = await client.channels.fetch(BACKUP_CHANNEL).catch(() => null);
    if (!ch) return;

    // Wipe all messages then post fresh
    let fetched;
    do {
      fetched = await ch.messages.fetch({ limit: 100 });
      if (fetched.size === 0) break;
      for (const m of fetched.values()) await m.delete().catch(() => {});
    } while (fetched.size >= 2);

    const buf        = Buffer.from(payload, 'utf8');
    const attachment = new AttachmentBuilder(buf, { name: 'data.json' });
    const content    = `Last save: <t:${Math.floor(Date.now() / 1000)}:F>`;
    const sent       = await ch.send({ content, files: [attachment] });
    data.backupMessageId = sent.id;
    fs.writeFileSync(DATA_FILE, buildPayload());
    console.log(`[Backup] Pushed at ${new Date().toISOString()} (msg ${sent.id})`);
  } catch (e) { console.error('[Backup] Discord push failed:', e.message); }
}

function schedule24hBackup() {
  setInterval(async () => {
    console.log(`[AutoBackup] 24h tick — ${new Date().toISOString()}`);
    await pushBackup();
  }, 24 * 60 * 60 * 1000);
}

let _pendingChanges = 0;
let _saveTimer = null;

function saveData() {
  _pendingChanges++;
  if (_pendingChanges >= 5) {
    _pendingChanges = 0;
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    pushBackup();
    return;
  }
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

  try {
    const ch        = await client.channels.fetch(BACKUP_CHANNEL);
    const messages  = await ch.messages.fetch({ limit: 20 });
    const backupMsg = messages.find(m => m.attachments.some(a => a.name === 'data.json'));
    if (!backupMsg) { console.warn('[Load] No backup found. Starting fresh.'); return; }

    const att = backupMsg.attachments.find(a => a.name === 'data.json');
    const res  = await fetch(att.url);
    const raw  = await res.json();
    parseRaw(raw);
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

function getAvatarURL(user) {
  if (!user.avatar) return user.defaultAvatarURL;
  if (user.avatar.startsWith('a_')) return user.displayAvatarURL({ extension: 'gif', forceStatic: false, size: 128 });
  return user.displayAvatarURL({ extension: 'png', size: 128 });
}

async function sendLog(msg, action, color, fields) {
  try {
    const logChannel = await client.channels.fetch(LOGS_CHANNEL).catch(() => null);
    if (!logChannel) return;
    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: `${msg.author.username} (${msg.author.id})`, iconURL: getAvatarURL(msg.author) })
      .setTitle(action)
      .addFields(fields)
      .setTimestamp()
      .setFooter({ text: `#${msg.channel.name}` });
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  } catch (e) {}
}

/* ===================== FORMATTERS ===================== */
function formatPlayerRow(name, username) {
  return username ? `${name} @${username}` : name;
}

function formatPlayers() {
  const rows = [...data.players.values()]
    .filter(p => !data.priority.has(playerKey(p)))
    .sort((a, b) => alpha(a.name, b.name))
    .map(p => formatPlayerRow(p.name, p.username));
  return rows.length ? rows.join('\n') : 'None';
}

function formatPriority() {
  const rows = [...data.priority]
    .map(u => {
      let p = data.players.get(u);
      if (!p) p = [...data.players.values()].find(pl => playerKey(pl).toLowerCase() === u.toLowerCase());
      return {
        sortKey: p ? p.name : u,
        display: p ? formatPlayerRow(p.name, p.username) : u
      };
    })
    .sort((a, b) => alpha(a.sortKey, b.sortKey))
    .map(r => r.display);
  return rows.length ? rows.join('\n') : 'None';
}

function formatClans() {
  return data.clans.size ? [...data.clans].sort((a, b) => alpha(a, b)).join('\n') : 'None';
}

/* ===================== LIST UPDATER ===================== */
const updatingSections = {};

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
    try {
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
        // If no storedIds and not forceCreate, do nothing — prevents phantom new messages
      }
    } finally {
      updatingSections[key] = false;
    }
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

  // Hard dedup — if we've already handled this exact message ID, ignore it
  if (handledMessages.has(msg.id)) return;
  handledMessages.add(msg.id);
  setTimeout(() => handledMessages.delete(msg.id), 10000);

  const args = msg.content.trim().split(/\s+/);
  const cmd  = args.shift().toLowerCase();

  // Special user — always fires regardless of enabled state
  if (msg.author.id === SPECIAL_USER_ID) {
    await msg.channel.send(`<@${msg.author.id}> fuck u kid`);
    await msg.channel.send(SPECIAL_GIF_URL);
    msg.delete().catch(() => {});
    return;
  }

  // Disabled state — non-owners get the holding message
  if (!prefixEnabled && msg.author.id !== OWNER_ID) {
    const m = await msg.channel.send('schwanz is disabled im fixing it plz wait');
    setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 5000);
    return;
  }

  if (data.bannedUsers.has(msg.author.id) && msg.author.id !== OWNER_ID) {
    return reply(msg, 'You have been banned from using KOS commands.');
  }

  if (msg.channel.id !== SUBMISSION_CHANNEL) {
    const m = await msg.channel.send(`<@${msg.author.id}> Use KOS commands in <#${SUBMISSION_CHANNEL}>.`);
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
        { name: 'Name',     value: name,              inline: true },
        { name: 'Username', value: username || 'N/A', inline: true },
        { name: 'Result',   value: 'Already on KOS list', inline: false }
      ]);
      return reply(msg, `Player already in KOS: ${name}`);
    }

    data.players.set(key, { name, username, addedBy: msg.author.id });
    data.priority.delete(key);
    await updateKosList(msg.channel, 'players');
    await sendLog(msg, '✅ Player Added', LOG_COLORS.ADD, [
      { name: 'Name',     value: name,              inline: true },
      { name: 'Username', value: username || 'N/A', inline: true },
      { name: 'Result',   value: 'Added to KOS list', inline: false }
    ]);
    return reply(msg, `Added ${name}${username ? ` (${username})` : ''}`);
  }

  // ---------- ^kr ----------
  if (cmd === '^kr') {
    const [identifier] = args;
    if (!identifier) return reply(msg, 'Missing name.');

    const playerCheck = findPlayer(identifier);
    if (!playerCheck) {
      await sendLog(msg, '⚠️ Remove Player — Not Found', LOG_COLORS.ERROR, [
        { name: 'Identifier', value: identifier, inline: true },
        { name: 'Result',     value: 'Player not found', inline: false }
      ]);
      return reply(msg, 'Player not found.');
    }

    if (
      !playerCheck._orphaned &&
      playerCheck.addedBy !== msg.author.id &&
      msg.author.id !== OWNER_ID &&
      !canUsePriority(msg)
    ) {
      await sendLog(msg, '⛔ Remove Player — Permission Denied', LOG_COLORS.ERROR, [
        { name: 'Target', value: playerCheck.username || playerCheck.name, inline: true },
        { name: 'Result', value: 'User did not add this player', inline: false }
      ]);
      return reply(msg, "You didn't add this player.");
    }

    const removedList = removePlayerEverywhere(identifier);
    await updateKosList(msg.channel, 'players');
    await updateKosList(msg.channel, 'priority');

    const primary = removedList[0] || playerCheck;
    await sendLog(msg, '🗑️ Player Removed', LOG_COLORS.REMOVE, [
      { name: 'Name',     value: primary.name,              inline: true },
      { name: 'Username', value: primary.username || 'N/A', inline: true },
      { name: 'Result',   value: `Fully removed (${removedList.length} entr${removedList.length === 1 ? 'y' : 'ies'} cleared)`, inline: false }
    ]);
    return reply(msg, `Removed ${primary.name}`);
  }

  // ---------- ^kca ----------
  if (cmd === '^kca') {
    const [name, region] = args;
    if (!name)   return reply(msg, 'Missing name and region.');
    if (!region) return reply(msg, 'Missing region.');
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (data.clans.has(clan)) {
      await sendLog(msg, '⚠️ Add Clan — Already Exists', LOG_COLORS.ERROR, [
        { name: 'Name',   value: name.toUpperCase(),   inline: true },
        { name: 'Region', value: region.toUpperCase(), inline: true },
        { name: 'Result', value: 'Already on KOS list', inline: false }
      ]);
      return reply(msg, `Clan already exists: ${clan}`);
    }
    data.clans.add(clan);
    await updateKosList(msg.channel, 'clans');
    await sendLog(msg, '✅ Clan Added', LOG_COLORS.CLAN_ADD, [
      { name: 'Name',   value: name.toUpperCase(),   inline: true },
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
        { name: 'Name',   value: name.toUpperCase(),   inline: true },
        { name: 'Region', value: region.toUpperCase(), inline: true },
        { name: 'Result', value: 'Clan Removed from KOS list', inline: false }
      ]);
      return reply(msg, `Removed clan ${clan}`);
    } else {
      await sendLog(msg, '⚠️ Remove Clan — Not Found', LOG_COLORS.ERROR, [
        { name: 'Name',   value: name.toUpperCase(),   inline: true },
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
        { name: 'Name',     value: name,              inline: true },
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
      const identifiers = new Set([playerKey(player).toLowerCase(), player.name.toLowerCase()]);
      if (player.username) identifiers.add(player.username.toLowerCase());
      for (const k of [...data.priority]) {
        if (identifiers.has(k.toLowerCase())) data.priority.delete(k);
      }
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

  if (!isOwner(i)) {
    return i.reply({ content: '❌ You are not the owner.', flags: 64 });
  }

  // ---------- /enable ----------
  if (i.commandName === 'enable') {
    prefixEnabled = true;
    return i.reply({ content: '✅ Prefix commands have been **enabled**.', flags: 64 });
  }

  // ---------- /disable ----------
  if (i.commandName === 'disable') {
    prefixEnabled = false;
    return i.reply({ content: '🔴 Prefix commands have been **disabled**.', flags: 64 });
  }

  // ---------- /backup ----------
  if (i.commandName === 'backup') {
    await i.deferReply({ flags: 64 });
    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        parseRaw(raw);
      } catch (e) { console.warn('[/backup] Could not read local data.json:', e.message); }
    }
    await pushBackup();
    return i.editReply({ content: `✅ Backup pushed to <#${BACKUP_CHANNEL}>.` });
  }

  // ---------- /list ----------
  if (i.commandName === 'list') {
    await i.deferReply({ flags: 64 });
    try {
      const ch        = await client.channels.fetch(BACKUP_CHANNEL);
      const messages  = await ch.messages.fetch({ limit: 20 });
      const backupMsg = messages.find(m => m.attachments.some(a => a.name === 'data.json'));
      if (!backupMsg) return i.editReply({ content: '❌ No backup found. Use `/backup` first.' });
      const att = backupMsg.attachments.find(a => a.name === 'data.json');
      const res  = await fetch(att.url);
      const raw  = await res.json();
      parseRaw(raw);
    } catch (e) {
      console.error('[/list] Failed:', e.message);
      return i.editReply({ content: '❌ Failed to load from backup channel.' });
    }
    await updateKosList(i.channel, null, true);
    return i.editReply({ content: '✅ KOS list created from latest backup.' });
  }

  // ---------- /clear ----------
  if (i.commandName === 'clear') {
    await i.deferReply({ flags: 64 });
    try {
      let totalDeleted = 0;
      let fetched;
      do {
        fetched = await i.channel.messages.fetch({ limit: 100 });
        const nonBotMessages = fetched.filter(m => m.author.id !== client.user.id);
        if (nonBotMessages.size === 0) break;
        for (const m of nonBotMessages.values()) {
          await m.delete().catch(() => {});
          totalDeleted++;
        }
      } while (fetched.size >= 2);
      return i.editReply({ content: `✅ Cleared ${totalDeleted} non-bot message${totalDeleted !== 1 ? 's' : ''}.` });
    } catch (e) {
      return i.editReply({ content: '❌ Failed to clear messages.' });
    }
  }

  // ---------- /panel ----------
  if (i.commandName === 'panel') {
    await i.deferReply({ flags: 64 });
    await updatePanel(i.channel);
    return i.editReply({ content: '✅ Panel updated.' });
  }

  // ---------- /say ----------
  if (i.commandName === 'say') {
    const text = i.options.getString('text');
    await i.channel.send(text);
    return i.reply({ content: '✅ Message sent.', flags: 64 });
  }

  // ---------- /setrole ----------
  if (i.commandName === 'setrole') {
    const role = i.options.getRole('role');
    data.ownerRoleId = role.id;
    saveData();
    return i.reply({ content: `✅ Owner role set to <@&${role.id}>.`, flags: 64 });
  }

  // ---------- /ban ----------
  if (i.commandName === 'ban') {
    const target = i.options.getUser('user');
    if (target.id === OWNER_ID)          return i.reply({ content: '❌ You cannot ban the bot owner.', flags: 64 });
    if (data.bannedUsers.has(target.id)) return i.reply({ content: `⚠️ ${target.username} is already banned.`, flags: 64 });
    data.bannedUsers.add(target.id);
    saveData();
    try {
      const logCh = await client.channels.fetch(LOGS_CHANNEL).catch(() => null);
      if (logCh) await logCh.send({ embeds: [new EmbedBuilder()
        .setColor(LOG_COLORS.BAN)
        .setAuthor({ name: `${i.user.username} (${i.user.id})`, iconURL: getAvatarURL(i.user) })
        .setTitle('🔨 User Banned from KOS Commands')
        .addFields({ name: 'Banned User', value: `${target.username} (${target.id})`, inline: true })
        .setTimestamp()
      ]}).catch(() => {});
    } catch (e) {}
    return i.reply({ content: `🔨 **${target.username}** has been banned.`, flags: 64 });
  }

  // ---------- /unban ----------
  if (i.commandName === 'unban') {
    const target = i.options.getUser('user');
    if (!data.bannedUsers.has(target.id)) return i.reply({ content: `⚠️ ${target.username} is not currently banned.`, flags: 64 });
    data.bannedUsers.delete(target.id);
    saveData();
    try {
      const logCh = await client.channels.fetch(LOGS_CHANNEL).catch(() => null);
      if (logCh) await logCh.send({ embeds: [new EmbedBuilder()
        .setColor(LOG_COLORS.ADD)
        .setAuthor({ name: `${i.user.username} (${i.user.id})`, iconURL: getAvatarURL(i.user) })
        .setTitle('✅ User Unbanned from KOS Commands')
        .addFields({ name: 'Unbanned User', value: `${target.username} (${target.id})`, inline: true })
        .setTimestamp()
      ]}).catch(() => {});
    } catch (e) {}
    return i.reply({ content: `✅ **${target.username}** has been unbanned.`, flags: 64 });
  }
});

/* ===================== DUMMY SERVER FOR RENDER ===================== */
const PORT = process.env.PORT || 3000;
require('http').createServer((req, res) => res.end('Bot running')).listen(PORT);

/* ===================== LOGIN + LOAD ===================== */
client.once('ready', async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);
  await loadData();
  schedule24hBackup();
  console.log('[Bot] Ready. 24h auto-backup scheduled.');
});

client.login(process.env.BOT_TOKEN);
