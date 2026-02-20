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
  bannedUsers: new Set(),
  submissionChannel: null,
  logsChannel: null,
  listMessages: { players: [], priority: [], clans: [] },
  panelMessages: { gif: null, tutorial: null },
  revision: 0
};

/* ===================== LOAD / SAVE ===================== */
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    players: [...data.players.values()],
    priority: [...data.priority],
    clans: [...data.clans],
    bannedUsers: [...data.bannedUsers],
    submissionChannel: data.submissionChannel,
    logsChannel: data.logsChannel,
    listMessages: data.listMessages,
    panelMessages: data.panelMessages,
    revision: data.revision
  }, null, 2));
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return;

  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  data.players = new Map();
  if (raw.players) {
    raw.players.forEach(p => {
      const key = p.username || p.name;
      data.players.set(key, p);
    });
  }

  data.priority = new Set();
  if (raw.topPriority) {
    raw.topPriority.forEach(u => { if (u) data.priority.add(u); });
  }
  if (raw.priority) {
    raw.priority.forEach(u => { if (u) data.priority.add(u); });
  }

  data.clans = new Set(raw.clans || []);
  data.bannedUsers = new Set(raw.bannedUsers || []);
  data.submissionChannel = raw.submissionChannelId || raw.submissionChannel || null;
  data.logsChannel = raw.logsChannel || null;

  if (raw.messages || raw.listMessages) {
    const msgs = raw.messages || raw.listMessages;
    data.listMessages = {
      players: Array.isArray(msgs.players) ? msgs.players : (msgs.players ? [msgs.players] : []),
      priority: Array.isArray(msgs.priority) ? msgs.priority : (msgs.priority ? [msgs.priority] : []),
      clans: Array.isArray(msgs.clans) ? msgs.clans : (msgs.clans ? [msgs.clans] : [])
    };
  }

  data.panelMessages = raw.panelMessages || data.panelMessages;
  data.revision = raw.revision || 0;
}
loadData();

/* ===================== HELPERS ===================== */
function canUsePriority(msg) {
  if (msg.author.id === OWNER_ID) return true;
  return msg.member?.roles.cache.has(PRIORITY_ROLE_ID);
}

function rev() {
  data.revision++;
  return '\u200B'.repeat((data.revision % 10) + 1);
}

// Sends a temp reply then deletes both the reply and the command message
async function reply(msg, text, ms = 3000) {
  const m = await msg.channel.send(`<@${msg.author.id}> ${text}`);
  setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, ms);
}

/* ===================== LOGGER ===================== */
const LOG_COLORS = {
  ADD:      0x57F287, // green
  REMOVE:   0xED4245, // red
  PRIORITY: 0xFEE75C, // yellow
  CLAN_ADD: 0x5865F2, // blurple
  CLAN_REM: 0xEB459E, // fuchsia
  BAN:      0xFF6B35, // orange
  ERROR:    0x95A5A6  // grey
};

async function sendLog(msg, action, color, fields) {
  if (!data.logsChannel) return;
  const logChannel = await client.channels.fetch(data.logsChannel).catch(() => null);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: `${msg.author.username} (${msg.author.id})`,
      iconURL: msg.author.displayAvatarURL()
    })
    .setTitle(action)
    .addFields(fields)
    .setTimestamp()
    .setFooter({ text: `#${msg.channel.name}` });

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

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
    if (!p) p = [...data.players.values()].find(pl => (pl.username || pl.name).toLowerCase() === u.toLowerCase());
    if (!p) return u;
    return `${p.name} : ${p.username || 'N/A'}`;
  });
  return rows.length ? rows.join('\n') : 'None';
}

function formatClans() {
  return data.clans.size ? [...data.clans].sort().join('\n') : 'None';
}

/* ===================== LIST UPDATER ===================== */
let updatingSections = {};

function splitIntoChunks(title, content, revMarker) {
  const MAX_LENGTH = 1900;
  const header = `\`\`\`${title}\n`;
  const footer = `\n\`\`\``;

  const lines = content.split('\n');
  const chunks = [];
  let currentChunk = '';

  for (const line of lines) {
    const testChunk = currentChunk ? `${currentChunk}\n${line}` : line;
    const testLength = header.length + testChunk.length + footer.length + revMarker.length;

    if (testLength > MAX_LENGTH && currentChunk) {
      chunks.push(`${header}${currentChunk}${footer}${revMarker}`);
      currentChunk = line;
    } else {
      currentChunk = testChunk;
    }
  }

  if (currentChunk) {
    chunks.push(`${header}${currentChunk}${footer}${revMarker}`);
  }

  return chunks.length ? chunks : [`${header}None${footer}${revMarker}`];
}

async function updateKosList(channel, sectionToUpdate = null, forceCreate = false) {
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

    const content = getContent();
    const revMarker = rev();
    const chunks = splitIntoChunks(title, content, revMarker);

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
              if (i < chunks.length) {
                await m.edit(chunks[i]).catch(() => {});
              } else {
                await m.delete().catch(() => {});
                storedIds.splice(i, 1);
                i--;
              }
            }
          } else if (i < chunks.length) {
            const m = await channel.send(chunks[i]).catch(() => null);
            if (m) storedIds.push(m.id);
          }
        }
        data.listMessages[key] = storedIds.filter(id => id);
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
      const m = await channel.messages.fetch(id).catch(() => null);
      if (m) return (await m.edit({ embeds: [embed] })).id;
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

  // ---------- Ban guard (owner is always immune) ----------
  if (data.bannedUsers.has(msg.author.id) && msg.author.id !== OWNER_ID) {
    return reply(msg, 'You have been banned from using KOS commands.');
  }

  // ---------- Submission channel guard ----------
  if (data.submissionChannel && msg.channel.id !== data.submissionChannel) {
    const m = await msg.channel.send(`<@${msg.author.id}> Use KOS commands in <#${data.submissionChannel}>.`);
    setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 4000);
    return;
  }

  // ---------- ^ka ----------
  if (cmd === '^ka') {
    const [name, username] = args;

    if (!name) return reply(msg, 'Missing name and username.');
    if (!username) return reply(msg, 'Missing username.');

    if (data.players.has(username)) {
      await sendLog(msg, '⚠️ Add Player — Already Exists', LOG_COLORS.ERROR, [
        { name: 'Name', value: name, inline: true },
        { name: 'Username', value: username, inline: true },
        { name: 'Result', value: 'Already on KOS list', inline: false }
      ]);
      return reply(msg, `Player already in KOS: ${username}`);
    }

    data.players.set(username, { name, username, addedBy: msg.author.id });
    data.priority.delete(username);
    await updateKosList(msg.channel, 'players');

    await sendLog(msg, '✅ Player Added', LOG_COLORS.ADD, [
      { name: 'Name', value: name, inline: true },
      { name: 'Username', value: username, inline: true }
    ]);

    return reply(msg, `Added ${name} (${username})`);
  }

  // ---------- ^kr ----------
  if (cmd === '^kr') {
    const [identifier] = args;
    if (!identifier) return reply(msg, 'Missing name.');

    const player = data.players.get(identifier)
      || [...data.players.values()].find(p => p.name.toLowerCase() === identifier.toLowerCase());

    if (!player) {
      await sendLog(msg, '⚠️ Remove Player — Not Found', LOG_COLORS.ERROR, [
        { name: 'Identifier', value: identifier, inline: true },
        { name: 'Result', value: 'Player not found', inline: false }
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

    const removed = player.username || player.name;
    data.players.delete(removed);
    data.priority.delete(removed);
    await updateKosList(msg.channel, 'players');
    await updateKosList(msg.channel, 'priority');

    await sendLog(msg, '🗑️ Player Removed', LOG_COLORS.REMOVE, [
      { name: 'Name', value: player.name, inline: true },
      { name: 'Username', value: player.username || 'N/A', inline: true }
    ]);

    return reply(msg, `Removed ${removed}`);
  }

  // ---------- ^kca ----------
  if (cmd === '^kca') {
    const [name, region] = args;

    if (!name) return reply(msg, 'Missing name and region.');
    if (!region) return reply(msg, 'Missing region.');

    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;

    if (data.clans.has(clan)) {
      await sendLog(msg, '⚠️ Add Clan — Already Exists', LOG_COLORS.ERROR, [
        { name: 'Clan', value: clan, inline: true },
        { name: 'Result', value: 'Already on KOS list', inline: false }
      ]);
      return reply(msg, `Clan already exists: ${clan}`);
    }

    data.clans.add(clan);
    await updateKosList(msg.channel, 'clans');

    await sendLog(msg, '✅ Clan Added', LOG_COLORS.CLAN_ADD, [
      { name: 'Clan', value: clan, inline: true }
    ]);

    return reply(msg, `Added clan ${clan}`);
  }

  // ---------- ^kcr ----------
  if (cmd === '^kcr') {
    const [name, region] = args;

    if (!name) return reply(msg, 'Missing name and region.');
    if (!region) return reply(msg, 'Missing region.');

    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;

    if (data.clans.delete(clan)) {
      await updateKosList(msg.channel, 'clans');

      await sendLog(msg, '🗑️ Clan Removed', LOG_COLORS.CLAN_REM, [
        { name: 'Clan', value: clan, inline: true }
      ]);

      return reply(msg, `Removed clan ${clan}`);
    } else {
      await sendLog(msg, '⚠️ Remove Clan — Not Found', LOG_COLORS.ERROR, [
        { name: 'Clan', value: clan, inline: true },
        { name: 'Result', value: 'Clan not found', inline: false }
      ]);
      return reply(msg, `Clan not found: ${clan}`);
    }
  }

  // ---------- Priority commands ----------
  if (['^p', '^pr', '^pa'].includes(cmd)) {
    if (!canUsePriority(msg)) {
      return reply(msg, 'You cannot use priority commands.');
    }

    // ^pa — add directly to priority
    if (cmd === '^pa') {
      const [name, username] = args;
      if (!name) return reply(msg, 'Missing name.');

      const key = username || name;
      if (data.players.has(key)) {
        return reply(msg, `Player already exists: ${key}`);
      }

      data.players.set(key, { name, username, addedBy: msg.author.id });
      data.priority.add(key);
      await updateKosList(msg.channel, 'players');
      await updateKosList(msg.channel, 'priority');

      await sendLog(msg, '⭐ Player Added to Priority (Direct)', LOG_COLORS.PRIORITY, [
        { name: 'Name', value: name, inline: true },
        { name: 'Username', value: username || 'N/A', inline: true }
      ]);

      return reply(msg, `Added ${key} directly to priority`);
    }

    const [identifier] = args;
    if (!identifier) return reply(msg, 'Missing name.');

    const player = data.players.get(identifier)
      || [...data.players.values()].find(p => p.name.toLowerCase() === identifier.toLowerCase());

    if (!player) return reply(msg, 'Player not found.');

    if (cmd === '^p') {
      data.priority.add(player.username || player.name);
      await updateKosList(msg.channel, 'players');
      await updateKosList(msg.channel, 'priority');

      await sendLog(msg, '⭐ Player Promoted to Priority', LOG_COLORS.PRIORITY, [
        { name: 'Name', value: player.name, inline: true },
        { name: 'Username', value: player.username || 'N/A', inline: true }
      ]);

      return reply(msg, `Promoted ${player.username || player.name} to priority`);
    }

    if (cmd === '^pr') {
      data.priority.delete(player.username || player.name);
      await updateKosList(msg.channel, 'players');
      await updateKosList(msg.channel, 'priority');

      await sendLog(msg, '🔻 Player Removed from Priority', LOG_COLORS.REMOVE, [
        { name: 'Name', value: player.name, inline: true },
        { name: 'Username', value: player.username || 'N/A', inline: true }
      ]);

      return reply(msg, `Removed ${player.username || player.name} from priority`);
    }
  }
});

/* ===================== SLASH COMMANDS (OWNER ONLY) ===================== */
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;
  if (i.user.id !== OWNER_ID) return;

  // ---------- /submission ----------
  if (i.commandName === 'submission') {
    data.submissionChannel = i.channel.id;
    saveData();
    return i.reply({
      content: `✅ KOS submission commands locked to <#${i.channel.id}>`,
      flags: 64
    });
  }

  // ---------- /logs ----------
  if (i.commandName === 'logs') {
    data.logsChannel = i.channel.id;
    saveData();
    return i.reply({
      content: `✅ KOS command logs will be sent to <#${i.channel.id}>`,
      flags: 64
    });
  }

  // ---------- /panel ----------
  if (i.commandName === 'panel') {
    await i.deferReply({ flags: 64 });
    await updatePanel(i.channel);
    return i.editReply({ content: 'Panel updated.' });
  }

  // ---------- /list ----------
  if (i.commandName === 'list') {
    await i.reply({ content: 'Creating KOS list...', flags: 64 });
    await updateKosList(i.channel, null, true);
    return i.editReply({ content: 'KOS list created.' });
  }

  // ---------- /ban ----------
  if (i.commandName === 'ban') {
    const target = i.options.getUser('user');

    if (target.id === OWNER_ID) {
      return i.reply({ content: '❌ You cannot ban the bot owner.', flags: 64 });
    }

    if (data.bannedUsers.has(target.id)) {
      return i.reply({ content: `⚠️ ${target.username} is already banned.`, flags: 64 });
    }

    data.bannedUsers.add(target.id);
    saveData();

    if (data.logsChannel) {
      const logChannel = await client.channels.fetch(data.logsChannel).catch(() => null);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setColor(LOG_COLORS.BAN)
          .setAuthor({ name: `${i.user.username} (${i.user.id})`, iconURL: i.user.displayAvatarURL() })
          .setTitle('🔨 User Banned from KOS Commands')
          .addFields({ name: 'Banned User', value: `${target.username} (${target.id})`, inline: true })
          .setTimestamp();
        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
    }

    return i.reply({
      content: `🔨 **${target.username}** has been banned from using KOS commands.`,
      flags: 64
    });
  }

  // ---------- /unban ----------
  if (i.commandName === 'unban') {
    const target = i.options.getUser('user');

    if (!data.bannedUsers.has(target.id)) {
      return i.reply({ content: `⚠️ ${target.username} is not currently banned.`, flags: 64 });
    }

    data.bannedUsers.delete(target.id);
    saveData();

    if (data.logsChannel) {
      const logChannel = await client.channels.fetch(data.logsChannel).catch(() => null);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setColor(LOG_COLORS.ADD)
          .setAuthor({ name: `${i.user.username} (${i.user.id})`, iconURL: i.user.displayAvatarURL() })
          .setTitle('✅ User Unbanned from KOS Commands')
          .addFields({ name: 'Unbanned User', value: `${target.username} (${target.id})`, inline: true })
          .setTimestamp();
        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
    }

    return i.reply({
      content: `✅ **${target.username}** has been unbanned from KOS commands.`,
      flags: 64
    });
  }
});

/* ===================== DUMMY SERVER FOR RENDER ===================== */
const PORT = process.env.PORT || 3000;
require('http').createServer((req, res) => res.end('Bot running')).listen(PORT);

/* ===================== LOGIN ===================== */
client.login(process.env.TOKEN);
