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
const SETTINGS_FILE      = './settings.json';
const DEDUP_FILE         = './dedup.json';
const SPECIAL_USER_ID    = '760369177180897290';
const SPECIAL_GIF_URL    = 'https://tenor.com/view/chainsawman-chainsaw-man-reze-reze-arc-chainsaw-man-reze-gif-13447210726051357373';
const SUBMISSION_CHANNEL = '1450867784543113318';
const LOGS_CHANNEL       = '1473800222927880223';
const BACKUP_CHANNEL     = '1475960780976292051';
const DEDUP_TTL_MS       = 30_000;

// Whitelist valid commands — fast-rejects unknown prefixed messages before queuing
const VALID_COMMANDS = new Set(['^ka', '^kr', '^ke', '^kca', '^kcr', '^kce', '^p', '^pr', '^pa', '^pe']);

/* ===================== INPUT SANITIZATION ===================== */
/**
 * Strip control characters and limit length to prevent injection / oversized inputs.
 * Max 64 chars covers any realistic game name or username.
 */
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

// Debounced async flush — never blocks the event loop on every message
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

function saveSettings() {
  const payload = JSON.stringify({ prefixEnabled }, null, 2);
  fsp.writeFile(SETTINGS_FILE, payload).catch(e => console.error('[Settings] Write failed:', e.message));
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      if (typeof raw.prefixEnabled === 'boolean') prefixEnabled = raw.prefixEnabled;
      console.log(`[Settings] Loaded — prefixEnabled: ${prefixEnabled}`);
    }
  } catch (e) { console.warn('[Settings] Load failed:', e.message); }
}

/* ===================== DATA ===================== */
/**
 * O(1) indexes for player lookups — maintained alongside data.players.
 *   nameIndex:     lowercase display name → player object
 *   usernameIndex: lowercase username     → player object
 */
let data = {
  players:         new Map(),
  nameIndex:       new Map(),
  usernameIndex:   new Map(),
  priority:        new Set(),
  clans:           new Set(),
  bannedUsers:     new Set(),
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

/** O(1) player lookup via indexes */
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

/** Returns all players sharing a display name (handles duplicates) */
function findPlayersByName(nameLower) {
  const exact = data.nameIndex.get(nameLower);
  if (!exact) return [];
  return [...data.players.values()].filter(p => p.name.toLowerCase() === nameLower);
}

/**
 * Checks whether a name+username combo would conflict with any existing player.
 * Pass excludeKey to skip the player currently being edited.
 * Returns an error string if there's a conflict, or null if clear.
 */
function checkPlayerConflict(name, username, excludeKey = null) {
  const nameLower = name ? name.toLowerCase() : null;
  const userLower = username ? username.toLowerCase() : null;

  for (const [key, p] of data.players.entries()) {
    if (excludeKey && key === excludeKey) continue;

    // Duplicate username — always a hard conflict
    if (userLower && p.username && p.username.toLowerCase() === userLower) {
      return `Username **${p.username}** is already taken by **${p.name}**.`;
    }

    // Same display name with no username on either side — ambiguous, block it
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
  // Sanitize legacy priority keys — strip @ prefix, resolve "username : name" or "name : username" to just the display name
  const sanitizePriorityKey = (u) => {
    if (!u) return null;
    u = u.trim();
    // Strip leading @ (e.g. "@username")
    if (u.startsWith('@')) u = u.slice(1).trim();
    // Strip inline @username suffix (e.g. "Rekt @primalflick2024" → "Rekt")
    if (u.includes(' @')) u = u.split(' @')[0].trim();
    // Strip " : username" suffix (e.g. "name : username" → "name")
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
  rebuildIndexes(); // must come before priority resolution so indexes are available
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
  // Async write — never blocks the event loop
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

/**
 * Resolves a Set of priority keys to canonical display names.
 * Handles legacy formats: raw username, "@username", "Name @username", "name : username".
 * Deduplicates case-insensitively.
 */
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
    // Clean orphan — just a name with no player record yet
    if (!seen.has(k.toLowerCase())) { resolved.add(k); seen.add(k.toLowerCase()); }
  }
  return resolved;
}

/**
 * Removes duplicate players from data.players (same name+username combo).
 * Also removes any player whose name already appears in another entry with same casing.
 * Called after any bulk load to guarantee no duplicates exist.
 */
function deduplicatePlayers() {
  const seenNames = new Map();     // lowercase name → first player seen
  const seenUsernames = new Set(); // lowercase username
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
\`^ka name username\` – Add a player (username optional)
\`^kr name\` – Remove a player
\`^ke name newname newusername\` – Edit a player (use \`-\` to clear username)

Examples
\`^ka poison poisonrebuild\` | \`^ka poison\` | \`^kr poison\`
\`^ke poison newpoison newpoisonuser\` | \`^ke poison newpoison -\`

**Clan Commands**
\`^kca name region\` – Add a clan
\`^kcr name region\` – Remove a clan
\`^kce oldname oldregion newname newregion\` – Edit a clan

Examples
\`^kca yx eu\` | \`^kcr yx eu\` | \`^kce yx eu yx na\`

**Priority Commands (YX Founders Only)**
\`^p name\` – Promote a player to priority
\`^pr name\` – Remove a player from priority
\`^pa name\` – Add player directly to priority
\`^pe name newname newusername\` – Edit a priority player (use \`-\` to clear username)

Examples
\`^p poison\` | \`^pr poison\` | \`^pa poison\` | \`^pe poison newpoison newpoisonuser\`

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

  // Fast-reject: only handle known commands
  const cmd = msg.content.trim().split(/\s+/)[0].toLowerCase();
  if (!VALID_COMMANDS.has(cmd)) return;

  // /disable blocks ALL non-owner, non-priority-role prefix commands before they touch the queue.
  // The disabled message is sent and both messages are deleted after a short delay.
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

  if (msg.author.id === SPECIAL_USER_ID) {
    await msg.channel.send(`<@${msg.author.id}> fuck u kid`);
    await msg.channel.send(SPECIAL_GIF_URL);
    msg.delete().catch(() => {});
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

    // Full conflict check covers duplicate names (no username) and duplicate usernames
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
    // Case-insensitive map lookup — key casing may differ from what was stored
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

  // ---------- ^ke ----------
  // Usage: ^ke <identifier> <newname> [newusername | -]
  // "-" as newusername explicitly clears it; omitting leaves it unchanged.
  if (cmd === '^ke') {
    const identifier = sanitizeInput(args[0]);
    const newName    = sanitizeInput(args[1]);
    const rawUser    = args[2];
    if (!identifier) { await reply(msg, 'Usage: `^ke <name> <newname> [newusername|-]`'); return; }
    if (!newName)    { await reply(msg, 'Missing new name. Usage: `^ke <name> <newname> [newusername|-]`'); return; }

    const clearUser = rawUser === '-';
    const newUser   = clearUser ? null : (sanitizeInput(rawUser) || null);

    // Resolve which player to edit
    const byName = findPlayersByName(identifier.toLowerCase());
    let target = null;
    if (byName.length === 0) {
      target = findPlayer(identifier);
    } else if (byName.length > 1) {
      await reply(msg,
        `${byName.length} players share the name **${identifier}**. Use a username to identify: \`^ke <username> ...\``,
        6000); return;
    } else {
      target = byName[0];
    }

    if (!target || target._orphaned) { await reply(msg, 'Player not found.'); return; }

    // Permission: must be the adder, priority role, or owner
    if (target.addedBy !== msg.author.id && msg.author.id !== OWNER_ID && !canUsePriority(msg)) {
      await reply(msg, "You didn't add this player."); return;
    }

    const oldKey   = playerKey(target);
    const finalUser = clearUser ? null : (newUser ?? target.username);
    const conflict  = checkPlayerConflict(newName, finalUser, oldKey);
    if (conflict) { await reply(msg, conflict, 6000); return; }

    // Determine if this player is in priority so we keep them there under the new name
    const keNameLower   = target.name.toLowerCase();
    const wasInPriority = [...data.priority].some(k => k.toLowerCase() === keNameLower);

    // Swap out the old record for the new one
    indexRemove(target);
    data.players.delete(oldKey);
    if (wasInPriority) {
      for (const k of [...data.priority]) {
        if (k.toLowerCase() === keNameLower) data.priority.delete(k);
      }
    }

    const updated = { name: newName, username: finalUser, addedBy: target.addedBy };
    const newKey  = playerKey(updated);
    data.players.set(newKey, updated);
    indexAdd(updated);
    if (wasInPriority) data.priority.add(newName);

    const keSections = wasInPriority ? ['players', 'priority'] : ['players'];
    await Promise.all([
      updateKosList(keSections),
      sendLog(msg, '✏️ Player Edited', LOG_COLORS.EDIT, [
        { name: 'Old Name',     value: target.name,              inline: true },
        { name: 'Old Username', value: target.username || 'N/A', inline: true },
        { name: 'New Name',     value: newName,                  inline: true },
        { name: 'New Username', value: finalUser || 'N/A',       inline: true },
        { name: 'Result',       value: 'Player updated',         inline: false }
      ]),
      reply(msg, `Updated **${target.name}** → **${newName}**${finalUser ? ` (${finalUser})` : ''}`)
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
  // Usage: ^kce <oldname> <oldregion> <newname> <newregion>
  // Priority-role only (same gate as priority commands).
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
          { name: 'Clan',   value: oldClan,        inline: true },
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
      // Guard against adding the same key twice to priority
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
      // Refuse silently if already in priority
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
    // Usage: ^pe <identifier> <newname> [newusername | -]
    // Works like ^ke but is restricted to priority-role holders.
    // Also fixes up the priority set key so the player stays in priority under their new key.
    if (cmd === '^pe') {
      const newName  = sanitizeInput(args[1]);
      const rawUser  = args[2];
      if (!newName) { await reply(msg, 'Usage: `^pe <name> <newname> [newusername|-]`'); return; }

      const clearUser = rawUser === '-';
      const newUser   = clearUser ? null : (sanitizeInput(rawUser) || null);

      if (player._orphaned) {
        // Orphaned priority entry — no player record, just rename the key and create the record
        const finalUser = clearUser ? null : (newUser ?? null);
        const conflict  = checkPlayerConflict(newName, finalUser);
        if (conflict) { await reply(msg, conflict, 6000); return; }

        const oldKey = player.name;
        for (const k of [...data.priority]) {
          if (k.toLowerCase() === oldKey.toLowerCase()) data.priority.delete(k);
        }
        const newKey    = finalUser || newName;
        const newRecord = { name: newName, username: finalUser, addedBy: msg.author.id };
        data.players.set(newKey, newRecord);
        indexAdd(newRecord);
        data.priority.add(newName);

        await Promise.all([
          updateKosList(['players', 'priority']),
          sendLog(msg, '✏️ Priority Player Edited (Orphan)', LOG_COLORS.EDIT, [
            { name: 'Old Key',      value: oldKey,             inline: true },
            { name: 'New Name',     value: newName,            inline: true },
            { name: 'New Username', value: finalUser || 'N/A', inline: true },
            { name: 'Result',       value: 'Priority entry updated', inline: false }
          ]),
          reply(msg, `Updated priority entry **${oldKey}** → **${newName}**${finalUser ? ` (${finalUser})` : ''}`)
        ]);
        return;
      }

      const oldKey      = playerKey(player);
      const peNameLower = player.name.toLowerCase();
      const finalUser   = clearUser ? null : (newUser ?? player.username);
      const conflict    = checkPlayerConflict(newName, finalUser, oldKey);
      if (conflict) { await reply(msg, conflict, 6000); return; }

      const wasInPriority = [...data.priority].some(k => k.toLowerCase() === peNameLower);

      indexRemove(player);
      data.players.delete(oldKey);
      if (wasInPriority) {
        for (const k of [...data.priority]) {
          if (k.toLowerCase() === peNameLower) data.priority.delete(k);
        }
      }

      const updated = { name: newName, username: finalUser, addedBy: player.addedBy };
      const newKey  = playerKey(updated);
      data.players.set(newKey, updated);
      indexAdd(updated);
      if (wasInPriority) data.priority.add(newName);

      await Promise.all([
        updateKosList(['players', 'priority']),
        sendLog(msg, '✏️ Priority Player Edited', LOG_COLORS.EDIT, [
          { name: 'Old Name',     value: player.name,              inline: true },
          { name: 'Old Username', value: player.username || 'N/A', inline: true },
          { name: 'New Name',     value: newName,                  inline: true },
          { name: 'New Username', value: finalUser || 'N/A',       inline: true },
          { name: 'Result',       value: 'Priority player updated', inline: false }
        ]),
        reply(msg, `Updated **${player.name}** → **${newName}**${finalUser ? ` (${finalUser})` : ''}`)
      ]);
      return;
    }
  }
}

/* ===================== SLASH COMMANDS (OWNER ONLY) ===================== */
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;
  if (!isOwner(i)) return i.reply({ content: '❌ You are not the owner.', flags: 64 });

  if (i.commandName === 'enable')  {
    prefixEnabled = true;
    saveSettings();
    await pushBackup();
    return i.reply({ content: '✅ Prefix commands **enabled**.', flags: 64 });
  }
  if (i.commandName === 'disable') {
    prefixEnabled = false;
    saveSettings();
    await pushBackup();
    return i.reply({ content: '🔴 Prefix commands **disabled**.', flags: 64 });
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
    // Force-resolve priority keys to display names — fixes any legacy data still in the backup
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
  loadSettings();
  await loadData();
  await reconcileListMessages();
  schedule24hBackup();
  console.log('[Bot] Ready.');
});

client.login(process.env.TOKEN);
