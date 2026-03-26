process.stdout.write('STARTUP\n');
console.log('1 - before requires');
require('dotenv').config();
console.log('2 - dotenv done');

require('dotenv').config();
const fs   = require('fs');
const fsp  = require('fs/promises');
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
const SETTINGS_CHANNEL   = '1485078466830405663';
const SPECIAL_USER_ID    = '760369177180897290';
const SPECIAL_GIF_URL    = 'https://tenor.com/view/chainsawman-chainsaw-man-reze-reze-arc-chainsaw-man-reze-gif-13447210726051357373';
const SUBMISSION_CHANNEL = '1450867784543113318';
const LOGS_CHANNEL       = '1473800222927880223';
const BACKUP_CHANNEL     = '1475960780976292051';
const DEDUP_TTL_MS       = 30_000;

// Whitelist valid commands — fast-rejects unknown prefixed messages before queuing
const VALID_COMMANDS = new Set(['^ka', '^kr', '^ke', '^kca', '^kcr', '^kce', '^p', '^pr', '^pa', '^pe']);

/* ===================== INPUT SANITIZATION ===================== */
function sanitizeInput(str, maxLen = 64) {
  if (typeof str !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = str.replace(/[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g, '').trim();
  if (cleaned.length === 0 || cleaned.length > maxLen) return null;
  return cleaned;
}

/* ===================== DEDUP (file-backed) ===================== */
const claimedMemory = new Set();
let dedupStore = {};
let dedupDirty = false;

let _dedupFlushTimer = null;
function scheduleDedupFlush() {
  if (_dedupFlushTimer) return;
  _dedupFlushTimer = setTimeout(async () => {
    _dedupFlushTimer = null;
    if (!dedupDirty) return;
    dedupDirty = false;
    try { await fsp.writeFile(DEDUP_FILE, JSON.stringify(dedupStore)); } catch {}
  }, 500);
}

function loadDedup() {
  try {
    if (fs.existsSync(DEDUP_FILE)) dedupStore = JSON.parse(fs.readFileSync(DEDUP_FILE, 'utf8'));
  } catch { dedupStore = {}; }
  const now = Date.now();
  for (const id of Object.keys(dedupStore)) { if (dedupStore[id] < now) delete dedupStore[id]; }
}

function claimMessage(msgId) {
  if (claimedMemory.has(msgId)) return false;
  claimedMemory.add(msgId);
  setTimeout(() => claimedMemory.delete(msgId), DEDUP_TTL_MS);

  const now = Date.now();
  if (dedupStore[msgId] && dedupStore[msgId] > now) return false;
  dedupStore[msgId] = now + DEDUP_TTL_MS;
  dedupDirty = true;
  scheduleDedupFlush();
  return true;
}

/* ===================== COMMAND QUEUE ===================== */
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
    try { await cmdQueue.shift()(); } catch (e) { console.error('[Queue]', e.message); }
  }
  cmdRunning = false;
}

/* ===================== SETTINGS ===================== */
let prefixEnabled = true;
let botShutdown   = false;   // when true, bot goes fully silent

async function saveSettings() {
  const payload = JSON.stringify({ prefixEnabled, botShutdown }, null, 2);
  // Also mirror to local file as a fast cache
  fsp.writeFile('./settings.json', payload).catch(() => {});
  try {
    const ch = await client.channels.fetch(SETTINGS_CHANNEL).catch(() => null);
    if (!ch) return;
    // Wipe all existing messages in the channel first
    let fetched;
    do {
      fetched = await ch.messages.fetch({ limit: 100 });
      if (fetched.size === 0) break;
      for (const m of fetched.values()) await m.delete().catch(() => {});
    } while (fetched.size >= 2);
    // Post fresh settings
    await ch.send({
      content: `Last updated: <t:${Math.floor(Date.now() / 1000)}:F>`,
      files: [new AttachmentBuilder(Buffer.from(payload, 'utf8'), { name: 'settings.json' })]
    });
    console.log('[Settings] Pushed to Discord.');
  } catch (e) { console.error('[Settings] Discord push failed:', e.message); }
}

async function loadSettings() {
  // Try Discord channel first
  try {
    const ch = await client.channels.fetch(SETTINGS_CHANNEL).catch(() => null);
    if (ch) {
      const msgs = await ch.messages.fetch({ limit: 20 });
      const msg  = msgs.find(m => m.attachments.some(a => a.name === 'settings.json'));
      if (msg) {
        const raw = await (await fetch(msg.attachments.find(a => a.name === 'settings.json').url)).json();
        if (typeof raw.prefixEnabled === 'boolean') prefixEnabled = raw.prefixEnabled;
        if (typeof raw.botShutdown   === 'boolean') botShutdown   = raw.botShutdown;
        console.log(`[Settings] Loaded from Discord — prefixEnabled: ${prefixEnabled}, botShutdown: ${botShutdown}`);
        return;
      }
    }
  } catch (e) { console.warn('[Settings] Discord load failed:', e.message); }
  // Fall back to local file
  try {
    if (fs.existsSync('./settings.json')) {
      const raw = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
      if (typeof raw.prefixEnabled === 'boolean') prefixEnabled = raw.prefixEnabled;
      if (typeof raw.botShutdown   === 'boolean') botShutdown   = raw.botShutdown;
      console.log(`[Settings] Loaded from local file — prefixEnabled: ${prefixEnabled}, botShutdown: ${botShutdown}`);
    }
  } catch (e) { console.warn('[Settings] Local load failed:', e.message); }
}

/* ===================== DATA ===================== */
let data = {
  players:         new Map(),
  nameIndex:       new Map(),
  usernameIndex:   new Map(),
  priority:        new Set(),
  clans:           new Set(),
  bannedUsers:     new Set(),
  hardBannedUsers: new Map(),   // userId → { message, gif }
  backupMessageId: null,
  listMessages:    { players: [], priority: [], clans: [] },
  panelMessages:   { gif: null, tutorial: null },
  ownerRoleId:     null,
  revision:        0
};

/* ===================== INDEX HELPERS ===================== */
function rebuildIndexes() {
  data.nameIndex.clear();
  data.usernameIndex.clear();
  for (const p of data.players.values()) {
    data.nameIndex.set(p.name.toLowerCase(), p);
    if (p.username) data.usernameIndex.set(p.username.toLowerCase(), p);
  }
}

function indexAdd(player) {
  data.nameIndex.set(player.name.toLowerCase(), player);
  if (player.username) data.usernameIndex.set(player.username.toLowerCase(), player);
}

function indexRemove(player) {
  data.nameIndex.delete(player.name.toLowerCase());
  if (player.username) data.usernameIndex.delete(player.username.toLowerCase());
}

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

function bumpRev() { data.revision++; }
function revMarker() { return '\u200B'.repeat((data.revision % 10) + 1); }

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
  data.players = new Map(sorted.map(p => [playerKey(p), p]));
  const sortedP = [...data.priority].sort((a, b) => {
    const pa = data.nameIndex.get(a.toLowerCase()) || data.usernameIndex.get(a.toLowerCase());
    const pb = data.nameIndex.get(b.toLowerCase()) || data.usernameIndex.get(b.toLowerCase());
    return alpha(pa ? pa.name : a, pb ? pb.name : b);
  });
  data.priority = new Set(sortedP);
  data.clans    = new Set([...data.clans].sort(alpha));
}

function findPlayer(identifier) {
  const id = identifier.toLowerCase();
  const byName = data.nameIndex.get(id);
  if (byName) return byName;
  const byUser = data.usernameIndex.get(id);
  if (byUser) return byUser;
  const orphan = [...data.priority].find(k => k.toLowerCase() === id);
  if (orphan) return { name: orphan, username: null, addedBy: null, _orphaned: true };
  return null;
}

function findPlayersByName(nameLower) {
  const exact = data.nameIndex.get(nameLower);
  if (!exact) return [];
  return [...data.players.values()].filter(p => p.name.toLowerCase() === nameLower);
}

function checkPlayerConflict(name, username, excludeKey = null) {
  const nameLower = name ? name.toLowerCase() : null;
  const userLower = username ? username.toLowerCase() : null;

  for (const [key, p] of data.players.entries()) {
    if (excludeKey && key === excludeKey) continue;
    if (userLower && p.username && p.username.toLowerCase() === userLower) {
      return `Username **${p.username}** is already taken by **${p.name}**.`;
    }
    if (nameLower && p.name.toLowerCase() === nameLower && !p.username && !username) {
      return `A player named **${p.name}** already exists with no username. Add a username to distinguish them, or use a different name.`;
    }
  }
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
    hardBannedUsers: Object.fromEntries(data.hardBannedUsers),
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
    const uname  = cleanUsername(p.username);
    const player = { name: p.name, username: uname, addedBy: p.addedBy };
    data.players.set(uname || p.name, player);
  });
  data.priority = new Set();
  const sanitizePriorityKey = (u) => {
    if (!u) return null;
    u = u.trim();
    if (u.startsWith('@')) u = u.slice(1).trim();
    if (u.includes(' @')) u = u.split(' @')[0].trim();
    if (u.includes(' : ')) u = u.split(' : ')[0].trim();
    return u || null;
  };
  const rawPriorityKeys = [
    ...(raw.topPriority || []),
    ...(raw.priority    || [])
  ];
  for (const u of rawPriorityKeys) {
    const k = sanitizePriorityKey(u);
    if (k) data.priority.add(k);
  }
  data.clans           = new Set(raw.clans        || []);
  data.bannedUsers     = new Set(raw.bannedUsers   || []);
  data.hardBannedUsers = new Map(Object.entries(raw.hardBannedUsers || {}));
  data.backupMessageId = raw.backupMessageId       || null;
  data.ownerRoleId     = raw.ownerRoleId           || null;
  const msgs = raw.listMessages || raw.messages || {};
  data.listMessages = {
    players:  Array.isArray(msgs.players)  ? msgs.players  : (msgs.players  ? [msgs.players]  : []),
    priority: Array.isArray(msgs.priority) ? msgs.priority : (msgs.priority ? [msgs.priority] : []),
    clans:    Array.isArray(msgs.clans)    ? msgs.clans    : (msgs.clans    ? [msgs.clans]    : [])
  };
  data.panelMessages = raw.panelMessages || data.panelMessages;
  data.revision      = raw.revision      || 0;
  rebuildIndexes();
  deduplicatePlayers();
  data.priority = resolvePriority(data.priority);
  console.log('[Priority] Resolved:', [...data.priority].join(', '));
  sortData();
}

/* ===================== SAVE / LOAD ===================== */
async function pushBackup() {
  const payload = buildPayload();
  try { await fsp.writeFile(DATA_FILE, payload); } catch (e) { console.error('[Backup] Local write failed:', e.message); }
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
    await fsp.writeFile(DATA_FILE, buildPayload());
    console.log(`[Backup] Pushed (msg ${sent.id})`);
  } catch (e) { console.error('[Backup] Discord push failed:', e.message); }
}

function schedule24hBackup() {
  setInterval(() => { console.log('[AutoBackup] 24h tick'); pushBackup(); }, 24 * 60 * 60 * 1000);
}

let _pendingChanges = 0;
function saveData() {
  _pendingChanges++;
  if (_pendingChanges >= 10) { _pendingChanges = 0; pushBackup(); return; }
  fsp.writeFile(DATA_FILE, buildPayload()).catch(e => console.error('[Save]', e.message));
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
    await fsp.writeFile(DATA_FILE, buildPayload());
    console.log(`[Load] Loaded from Discord (msg ${msg.id})`);
  } catch (e) { console.error('[Load] Discord load failed:', e.message); }
}

/* ===================== LOGGER ===================== */
const LOG_COLORS = { ADD: 0x57F287, REMOVE: 0xED4245, PRIORITY: 0xFEE75C, CLAN_ADD: 0x5865F2, CLAN_REM: 0xEB459E, BAN: 0xFF6B35, EDIT: 0x3498DB, ERROR: 0x95A5A6 };

function getAvatarURL(user) {
  if (!user.avatar) return user.defaultAvatarURL;
  if (user.avatar.startsWith('a_')) return user.displayAvatarURL({ extension: 'gif', forceStatic: false, size: 128 });
  return user.displayAvatarURL({ extension: 'png', size: 128 });
}

async function sendLog(msg, action, color, fields) {
  if (botShutdown) return;   // suppress all logs during shutdown
  try {
    const ch = await client.channels.fetch(LOGS_CHANNEL).catch(() => null);
    if (!ch) return;
    await ch.send({ embeds: [new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: `${msg.author.username} (${msg.author.id})`, iconURL: getAvatarURL(msg.author) })
      .setTitle(action)
      .addFields({ name: 'Command', value: `\`${msg.content.slice(0, 1000)}\``, inline: false }, ...fields)
      .setTimestamp()
      .setFooter({ text: `#${msg.channel.name}` })
    ]}).catch(() => {});
  } catch {}
}

/* ===================== FORMATTERS ===================== */
function resolvePriority(prioritySet) {
  const resolved = new Set();
  const seen = new Set();
  for (const k of prioritySet) {
    const byName = data.nameIndex.get(k.toLowerCase());
    if (byName) {
      if (!seen.has(byName.name.toLowerCase())) { resolved.add(byName.name); seen.add(byName.name.toLowerCase()); }
      continue;
    }
    const byUser = data.usernameIndex.get(k.toLowerCase());
    if (byUser) {
      if (!seen.has(byUser.name.toLowerCase())) { resolved.add(byUser.name); seen.add(byUser.name.toLowerCase()); }
      continue;
    }
    if (!seen.has(k.toLowerCase())) { resolved.add(k); seen.add(k.toLowerCase()); }
  }
  return resolved;
}

function deduplicatePlayers() {
  const seenNames = new Map();
  const seenUsernames = new Set();
  const toDelete = [];
  for (const [key, p] of data.players.entries()) {
    const nl = p.name.toLowerCase();
    const ul = p.username ? p.username.toLowerCase() : null;
    let isDup = false;
    if (ul && seenUsernames.has(ul)) { isDup = true; }
    if (!ul && seenNames.has(nl) && !seenNames.get(nl).username) { isDup = true; }
    if (isDup) { toDelete.push(key); continue; }
    seenNames.set(nl, p);
    if (ul) seenUsernames.add(ul);
  }
  for (const key of toDelete) {
    const p = data.players.get(key);
    if (p) { indexRemove(p); data.players.delete(key); }
    console.warn(`[Dedup] Removed duplicate player: "${key}"`);
  }
}

function formatPlayers() {
  const prio = new Set([...data.priority].map(k => k.toLowerCase()));
  const rows = [...data.players.values()]
    .filter(p => !prio.has(p.name.toLowerCase()))
    .sort((a, b) => alpha(a.name, b.name))
    .map(p => p.username ? `${p.name} : ${p.username}` : p.name);
  return rows.length ? rows.join('\n') : 'None';
}

function formatPriority() {
  const rows = [...data.priority].map(name => {
    const p = data.nameIndex.get(name.toLowerCase());
    const username = p ? p.username : null;
    return { sort: name, text: username ? `${name} @${username}` : name };
  }).sort((a, b) => alpha(a.sort, b.sort)).map(r => r.text);
  return rows.length ? rows.join('\n') : 'None';
}

function formatClans() {
  return data.clans.size ? [...data.clans].sort(alpha).join('\n') : 'None';
}

/* ===================== LIST UPDATER ===================== */
const sectionLocks = {};

function acquireSectionLock(key) {
  let release;
  const prev = sectionLocks[key] || Promise.resolve();
  sectionLocks[key] = prev.then(() => new Promise(res => { release = res; }));
  return prev.then(() => release);
}

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

function splitIntoChunks(title, content, marker) {
  const MAX = 1900;
  const hdr = `\`\`\`${title}\n`;
  const ftr = `\n\`\`\``;
  const chunks = [];
  let cur = '';
  for (const line of content.split('\n')) {
    const test = cur ? `${cur}\n${line}` : line;
    if (hdr.length + test.length + ftr.length + marker.length > MAX && cur) {
      chunks.push(`${hdr}${cur}${ftr}${marker}`);
      cur = line;
    } else { cur = test; }
  }
  if (cur) chunks.push(`${hdr}${cur}${ftr}${marker}`);
  return chunks.length ? chunks : [`${hdr}None${ftr}${marker}`];
}

async function updateKosList(sectionsArg = null, forceCreate = false) {
  const channel = await client.channels.fetch(SUBMISSION_CHANNEL).catch(() => null);
  if (!channel) { console.error('[updateKosList] Cannot fetch SUBMISSION_CHANNEL'); return; }

  const keys = sectionsArg
    ? (Array.isArray(sectionsArg) ? sectionsArg : [sectionsArg])
    : ['players', 'priority', 'clans'];

  bumpRev();
  const marker = revMarker();

  await Promise.all(keys.map(async key => {
    if (!SECTION_FORMAT[key]) return;
    const release = await acquireSectionLock(key);
    try {
      const chunks    = splitIntoChunks(SECTION_HEADER[key], SECTION_FORMAT[key](), marker);
      const storedIds = [...(data.listMessages[key] || [])];

      if (forceCreate) {
        for (const id of storedIds) {
          const m = await channel.messages.fetch(id).catch(() => null);
          if (m) await m.delete().catch(() => {});
        }
        const newIds = [];
        for (const chunk of chunks) {
          const m = await channel.send(chunk).catch(e => { console.error(`[updateKosList] send failed for "${key}":`, e.message); return null; });
          if (m) newIds.push(m.id);
        }
        data.listMessages[key] = newIds;
        console.log(`[updateKosList] forceCreate "${key}" → ${newIds.length} message(s)`);
        return;
      }

      if (storedIds.length === 0) {
        console.warn(`[updateKosList] No IDs for "${key}" — run /list`);
        return;
      }

      const verified = (await Promise.all(storedIds.map(id => channel.messages.fetch(id).catch(() => null))))
        .map((m, i) => m ? storedIds[i] : null).filter(Boolean);

      if (verified.length === 0) {
        console.warn(`[updateKosList] "${key}" messages gone — run /list`);
        data.listMessages[key] = [];
        return;
      }

      let slotted;
      if (chunks.length <= verified.length) {
        slotted = chunks;
      } else {
        slotted = chunks.slice(0, verified.length - 1);
        const overflow = chunks.slice(verified.length - 1)
          .map(c => c.replace(/^```[^\n]*\n/, '').replace(/\n```[\u200B]*$/, '')).join('\n');
        slotted.push(`\`\`\`${SECTION_HEADER[key]}\n${overflow}\n\`\`\`${marker}`);
      }

      await Promise.all(verified.map(async (id, i) => {
        const m = await channel.messages.fetch(id).catch(() => null);
        if (!m) { console.warn(`[updateKosList] Slot ${i} for "${key}" vanished during edit`); return; }
        const newContent = i < slotted.length ? slotted[i] : '\u200B';
        if (m.content !== newContent) {
          await m.edit(newContent).catch(e => console.error(`[updateKosList] edit failed for "${key}" slot ${i}:`, e.message));
        }
      }));

      data.listMessages[key] = verified;
      console.log(`[updateKosList] Updated "${key}" across ${verified.length} message(s)`);
    } finally {
      release();
    }
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

**Player Commands**
\`^ka poison poisonrebuild\` – Add a player
\`^kr poison \` – Remove a player
\`^ke facial anonymous_vas00 (or -) poison poisonrebuild\` – Edit a player (use \`-\` for no username)

**Clan Commands**
\`^kca YX EU\` – Add a clan
\`^kcr YX EU\` – Remove a clan
\`^kce YH NA YX EU\` – Edit a clan

**Priority Commands (YX Founders Only)**
\`^p poison \` – Promote a player to priority
\`^pr poison\` – Remove a player from priority
\`^pa poison\` – Add player directly to priority
\`^pe facial anonymous_vas00 (or -) poison poisonrebuild\` – Edit a priority player (use \`-\` for no username)

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
  if (!claimMessage(msg.id)) return;
  if (msg.author.bot) return;
  if (!msg.content.startsWith('^')) return;

  const cmd = msg.content.trim().split(/\s+/)[0].toLowerCase();
  if (!VALID_COMMANDS.has(cmd)) return;

  // During shutdown: respond with "no", delete both messages, do nothing else
  if (botShutdown) {
    msg.channel.send(`<@${msg.author.id}> no`)
      .then(m => setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 3000))
      .catch(() => {});
    return;
  }

  if (!prefixEnabled && msg.author.id !== OWNER_ID && !msg.member?.roles.cache.has(PRIORITY_ROLE_ID)) {
    msg.channel.send(`<@${msg.author.id}> Commands are currently disabled. Please wait while fixes are being applied.`)
      .then(m => setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 5000))
      .catch(() => {});
    return;
  }

  enqueueCommand(() => handleCommand(msg));
});

async function handleCommand(msg) {
  const args = msg.content.trim().split(/\s+/);
  const cmd  = args.shift().toLowerCase();

  // Hard-banned users get their custom message + gif, then everything is deleted after a delay
  if (data.hardBannedUsers.has(msg.author.id)) {
    const { message, gif } = data.hardBannedUsers.get(msg.author.id);
    const m1 = await msg.channel.send(`<@${msg.author.id}> ${message}`).catch(() => null);
    const m2 = await msg.channel.send(gif).catch(() => null);
    msg.delete().catch(() => {});
    setTimeout(() => {
      m1?.delete().catch(() => {});
      m2?.delete().catch(() => {});
    }, 7000);
    return;
  }

  // Special user — sends insult + gif then cleans up
  if (msg.author.id === SPECIAL_USER_ID) {
    const m1 = await msg.channel.send(`<@${msg.author.id}> fuck u kid`).catch(() => null);
    const m2 = await msg.channel.send(SPECIAL_GIF_URL).catch(() => null);
    msg.delete().catch(() => {});
    setTimeout(() => {
      m1?.delete().catch(() => {});
      m2?.delete().catch(() => {});
    }, 7000);
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
    const name     = sanitizeInput(args[0]);
    const username = sanitizeInput(args[1]) || null;
    if (!name) { await reply(msg, 'Missing or invalid name.'); return; }

    const conflict = checkPlayerConflict(name, username);
    if (conflict) {
      await Promise.all([
        sendLog(msg, '⚠️ Add Player — Duplicate', LOG_COLORS.ERROR, [
          { name: 'Name',     value: name,              inline: true },
          { name: 'Username', value: username || 'N/A', inline: true },
          { name: 'Result',   value: conflict,          inline: false }
        ]),
        reply(msg, conflict, 6000)
      ]);
      return;
    }

    const key = username || name;
    if (data.players.has(key)) {
      await Promise.all([
        sendLog(msg, '⚠️ Add Player — Already Exists', LOG_COLORS.ERROR, [
          { name: 'Name',     value: name,              inline: true },
          { name: 'Username', value: username || 'N/A', inline: true },
          { name: 'Result',   value: 'Already on KOS list', inline: false }
        ]),
        reply(msg, `Player already in KOS: ${key}`)
      ]);
      return;
    }

    const player = { name, username, addedBy: msg.author.id };
    data.players.set(key, player);
    indexAdd(player);
    const wasInPriority = [...data.priority].some(k => k.toLowerCase() === name.toLowerCase());
    for (const k of [...data.priority]) { if (k.toLowerCase() === name.toLowerCase()) data.priority.delete(k); }
    const kaSections = wasInPriority ? ['players', 'priority'] : ['players'];
    await Promise.all([
      updateKosList(kaSections),
      sendLog(msg, '✅ Player Added', LOG_COLORS.ADD, [
        { name: 'Name',     value: name,              inline: true },
        { name: 'Username', value: username || 'N/A', inline: true },
        { name: 'Result',   value: 'Added to KOS list', inline: false }
      ]),
      reply(msg, `Added ${name}${username ? ` (${username})` : ''}`)
    ]);
    return;
  }

  // ---------- ^kr ----------
  if (cmd === '^kr') {
    const identifier  = sanitizeInput(args[0]);
    const usernameArg = sanitizeInput(args[1]) || null;
    if (!identifier) { await reply(msg, 'Missing name.'); return; }
    let playerCheck = null;

    if (usernameArg) {
      playerCheck = data.usernameIndex.get(usernameArg.toLowerCase()) || null;
      if (!playerCheck) {
        await Promise.all([
          sendLog(msg, '⚠️ Remove Player — Not Found', LOG_COLORS.ERROR, [
            { name: 'Identifier', value: `${identifier} (${usernameArg})`, inline: true },
            { name: 'Result',     value: 'Player not found by username', inline: false }
          ]),
          reply(msg, `Player not found with username: ${usernameArg}`)
        ]);
        return;
      }
    } else {
      const byName = findPlayersByName(identifier.toLowerCase());
      if (byName.length === 0) {
        playerCheck = findPlayer(identifier);
        if (!playerCheck) {
          await Promise.all([
            sendLog(msg, '⚠️ Remove Player — Not Found', LOG_COLORS.ERROR, [
              { name: 'Identifier', value: identifier, inline: true },
              { name: 'Result',     value: 'Player not found', inline: false }
            ]),
            reply(msg, 'Player not found.')
          ]);
          return;
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
      await Promise.all([
        sendLog(msg, '⛔ Remove Player — Permission Denied', LOG_COLORS.ERROR, [
          { name: 'Target', value: playerCheck.username || playerCheck.name, inline: true },
          { name: 'Result', value: 'User did not add this player', inline: false }
        ]),
        reply(msg, "You didn't add this player.")
      ]);
      return;
    }

    const removeKey = playerKey(playerCheck);
    const removeKeyLower = removeKey.toLowerCase();
    const actualKey = [...data.players.keys()].find(k => k.toLowerCase() === removeKeyLower) || removeKey;
    const removed   = data.players.get(actualKey);
    if (removed) { data.players.delete(actualKey); indexRemove(removed); }
    const krNameLower   = (removed || playerCheck).name.toLowerCase();
    const wasInPriority = [...data.priority].some(k => k.toLowerCase() === krNameLower);
    for (const k of [...data.priority]) { if (k.toLowerCase() === krNameLower) data.priority.delete(k); }
    const krSections = wasInPriority ? ['players', 'priority'] : ['players'];

    const primary = removed || playerCheck;
    await Promise.all([
      updateKosList(krSections),
      sendLog(msg, '🗑️ Player Removed', LOG_COLORS.REMOVE, [
        { name: 'Name',     value: primary.name,              inline: true },
        { name: 'Username', value: primary.username || 'N/A', inline: true },
        { name: 'Result',   value: 'Removed from KOS list', inline: false }
      ]),
      reply(msg, `Removed ${primary.name}${primary.username ? ` (${primary.username})` : ''}`)
    ]);
    return;
  }

  function resolveEditArgs(a) {
    if (a.length >= 4) {
      return {
        oldName: sanitizeInput(a[0]),
        oldUser: a[1] === '-' ? null : sanitizeInput(a[1]),
        newName: sanitizeInput(a[2]),
        newUser: (!a[3] || a[3] === '-') ? null : sanitizeInput(a[3])
      };
    }
    return null;
  }

  // ---------- ^ke ----------
  if (cmd === '^ke') {
    const ea = resolveEditArgs(args);
    if (!ea || !ea.oldName || !ea.newName) {
      await reply(msg, 'Usage: `^ke <oldname> <oldusername|-> <newname> [newusername]`', 6000); return;
    }

    let target = null;
    if (ea.oldUser) {
      target = data.usernameIndex.get(ea.oldUser.toLowerCase()) || null;
    } else {
      const matches = findPlayersByName(ea.oldName.toLowerCase());
      if (matches.length === 1) target = matches[0];
      else if (matches.length > 1) { await reply(msg, `Multiple players named **${ea.oldName}**. Specify username.`, 6000); return; }
      else target = findPlayer(ea.oldName);
    }

    if (!target || target._orphaned) { await reply(msg, 'Player not found.'); return; }
    if (target.addedBy !== msg.author.id && msg.author.id !== OWNER_ID && !canUsePriority(msg)) {
      await reply(msg, "You didn't add this player."); return;
    }

    const oldKey        = playerKey(target);
    const conflict      = checkPlayerConflict(ea.newName, ea.newUser, oldKey);
    if (conflict) { await reply(msg, conflict, 6000); return; }

    const keNameLower   = target.name.toLowerCase();
    const wasInPriority = [...data.priority].some(k => k.toLowerCase() === keNameLower);
    indexRemove(target);
    data.players.delete(oldKey);
    if (wasInPriority) {
      for (const k of [...data.priority]) { if (k.toLowerCase() === keNameLower) data.priority.delete(k); }
    }

    const updated = { name: ea.newName, username: ea.newUser, addedBy: target.addedBy };
    data.players.set(playerKey(updated), updated);
    indexAdd(updated);
    if (wasInPriority) data.priority.add(ea.newName);

    await Promise.all([
      updateKosList(wasInPriority ? ['players', 'priority'] : ['players']),
      sendLog(msg, '✏️ Player Edited', LOG_COLORS.EDIT, [
        { name: 'Old Name',     value: target.name,              inline: true },
        { name: 'Old Username', value: target.username || 'N/A', inline: true },
        { name: 'New Name',     value: ea.newName,               inline: true },
        { name: 'New Username', value: ea.newUser || 'N/A',      inline: true },
        { name: 'Result',       value: 'Player updated',         inline: false }
      ]),
      reply(msg, `Updated **${target.name}** → **${ea.newName}**${ea.newUser ? ` (${ea.newUser})` : ''}`)
    ]);
    return;
  }

  // ---------- ^kca ----------
  if (cmd === '^kca') {
    const clanName   = sanitizeInput(args[0]);
    const clanRegion = sanitizeInput(args[1]);
    if (!clanName)   { await reply(msg, 'Missing name and region.'); return; }
    if (!clanRegion) { await reply(msg, 'Missing region.'); return; }
    const clan = `${clanRegion.toUpperCase()}»${clanName.toUpperCase()}`;
    if (data.clans.has(clan)) {
      await Promise.all([
        sendLog(msg, '⚠️ Add Clan — Already Exists', LOG_COLORS.ERROR, [
          { name: 'Name',   value: clanName.toUpperCase(),   inline: true },
          { name: 'Region', value: clanRegion.toUpperCase(), inline: true },
          { name: 'Result', value: 'Already on KOS list',    inline: false }
        ]),
        reply(msg, `Clan already exists: ${clan}`)
      ]);
      return;
    }
    data.clans.add(clan);
    await Promise.all([
      updateKosList(['clans']),
      sendLog(msg, '✅ Clan Added', LOG_COLORS.CLAN_ADD, [
        { name: 'Name',   value: clanName.toUpperCase(),   inline: true },
        { name: 'Region', value: clanRegion.toUpperCase(), inline: true },
        { name: 'Result', value: 'Clan added to KOS list', inline: false }
      ]),
      reply(msg, `Added clan ${clan}`)
    ]);
    return;
  }

  // ---------- ^kcr ----------
  if (cmd === '^kcr') {
    const clanName   = sanitizeInput(args[0]);
    const clanRegion = sanitizeInput(args[1]);
    if (!clanName)   { await reply(msg, 'Missing name and region.'); return; }
    if (!clanRegion) { await reply(msg, 'Missing region.'); return; }
    const clan = `${clanRegion.toUpperCase()}»${clanName.toUpperCase()}`;
    if (data.clans.delete(clan)) {
      await Promise.all([
        updateKosList(['clans']),
        sendLog(msg, '🗑️ Clan Removed', LOG_COLORS.CLAN_REM, [
          { name: 'Name',   value: clanName.toUpperCase(),       inline: true },
          { name: 'Region', value: clanRegion.toUpperCase(),     inline: true },
          { name: 'Result', value: 'Clan removed from KOS list', inline: false }
        ]),
        reply(msg, `Removed clan ${clan}`)
      ]);
    } else {
      await Promise.all([
        sendLog(msg, '⚠️ Remove Clan — Not Found', LOG_COLORS.ERROR, [
          { name: 'Name',   value: clanName.toUpperCase(),   inline: true },
          { name: 'Region', value: clanRegion.toUpperCase(), inline: true },
          { name: 'Result', value: 'Clan not found',         inline: false }
        ]),
        reply(msg, `Clan not found: ${clan}`)
      ]);
    }
    return;
  }

  // ---------- ^kce ----------
  if (cmd === '^kce') {
    if (!canUsePriority(msg)) { await reply(msg, 'You cannot use clan edit commands.'); return; }
    const oldName   = sanitizeInput(args[0]);
    const oldRegion = sanitizeInput(args[1]);
    const newName   = sanitizeInput(args[2]);
    const newRegion = sanitizeInput(args[3]);
    if (!oldName || !oldRegion) { await reply(msg, 'Usage: `^kce <oldname> <oldregion> <newname> <newregion>`'); return; }
    if (!newName || !newRegion) { await reply(msg, 'Missing new name/region. Usage: `^kce <oldname> <oldregion> <newname> <newregion>`'); return; }

    const oldClan = `${oldRegion.toUpperCase()}»${oldName.toUpperCase()}`;
    const newClan = `${newRegion.toUpperCase()}»${newName.toUpperCase()}`;

    if (!data.clans.has(oldClan)) {
      await Promise.all([
        sendLog(msg, '⚠️ Edit Clan — Not Found', LOG_COLORS.ERROR, [
          { name: 'Clan',   value: oldClan,          inline: true },
          { name: 'Result', value: 'Clan not found', inline: false }
        ]),
        reply(msg, `Clan not found: ${oldClan}`)
      ]);
      return;
    }

    if (oldClan !== newClan && data.clans.has(newClan)) {
      await reply(msg, `Clan already exists: ${newClan}`); return;
    }

    data.clans.delete(oldClan);
    data.clans.add(newClan);
    await Promise.all([
      updateKosList(['clans']),
      sendLog(msg, '✏️ Clan Edited', LOG_COLORS.EDIT, [
        { name: 'Old Clan', value: oldClan,        inline: true },
        { name: 'New Clan', value: newClan,        inline: true },
        { name: 'Result',   value: 'Clan updated', inline: false }
      ]),
      reply(msg, `Updated clan **${oldClan}** → **${newClan}**`)
    ]);
    return;
  }

  // ---------- Priority commands ----------
  if (['^p', '^pr', '^pa', '^pe'].includes(cmd)) {
    if (!canUsePriority(msg)) { await reply(msg, 'You cannot use priority commands.'); return; }

    // ---------- ^pa ----------
    if (cmd === '^pa') {
      const name     = sanitizeInput(args[0]);
      const username = sanitizeInput(args[1]) || null;
      if (!name) { await reply(msg, 'Missing name.'); return; }

      const conflict = checkPlayerConflict(name, username);
      if (conflict) { await reply(msg, conflict, 6000); return; }

      const key = username || name;
      if (data.players.has(key)) { await reply(msg, `Player already exists: ${key}`); return; }

      const player = { name, username, addedBy: msg.author.id };
      data.players.set(key, player);
      indexAdd(player);
      if (![...data.priority].some(k => k.toLowerCase() === name.toLowerCase())) {
        data.priority.add(name);
      }
      await Promise.all([
        updateKosList(['players', 'priority']),
        sendLog(msg, '⭐ Player Added to Priority (Direct)', LOG_COLORS.PRIORITY, [
          { name: 'Name',     value: name,              inline: true },
          { name: 'Username', value: username || 'N/A', inline: true },
          { name: 'Result',   value: 'Added directly to Priority', inline: false }
        ]),
        reply(msg, `Added ${name}${username ? ` (${username})` : ''} directly to priority`)
      ]);
      return;
    }

    const identifier = sanitizeInput(args[0]);
    if (!identifier) { await reply(msg, 'Missing name.'); return; }
    const player = findPlayer(identifier);
    if (!player) { await reply(msg, 'Player not found.'); return; }

    // ---------- ^p ----------
    if (cmd === '^p') {
      if ([...data.priority].some(k => k.toLowerCase() === player.name.toLowerCase())) {
        await reply(msg, `${player.name} is already in priority.`); return;
      }
      data.priority.add(player.name);
      await Promise.all([
        updateKosList(['players', 'priority']),
        sendLog(msg, '⭐ Player Promoted to Priority', LOG_COLORS.PRIORITY, [
          { name: 'Name',     value: player.name,              inline: true },
          { name: 'Username', value: player.username || 'N/A', inline: true },
          { name: 'Result',   value: 'Promoted to Priority',   inline: false }
        ]),
        reply(msg, `Promoted ${player.name} to priority`)
      ]);
      return;
    }

    // ---------- ^pr ----------
    if (cmd === '^pr') {
      const prNameLower = player.name.toLowerCase();
      for (const k of [...data.priority]) { if (k.toLowerCase() === prNameLower) data.priority.delete(k); }
      await Promise.all([
        updateKosList(player._orphaned ? ['priority'] : ['players', 'priority']),
        sendLog(msg, '🔻 Player Removed from Priority', LOG_COLORS.REMOVE, [
          { name: 'Name',     value: player.name,              inline: true },
          { name: 'Username', value: player.username || 'N/A', inline: true },
          { name: 'Result',   value: 'Removed from Priority',  inline: false }
        ]),
        reply(msg, `Removed ${player.name} from priority`)
      ]);
      return;
    }

    // ---------- ^pe ----------
    if (cmd === '^pe') {
      const ea = resolveEditArgs(args);
      if (!ea || !ea.oldName || !ea.newName) {
        await reply(msg, 'Usage: `^pe <oldname> <oldusername|-> <newname> [newusername]`', 6000); return;
      }

      let peTarget = null;
      if (ea.oldUser) {
        peTarget = data.usernameIndex.get(ea.oldUser.toLowerCase()) || null;
      } else {
        const matches = findPlayersByName(ea.oldName.toLowerCase());
        if (matches.length === 1) peTarget = matches[0];
        else if (matches.length > 1) { await reply(msg, `Multiple players named **${ea.oldName}**. Specify username.`, 6000); return; }
        else peTarget = findPlayer(ea.oldName);
      }

      if (!peTarget) { await reply(msg, 'Player not found.'); return; }

      const conflict = checkPlayerConflict(ea.newName, ea.newUser, peTarget._orphaned ? null : playerKey(peTarget));
      if (conflict) { await reply(msg, conflict, 6000); return; }

      if (peTarget._orphaned) {
        const oldKey = peTarget.name;
        for (const k of [...data.priority]) { if (k.toLowerCase() === oldKey.toLowerCase()) data.priority.delete(k); }
        const newRecord = { name: ea.newName, username: ea.newUser, addedBy: msg.author.id };
        data.players.set(playerKey(newRecord), newRecord);
        indexAdd(newRecord);
        data.priority.add(ea.newName);
        await Promise.all([
          updateKosList(['players', 'priority']),
          sendLog(msg, '✏️ Priority Player Edited (Orphan)', LOG_COLORS.EDIT, [
            { name: 'Old Key',      value: oldKey,                   inline: true },
            { name: 'New Name',     value: ea.newName,               inline: true },
            { name: 'New Username', value: ea.newUser || 'N/A',      inline: true },
            { name: 'Result',       value: 'Priority entry updated', inline: false }
          ]),
          reply(msg, `Updated **${oldKey}** → **${ea.newName}**${ea.newUser ? ` (${ea.newUser})` : ''}`)
        ]);
        return;
      }

      const oldKey      = playerKey(peTarget);
      const peNameLower = peTarget.name.toLowerCase();
      const wasInPriority = [...data.priority].some(k => k.toLowerCase() === peNameLower);
      indexRemove(peTarget);
      data.players.delete(oldKey);
      if (wasInPriority) {
        for (const k of [...data.priority]) { if (k.toLowerCase() === peNameLower) data.priority.delete(k); }
      }

      const updated = { name: ea.newName, username: ea.newUser, addedBy: peTarget.addedBy };
      data.players.set(playerKey(updated), updated);
      indexAdd(updated);
      if (wasInPriority) data.priority.add(ea.newName);

      await Promise.all([
        updateKosList(['players', 'priority']),
        sendLog(msg, '✏️ Priority Player Edited', LOG_COLORS.EDIT, [
          { name: 'Old Name',     value: peTarget.name,              inline: true },
          { name: 'Old Username', value: peTarget.username || 'N/A', inline: true },
          { name: 'New Name',     value: ea.newName,                 inline: true },
          { name: 'New Username', value: ea.newUser || 'N/A',        inline: true },
          { name: 'Result',       value: 'Priority player updated',  inline: false }
        ]),
        reply(msg, `Updated **${peTarget.name}** → **${ea.newName}**${ea.newUser ? ` (${ea.newUser})` : ''}`)
      ]);
      return;
    }
  }
}

/* ===================== SLASH COMMANDS (OWNER ONLY) ===================== */
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;
  if (!isOwner(i)) return i.reply({ content: '❌ You are not the owner.', flags: 64 });

  // ---------- /shutdown ----------
  if (i.commandName === 'shutdown') {
    botShutdown = true;
    await i.deferReply({ flags: 64 });
    await saveSettings();
    return i.editReply({ content: '⛔ Bot is now **shut down**. All commands and logs are silenced.' });
  }

  // ---------- /start ----------
  if (i.commandName === 'start') {
    botShutdown = false;
    await i.deferReply({ flags: 64 });
    await saveSettings();
    return i.editReply({ content: '✅ Bot is now **started**. All commands and logs are active.' });
  }

  // Block all other slash commands while shut down (except /start above)
  if (botShutdown) {
    return i.reply({ content: '⛔ Bot is currently shut down. Use `/start` to bring it back online.', flags: 64 });
  }

  if (i.commandName === 'enable') {
    prefixEnabled = true;
    await i.deferReply({ flags: 64 });
    await saveSettings();
    await pushBackup();
    return i.editReply({ content: '✅ Prefix commands **enabled**.' });
  }
  if (i.commandName === 'disable') {
    prefixEnabled = false;
    await i.deferReply({ flags: 64 });
    await saveSettings();
    await pushBackup();
    return i.editReply({ content: '🔴 Prefix commands **disabled**.' });
  }

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
    data.priority = resolvePriority(data.priority);
    console.log('[/list] Priority after fix:', [...data.priority].join(', '));
    await updateKosList(null, true);
    await pushBackup();
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
      await pushBackup();
      return i.editReply({ content: `✅ Cleared ${total} non-bot message${total !== 1 ? 's' : ''}.` });
    } catch { return i.editReply({ content: '❌ Failed to clear messages.' }); }
  }

  if (i.commandName === 'panel') {
    await i.deferReply({ flags: 64 });
    await updatePanel(i.channel);
    await pushBackup();
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
    await pushBackup();
    return i.reply({ content: `✅ Owner role set to <@&${role.id}>.`, flags: 64 });
  }

  if (i.commandName === 'ban') {
    const target = i.options.getUser('user');
    if (target.id === OWNER_ID)          return i.reply({ content: '❌ Cannot ban the bot owner.', flags: 64 });
    if (data.bannedUsers.has(target.id)) return i.reply({ content: `⚠️ ${target.username} is already banned.`, flags: 64 });
    data.bannedUsers.add(target.id);
    saveData();
    await pushBackup();
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
    await pushBackup();
    try {
      const ch = await client.channels.fetch(LOGS_CHANNEL).catch(() => null);
      if (ch) await ch.send({ embeds: [new EmbedBuilder().setColor(LOG_COLORS.ADD)
        .setAuthor({ name: `${i.user.username} (${i.user.id})`, iconURL: getAvatarURL(i.user) })
        .setTitle('✅ User Unbanned').addFields({ name: 'User', value: `${target.username} (${target.id})`, inline: true }).setTimestamp()
      ]}).catch(() => {});
    } catch {}
    return i.reply({ content: `✅ **${target.username}** unbanned.`, flags: 64 });
  }

  // ---------- /hardban ----------
  if (i.commandName === 'hardban') {
    const target  = i.options.getUser('user');
    const message = i.options.getString('message');
    const gif     = i.options.getString('gif');

    if (target.id === OWNER_ID) return i.reply({ content: '❌ Cannot hardban the bot owner.', flags: 64 });
    if (data.hardBannedUsers.has(target.id)) return i.reply({ content: `⚠️ ${target.username} is already hardbanned.`, flags: 64 });

    data.hardBannedUsers.set(target.id, { message, gif });
    data.bannedUsers.add(target.id);   // also covers standard ban checks
    saveData();
    await pushBackup();

    try {
      const ch = await client.channels.fetch(LOGS_CHANNEL).catch(() => null);
      if (ch) await ch.send({ embeds: [new EmbedBuilder().setColor(LOG_COLORS.BAN)
        .setAuthor({ name: `${i.user.username} (${i.user.id})`, iconURL: getAvatarURL(i.user) })
        .setTitle('🔨 User Hardbanned')
        .addFields(
          { name: 'User',    value: `${target.username} (${target.id})`, inline: true  },
          { name: 'Message', value: message,                             inline: false },
          { name: 'GIF',     value: gif,                                 inline: false }
        )
        .setTimestamp()
      ]}).catch(() => {});
    } catch {}

    return i.reply({ content: `🔨 **${target.username}** hardbanned.`, flags: 64 });
  }

  // ---------- /unhardban ----------
  if (i.commandName === 'unhardban') {
    const target = i.options.getUser('user');
    if (!data.hardBannedUsers.has(target.id)) return i.reply({ content: `⚠️ ${target.username} is not hardbanned.`, flags: 64 });
    data.hardBannedUsers.delete(target.id);
    data.bannedUsers.delete(target.id);
    saveData();
    await pushBackup();

    try {
      const ch = await client.channels.fetch(LOGS_CHANNEL).catch(() => null);
      if (ch) await ch.send({ embeds: [new EmbedBuilder().setColor(LOG_COLORS.ADD)
        .setAuthor({ name: `${i.user.username} (${i.user.id})`, iconURL: getAvatarURL(i.user) })
        .setTitle('✅ User Un-Hardbanned')
        .addFields({ name: 'User', value: `${target.username} (${target.id})`, inline: true })
        .setTimestamp()
      ]}).catch(() => {});
    } catch {}

    return i.reply({ content: `✅ **${target.username}** un-hardbanned.`, flags: 64 });
  }
});

/* ===================== HEALTH-CHECK SERVER FOR RENDER ===================== */
require('http').createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(process.env.PORT || 3000);

/* ===================== LOGIN + LOAD ===================== */
client.once('ready', async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);
  loadDedup();
  await loadSettings();
  await loadData();
  await reconcileListMessages();
  schedule24hBackup();
  console.log('[Bot] Ready.');
});

client.login(process.env.BOT_TOKEN)
  .then(() => console.log('[Login] Token accepted, connecting...'))
  .catch(err => console.error('[Login] FAILED:', err.message));
