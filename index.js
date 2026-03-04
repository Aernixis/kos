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
const DEDUP_FILE         = './dedup.json';
const SPECIAL_USER_ID    = '760369177180897290';
const SPECIAL_GIF_URL    = 'https://tenor.com/view/chainsawman-chainsaw-man-reze-reze-arc-chainsaw-man-reze-gif-13447210726051357373';
const SUBMISSION_CHANNEL = '1450867784543113318';
const LOGS_CHANNEL       = '1473800222927880223';
const BACKUP_CHANNEL     = '1475960780976292051';
const DEDUP_TTL_MS       = 30_000;

/* ===================== DEDUP (file-backed) ===================== */
// Written to disk so it survives process restarts and catches duplicate
// gateway events that arrive in the same JS tick (immune to in-memory races).
let dedupStore = {};

function loadDedup() {
  try { if (fs.existsSync(DEDUP_FILE)) dedupStore = JSON.parse(fs.readFileSync(DEDUP_FILE, 'utf8')); }
  catch { dedupStore = {}; }
  pruneDedup();
}

function pruneDedup() {
  const now = Date.now();
  let changed = false;
  for (const id of Object.keys(dedupStore)) {
    if (dedupStore[id] < now) { delete dedupStore[id]; changed = true; }
  }
  if (changed) flushDedup();
}

function flushDedup() {
  try { fs.writeFileSync(DEDUP_FILE, JSON.stringify(dedupStore)); } catch {}
}

// Returns true if the message ID is new and claims it. Returns false if already seen.
function claimMessage(msgId) {
  pruneDedup();
  if (dedupStore[msgId]) return false;
  dedupStore[msgId] = Date.now() + DEDUP_TTL_MS;
  flushDedup();
  return true;
}

/* ===================== COMMAND QUEUE ===================== */
// Serialises handler execution so two concurrent gateway fires for the
// same message (which both pass claimMessage due to fs latency) can't
// both run the command body at the same time.
const cmdQueue = [];
let cmdRunning = false;

function enqueueCommand(fn) {
  cmdQueue.push(fn);
  if (!cmdRunning) drainQueue();
}

async function drainQueue() {
  if (cmdRunning || cmdQueue.length === 0) return;
  cmdRunning = true;
  while (cmdQueue.length > 0) {
    try { await cmdQueue.shift()(); } catch (e) { console.error('[Queue]', e); }
  }
  cmdRunning = false;
}

/* ===================== STATE ===================== */
let prefixEnabled = true;

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
  const sorted = [...data.players.values()].sort((a, b) => alpha(a.name, b.name));
  data.players  = new Map(sorted.map(p => [playerKey(p), p]));
  const sortedP = [...data.priority].sort((a, b) => {
    const pa = [...data.players.values()].find(p => playerKey(p).toLowerCase() === a.toLowerCase());
    const pb = [...data.players.values()].find(p => playerKey(p).toLowerCase() === b.toLowerCase());
    return alpha(pa ? pa.name : a, pb ? pb.name : b);
  });
  data.priority = new Set(sortedP);
  data.clans    = new Set([...data.clans].sort(alpha));
}

function findPlayer(identifier) {
  const id     = identifier.toLowerCase();
  const byName = [...data.players.values()].find(p => p.name.toLowerCase() === id);
  if (byName) return byName;
  const byUser = [...data.players.values()].find(p => p.username && p.username.toLowerCase() === id);
  if (byUser) return byUser;
  const orphan = [...data.priority].find(k => k.toLowerCase() === id);
  if (orphan) return { name: orphan, username: null, addedBy: null, _orphaned: true };
  return null;
}

/* ===================== BUILD / PARSE ===================== */
function buildPayload() {
  sortData();
  return JSON.stringify({
    players:         [...data.players.values()].map(p => ({ name: p.name, username: cleanUsername(p.username) || null, addedBy: p.addedBy })),
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
  (raw.players || []).forEach(p => {
    const uname = cleanUsername(p.username);
    data.players.set(uname || p.name, { name: p.name, username: uname, addedBy: p.addedBy });
  });
  data.priority = new Set();
  (raw.topPriority || []).forEach(u => u && data.priority.add(u));
  (raw.priority    || []).forEach(u => u && data.priority.add(u));
  data.clans           = new Set(raw.clans       || []);
  data.bannedUsers     = new Set(raw.bannedUsers || []);
  data.backupMessageId = raw.backupMessageId     || null;
  data.ownerRoleId     = raw.ownerRoleId         || null;
  const msgs = raw.listMessages || raw.messages || {};
  data.listMessages = {
    players:  Array.isArray(msgs.players)  ? msgs.players  : (msgs.players  ? [msgs.players]  : []),
    priority: Array.isArray(msgs.priority) ? msgs.priority : (msgs.priority ? [msgs.priority] : []),
    clans:    Array.isArray(msgs.clans)    ? msgs.clans    : (msgs.clans    ? [msgs.clans]    : [])
  };
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
    let fetched;
    do {
      fetched = await ch.messages.fetch({ limit: 100 });
      if (fetched.size === 0) break;
      for (const m of fetched.values()) await m.delete().catch(() => {});
    } while (fetched.size >= 2);
    const sent = await ch.send({
      content: `Last save: <t:${Math.floor(Date.now() / 1000)}:F>`,
      files:   [new AttachmentBuilder(Buffer.from(payload, 'utf8'), { name: 'data.json' })]
    });
    data.backupMessageId = sent.id;
    fs.writeFileSync(DATA_FILE, buildPayload());
    console.log(`[Backup] Pushed (msg ${sent.id})`);
  } catch (e) { console.error('[Backup] Discord push failed:', e.message); }
}

function schedule24hBackup() {
  setInterval(() => { console.log('[AutoBackup] 24h tick'); pushBackup(); }, 24 * 60 * 60 * 1000);
}

let _pendingChanges = 0;
function saveData() {
  _pendingChanges++;
  if (_pendingChanges >= 10) { _pendingChanges = 0; pushBackup(); }
}

async function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try { parseRaw(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); console.log('[Load] Loaded local'); return; }
    catch (e) { console.warn('[Load] Local corrupt:', e.message); }
  }
  try {
    const ch  = await client.channels.fetch(BACKUP_CHANNEL);
    const msg = (await ch.messages.fetch({ limit: 20 })).find(m => m.attachments.some(a => a.name === 'data.json'));
    if (!msg) { console.warn('[Load] No backup.'); return; }
    const raw = await (await fetch(msg.attachments.find(a => a.name === 'data.json').url)).json();
    parseRaw(raw);
    data.backupMessageId = msg.id;
    fs.writeFileSync(DATA_FILE, buildPayload());
    console.log(`[Load] Loaded from Discord (msg ${msg.id})`);
  } catch (e) { console.error('[Load] Discord load failed:', e.message); }
}

/* ===================== LOGGER ===================== */
const LOG_COLORS = { ADD: 0x57F287, REMOVE: 0xED4245, PRIORITY: 0xFEE75C, CLAN_ADD: 0x5865F2, CLAN_REM: 0xEB459E, BAN: 0xFF6B35, ERROR: 0x95A5A6 };

function getAvatarURL(user) {
  if (!user.avatar) return user.defaultAvatarURL;
  if (user.avatar.startsWith('a_')) return user.displayAvatarURL({ extension: 'gif', forceStatic: false, size: 128 });
  return user.displayAvatarURL({ extension: 'png', size: 128 });
}

async function sendLog(msg, action, color, fields) {
  try {
    const ch = await client.channels.fetch(LOGS_CHANNEL).catch(() => null);
    if (!ch) return;
    await ch.send({ embeds: [new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: `${msg.author.username} (${msg.author.id})`, iconURL: getAvatarURL(msg.author) })
      .setTitle(action).addFields(fields).setTimestamp()
      .setFooter({ text: `#${msg.channel.name}` })
    ]}).catch(() => {});
  } catch {}
}

/* ===================== FORMATTERS ===================== */
function formatPlayers() {
  const prio = new Set([...data.priority].map(k => k.toLowerCase()));
  const rows = [...data.players.values()]
    .filter(p => !prio.has(playerKey(p).toLowerCase()))
    .sort((a, b) => alpha(a.name, b.name))
    .map(p => p.username ? `${p.name} : ${p.username}` : p.name);
  return rows.length ? rows.join('\n') : 'None';
}

function formatPriority() {
  const rows = [...data.priority].map(u => {
    const p = data.players.get(u) || [...data.players.values()].find(pl => playerKey(pl).toLowerCase() === u.toLowerCase());
    return { sort: p ? p.name : u, text: p ? (p.username ? `${p.name} @${p.username}` : p.name) : u };
  }).sort((a, b) => alpha(a.sort, b.sort)).map(r => r.text);
  return rows.length ? rows.join('\n') : 'None';
}

function formatClans() {
  return data.clans.size ? [...data.clans].sort(alpha).join('\n') : 'None';
}

/* ===================== LIST UPDATER ===================== */
const updatingSections = {};

const SECTION_HEADER = {
  players:  '\u2013\u2013\u2013\u2013\u2013\u2013 PLAYERS \u2013\u2013\u2013\u2013\u2013\u2013',
  priority: '\u2013\u2013\u2013\u2013\u2013\u2013 PRIORITY \u2013\u2013\u2013\u2013\u2013\u2013',
  clans:    '\u2013\u2013\u2013\u2013\u2013\u2013 CLANS \u2013\u2013\u2013\u2013\u2013\u2013'
};
const SECTION_FORMAT = { players: formatPlayers, priority: formatPriority, clans: formatClans };

async function reconcileListMessages() {
  const channel = await client.channels.fetch(SUBMISSION_CHANNEL).catch(() => null);
  if (!channel) return;
  const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!fetched) return;

  const botMsgs = [...fetched.values()]
    .filter(m => m.author.id === client.user.id && m.content.startsWith('```'))
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const found = { players: [], priority: [], clans: [] };
  for (const m of botMsgs) {
    for (const [key, header] of Object.entries(SECTION_HEADER)) {
      if (m.content.includes(header)) { found[key].push(m.id); break; }
    }
  }

  // Delete older duplicates, keep only the most recent per section
  let changed = false;
  for (const key of ['players', 'priority', 'clans']) {
    if (found[key].length > 1) {
      for (const id of found[key].slice(0, -1)) {
        const m = await channel.messages.fetch(id).catch(() => null);
        if (m) await m.delete().catch(() => {});
      }
      found[key] = [found[key].at(-1)];
    }
    if (found[key].length > 0) {
      const stored = data.listMessages[key] || [];
      const same = stored.length === found[key].length && stored.every((id, i) => id === found[key][i]);
      if (!same) { data.listMessages[key] = found[key]; changed = true; }
    }
  }
  if (changed) saveData();
  console.log('[Reconcile] Done.');
}

function splitIntoChunks(title, content, revMarker) {
  const MAX = 1900;
  const hdr = `\`\`\`${title}\n`;
  const ftr = `\n\`\`\``;
  const chunks = [];
  let cur = '';
  for (const line of content.split('\n')) {
    const test = cur ? `${cur}\n${line}` : line;
    if (hdr.length + test.length + ftr.length + revMarker.length > MAX && cur) {
      chunks.push(`${hdr}${cur}${ftr}${revMarker}`);
      cur = line;
    } else { cur = test; }
  }
  if (cur) chunks.push(`${hdr}${cur}${ftr}${revMarker}`);
  return chunks.length ? chunks : [`${hdr}None${ftr}${revMarker}`];
}

async function updateKosList(sectionsArg = null, forceCreate = false) {
  const channel = await client.channels.fetch(SUBMISSION_CHANNEL).catch(() => null);
  if (!channel) { console.error('[updateKosList] Cannot fetch SUBMISSION_CHANNEL'); return; }

  const keys = sectionsArg
    ? (Array.isArray(sectionsArg) ? sectionsArg : [sectionsArg])
    : ['players', 'priority', 'clans'];

  await Promise.all(keys.map(async key => {
    if (!SECTION_FORMAT[key] || updatingSections[key]) return;
    updatingSections[key] = true;
    try {
      const chunks    = splitIntoChunks(SECTION_HEADER[key], SECTION_FORMAT[key](), rev());
      const storedIds = [...(data.listMessages[key] || [])];

      if (forceCreate) {
        for (const id of storedIds) { const m = await channel.messages.fetch(id).catch(() => null); if (m) await m.delete().catch(() => {}); }
        const newIds = [];
        for (const chunk of chunks) { const m = await channel.send(chunk).catch(() => null); if (m) newIds.push(m.id); }
        data.listMessages[key] = newIds;
        return;
      }

      if (storedIds.length === 0) { console.warn(`[updateKosList] No IDs for "${key}" — run /list`); return; }

      const verified = (await Promise.all(storedIds.map(id => channel.messages.fetch(id).catch(() => null))))
        .map((m, i) => m ? storedIds[i] : null).filter(Boolean);

      if (verified.length === 0) { console.warn(`[updateKosList] "${key}" messages gone — run /list`); data.listMessages[key] = []; return; }

      // Fit chunks into available slots; merge overflow into last slot
      let slotted;
      if (chunks.length <= verified.length) {
        slotted = chunks;
      } else {
        slotted = chunks.slice(0, verified.length - 1);
        const overflow = chunks.slice(verified.length - 1)
          .map(c => c.replace(/^```[^\n]*\n/, '').replace(/\n```[\u200B]*$/, '')).join('\n');
        slotted.push(`\`\`\`${SECTION_HEADER[key]}\n${overflow}\n\`\`\`${'\u200B'.repeat((data.revision % 10) + 1)}`);
      }

      await Promise.all(verified.map(async (id, i) => {
        const m = await channel.messages.fetch(id).catch(() => null);
        if (m) await m.edit(i < slotted.length ? slotted[i] : '\u200B').catch(() => {});
      }));

      data.listMessages[key] = verified;
    } finally { updatingSections[key] = false; }
  }));

  saveData();
}

/* ===================== PANEL ===================== */
async function updatePanel(channel) {
  if (!channel) return;
  const gif  = new EmbedBuilder().setColor(0xFF0000)
    .setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExc2FoODRjMmVtNmhncjkyZzY0ZGVwa2l3dzV0M3UyYmZ4bjVsZ2pnOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/iuttaLUMRLWEgJKRHx/giphy.gif');
  const info = new EmbedBuilder().setTitle('KOS Submission System').setColor(0xFF0000).setDescription(`
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
  const upsert = async (id, embed) => {
    if (id) { const m = await channel.messages.fetch(id).catch(() => null); if (m) return (await m.edit({ embeds: [embed] })).id; }
    return (await channel.send({ embeds: [embed] })).id;
  };
  data.panelMessages.gif      = await upsert(data.panelMessages.gif,      gif);
  data.panelMessages.tutorial = await upsert(data.panelMessages.tutorial, info);
  saveData();
}

/* ===================== PREFIX COMMANDS ===================== */
client.on('messageCreate', msg => {
  // File-backed dedup: synchronously claim the message ID before any async work.
  // Written to disk so it survives restarts and catches duplicate gateway events
  // that arrive within the same JS tick (immune to in-memory race conditions).
  if (!claimMessage(msg.id)) return;

  if (msg.author.bot) return;
  if (!msg.content.startsWith('^')) return;

  // Serialise execution through a queue so even if two fires both pass
  // claimMessage (extremely unlikely after file-write), only one runs at a time.
  enqueueCommand(() => handleCommand(msg));
});

async function handleCommand(msg) {
  const args = msg.content.trim().split(/\s+/);
  const cmd  = args.shift().toLowerCase();

  if (msg.author.id === SPECIAL_USER_ID) {
    await msg.channel.send(`<@${msg.author.id}> fuck u kid`);
    await msg.channel.send(SPECIAL_GIF_URL);
    msg.delete().catch(() => {});
    return;
  }

  if (!prefixEnabled && msg.author.id !== OWNER_ID) {
    const m = await msg.channel.send('schwanz is disabled im fixing it plz wait');
    setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 5000);
    return;
  }

  if (data.bannedUsers.has(msg.author.id) && msg.author.id !== OWNER_ID) {
    await reply(msg, 'You have been banned from using KOS commands.'); return;
  }

  if (msg.channel.id !== SUBMISSION_CHANNEL) {
    const m = await msg.channel.send(`<@${msg.author.id}> Use KOS commands in <#${SUBMISSION_CHANNEL}>.`);
    setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 4000);
    return;
  }

  // ---------- ^ka ----------
  if (cmd === '^ka') {
    const [name, rawUsername] = args;
    if (!name) { await reply(msg, 'Missing name.'); return; }
    const username = cleanUsername(rawUsername) || null;
    const key      = username || name;
    if (data.players.has(key)) {
      await sendLog(msg, '⚠️ Add Player — Already Exists', LOG_COLORS.ERROR, [
        { name: 'Name', value: name, inline: true },
        { name: 'Username', value: username || 'N/A', inline: true },
        { name: 'Result', value: 'Already on KOS list', inline: false }
      ]);
      await reply(msg, `Player already in KOS: ${key}`); return;
    }
    data.players.set(key, { name, username, addedBy: msg.author.id });
    data.priority.delete(key);
    await updateKosList(['players', 'priority']);
    await sendLog(msg, '✅ Player Added', LOG_COLORS.ADD, [
      { name: 'Name', value: name, inline: true },
      { name: 'Username', value: username || 'N/A', inline: true },
      { name: 'Result', value: 'Added to KOS list', inline: false }
    ]);
    await reply(msg, `Added ${name}${username ? ` (${username})` : ''}`); return;
  }

  // ---------- ^kr ----------
  if (cmd === '^kr') {
    const [identifier, rawUsername] = args;
    if (!identifier) { await reply(msg, 'Missing name.'); return; }
    const usernameArg = cleanUsername(rawUsername) || null;
    let playerCheck = null;

    if (usernameArg) {
      playerCheck = [...data.players.values()].find(p => p.username && p.username.toLowerCase() === usernameArg.toLowerCase());
      if (!playerCheck) {
        await sendLog(msg, '⚠️ Remove Player — Not Found', LOG_COLORS.ERROR, [
          { name: 'Identifier', value: `${identifier} (${usernameArg})`, inline: true },
          { name: 'Result', value: 'Player not found by username', inline: false }
        ]);
        await reply(msg, `Player not found with username: ${usernameArg}`); return;
      }
    } else {
      const byName = [...data.players.values()].filter(p => p.name.toLowerCase() === identifier.toLowerCase());
      if (byName.length === 0) {
        playerCheck = findPlayer(identifier);
        if (!playerCheck) {
          await sendLog(msg, '⚠️ Remove Player — Not Found', LOG_COLORS.ERROR, [
            { name: 'Identifier', value: identifier, inline: true },
            { name: 'Result', value: 'Player not found', inline: false }
          ]);
          await reply(msg, 'Player not found.'); return;
        }
      } else if (byName.length > 1) {
        await reply(msg,
          `${byName.length} players found with display name **${identifier}**. Please specify a username: \`^kr ${identifier} <username>\``,
          6000
        ); return;
      } else {
        playerCheck = byName[0];
      }
    }

    if (!playerCheck) return;

    if (!playerCheck._orphaned && playerCheck.addedBy !== msg.author.id && msg.author.id !== OWNER_ID && !canUsePriority(msg)) {
      await sendLog(msg, '⛔ Remove Player — Permission Denied', LOG_COLORS.ERROR, [
        { name: 'Target', value: playerCheck.username || playerCheck.name, inline: true },
        { name: 'Result', value: 'User did not add this player', inline: false }
      ]);
      await reply(msg, "You didn't add this player."); return;
    }

    // Remove strictly by exact map key only — never touches players sharing the same display name
    const removeKey = playerKey(playerCheck);
    const removed   = data.players.get(removeKey);
    if (removed) data.players.delete(removeKey);
    for (const k of [...data.priority]) { if (k.toLowerCase() === removeKey.toLowerCase()) data.priority.delete(k); }

    await updateKosList(['players', 'priority']);
    const primary = removed || playerCheck;
    await sendLog(msg, '🗑️ Player Removed', LOG_COLORS.REMOVE, [
      { name: 'Name', value: primary.name, inline: true },
      { name: 'Username', value: primary.username || 'N/A', inline: true },
      { name: 'Result', value: 'Removed from KOS list', inline: false }
    ]);
    await reply(msg, `Removed ${primary.name}${primary.username ? ` (${primary.username})` : ''}`); return;
  }

  // ---------- ^kca ----------
  if (cmd === '^kca') {
    const [name, region] = args;
    if (!name)   { await reply(msg, 'Missing name and region.'); return; }
    if (!region) { await reply(msg, 'Missing region.'); return; }
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (data.clans.has(clan)) {
      await sendLog(msg, '⚠️ Add Clan — Already Exists', LOG_COLORS.ERROR, [
        { name: 'Name', value: name.toUpperCase(), inline: true },
        { name: 'Region', value: region.toUpperCase(), inline: true },
        { name: 'Result', value: 'Already on KOS list', inline: false }
      ]);
      await reply(msg, `Clan already exists: ${clan}`); return;
    }
    data.clans.add(clan);
    await updateKosList(['clans']);
    await sendLog(msg, '✅ Clan Added', LOG_COLORS.CLAN_ADD, [
      { name: 'Name', value: name.toUpperCase(), inline: true },
      { name: 'Region', value: region.toUpperCase(), inline: true },
      { name: 'Result', value: 'Clan added to KOS list', inline: false }
    ]);
    await reply(msg, `Added clan ${clan}`); return;
  }

  // ---------- ^kcr ----------
  if (cmd === '^kcr') {
    const [name, region] = args;
    if (!name)   { await reply(msg, 'Missing name and region.'); return; }
    if (!region) { await reply(msg, 'Missing region.'); return; }
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (data.clans.delete(clan)) {
      await updateKosList(['clans']);
      await sendLog(msg, '🗑️ Clan Removed', LOG_COLORS.CLAN_REM, [
        { name: 'Name', value: name.toUpperCase(), inline: true },
        { name: 'Region', value: region.toUpperCase(), inline: true },
        { name: 'Result', value: 'Clan removed from KOS list', inline: false }
      ]);
      await reply(msg, `Removed clan ${clan}`);
    } else {
      await sendLog(msg, '⚠️ Remove Clan — Not Found', LOG_COLORS.ERROR, [
        { name: 'Name', value: name.toUpperCase(), inline: true },
        { name: 'Region', value: region.toUpperCase(), inline: true },
        { name: 'Result', value: 'Clan not found', inline: false }
      ]);
      await reply(msg, `Clan not found: ${clan}`);
    }
    return;
  }

  // ---------- Priority commands ----------
  if (['^p', '^pr', '^pa'].includes(cmd)) {
    if (!canUsePriority(msg)) { await reply(msg, 'You cannot use priority commands.'); return; }

    if (cmd === '^pa') {
      const [name, rawUsername] = args;
      if (!name) { await reply(msg, 'Missing name.'); return; }
      const username = cleanUsername(rawUsername) || null;
      const key      = username || name;
      if (data.players.has(key)) { await reply(msg, `Player already exists: ${key}`); return; }
      data.players.set(key, { name, username, addedBy: msg.author.id });
      data.priority.add(key);
      await updateKosList(['players', 'priority']);
      await sendLog(msg, '⭐ Player Added to Priority (Direct)', LOG_COLORS.PRIORITY, [
        { name: 'Name', value: name, inline: true },
        { name: 'Username', value: username || 'N/A', inline: true },
        { name: 'Result', value: 'Added directly to Priority', inline: false }
      ]);
      await reply(msg, `Added ${name}${username ? ` (${username})` : ''} directly to priority`); return;
    }

    const [identifier] = args;
    if (!identifier) { await reply(msg, 'Missing name.'); return; }
    const player = findPlayer(identifier);
    if (!player) { await reply(msg, 'Player not found.'); return; }

    if (cmd === '^p') {
      data.priority.add(playerKey(player));
      await updateKosList(['players', 'priority']);
      await sendLog(msg, '⭐ Player Promoted to Priority', LOG_COLORS.PRIORITY, [
        { name: 'Name', value: player.name, inline: true },
        { name: 'Username', value: player.username || 'N/A', inline: true },
        { name: 'Result', value: 'Promoted to Priority', inline: false }
      ]);
      await reply(msg, `Promoted ${player.name} to priority`); return;
    }

    if (cmd === '^pr') {
      const ids = new Set([playerKey(player).toLowerCase(), player.name.toLowerCase()]);
      if (player.username) ids.add(player.username.toLowerCase());
      for (const k of [...data.priority]) { if (ids.has(k.toLowerCase())) data.priority.delete(k); }
      await updateKosList(player._orphaned ? ['priority'] : ['players', 'priority']);
      await sendLog(msg, '🔻 Player Removed from Priority', LOG_COLORS.REMOVE, [
        { name: 'Name', value: player.name, inline: true },
        { name: 'Username', value: player.username || 'N/A', inline: true },
        { name: 'Result', value: 'Removed from Priority', inline: false }
      ]);
      await reply(msg, `Removed ${player.name} from priority`); return;
    }
  }
}

/* ===================== SLASH COMMANDS (OWNER ONLY) ===================== */
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;
  if (!isOwner(i)) return i.reply({ content: '❌ You are not the owner.', flags: 64 });

  if (i.commandName === 'enable')  { prefixEnabled = true;  return i.reply({ content: '✅ Prefix commands **enabled**.', flags: 64 }); }
  if (i.commandName === 'disable') { prefixEnabled = false; return i.reply({ content: '🔴 Prefix commands **disabled**.', flags: 64 }); }

  if (i.commandName === 'backup') {
    await i.deferReply({ flags: 64 });
    if (fs.existsSync(DATA_FILE)) { try { parseRaw(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); } catch {} }
    await pushBackup();
    return i.editReply({ content: `✅ Backup pushed to <#${BACKUP_CHANNEL}>.` });
  }

  if (i.commandName === 'list') {
    await i.deferReply({ flags: 64 });
    try {
      const ch  = await client.channels.fetch(BACKUP_CHANNEL);
      const msg = (await ch.messages.fetch({ limit: 20 })).find(m => m.attachments.some(a => a.name === 'data.json'));
      if (!msg) return i.editReply({ content: '❌ No backup found. Use `/backup` first.' });
      parseRaw(await (await fetch(msg.attachments.find(a => a.name === 'data.json').url)).json());
    } catch { return i.editReply({ content: '❌ Failed to load from backup channel.' }); }
    await updateKosList(null, true);
    return i.editReply({ content: '✅ KOS list created from latest backup.' });
  }

  if (i.commandName === 'clear') {
    await i.deferReply({ flags: 64 });
    try {
      let total = 0;
      const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
      let fetched;
      do {
        fetched = await i.channel.messages.fetch({ limit: 100 });
        const nonBot = fetched.filter(m => m.author.id !== client.user.id);
        if (nonBot.size === 0) break;
        const bulk = nonBot.filter(m => m.createdTimestamp > cutoff);
        const old  = nonBot.filter(m => m.createdTimestamp <= cutoff);
        if (bulk.size >= 2) { await i.channel.bulkDelete(bulk, true).catch(() => {}); total += bulk.size; }
        else if (bulk.size === 1) { await bulk.first().delete().catch(() => {}); total++; }
        for (const m of old.values()) { await m.delete().catch(() => {}); total++; }
      } while (fetched.size >= 2);
      return i.editReply({ content: `✅ Cleared ${total} non-bot message${total !== 1 ? 's' : ''}.` });
    } catch { return i.editReply({ content: '❌ Failed to clear messages.' }); }
  }

  if (i.commandName === 'panel') {
    await i.deferReply({ flags: 64 });
    await updatePanel(i.channel);
    return i.editReply({ content: '✅ Panel updated.' });
  }

  if (i.commandName === 'say') {
    await i.channel.send(i.options.getString('text'));
    return i.reply({ content: '✅ Sent.', flags: 64 });
  }

  if (i.commandName === 'setrole') {
    const role = i.options.getRole('role');
    data.ownerRoleId = role.id;
    saveData();
    return i.reply({ content: `✅ Owner role set to <@&${role.id}>.`, flags: 64 });
  }

  if (i.commandName === 'ban') {
    const target = i.options.getUser('user');
    if (target.id === OWNER_ID)          return i.reply({ content: '❌ Cannot ban the bot owner.', flags: 64 });
    if (data.bannedUsers.has(target.id)) return i.reply({ content: `⚠️ ${target.username} is already banned.`, flags: 64 });
    data.bannedUsers.add(target.id);
    saveData();
    try {
      const ch = await client.channels.fetch(LOGS_CHANNEL).catch(() => null);
      if (ch) await ch.send({ embeds: [new EmbedBuilder().setColor(LOG_COLORS.BAN)
        .setAuthor({ name: `${i.user.username} (${i.user.id})`, iconURL: getAvatarURL(i.user) })
        .setTitle('🔨 User Banned').addFields({ name: 'User', value: `${target.username} (${target.id})`, inline: true }).setTimestamp()
      ]}).catch(() => {});
    } catch {}
    return i.reply({ content: `🔨 **${target.username}** banned.`, flags: 64 });
  }

  if (i.commandName === 'unban') {
    const target = i.options.getUser('user');
    if (!data.bannedUsers.has(target.id)) return i.reply({ content: `⚠️ ${target.username} is not banned.`, flags: 64 });
    data.bannedUsers.delete(target.id);
    saveData();
    try {
      const ch = await client.channels.fetch(LOGS_CHANNEL).catch(() => null);
      if (ch) await ch.send({ embeds: [new EmbedBuilder().setColor(LOG_COLORS.ADD)
        .setAuthor({ name: `${i.user.username} (${i.user.id})`, iconURL: getAvatarURL(i.user) })
        .setTitle('✅ User Unbanned').addFields({ name: 'User', value: `${target.username} (${target.id})`, inline: true }).setTimestamp()
      ]}).catch(() => {});
    } catch {}
    return i.reply({ content: `✅ **${target.username}** unbanned.`, flags: 64 });
  }
});

/* ===================== DUMMY SERVER FOR RENDER ===================== */
require('http').createServer((_, res) => res.end('Bot running')).listen(process.env.PORT || 3000);

/* ===================== LOGIN + LOAD ===================== */
client.once('ready', async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);
  loadDedup();
  await loadData();
  await reconcileListMessages();
  schedule24hBackup();
  console.log('[Bot] Ready.');
});

client.login(process.env.TOKEN);
