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

let listLoadedFromFile = false; // first-time /list load flag

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

function loadLegacyData() {
  if (!fs.existsSync(DATA_FILE)) return;

  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  // Load players
  raw.players?.forEach(p => {
    if (p.username || p.name) {
      data.players.set(p.username || p.name, {
        name: p.name,
        username: p.username || p.name,
        addedBy: p.addedBy || OWNER_ID
      });
    }
  });

  // Load priority
  raw.topPriority?.forEach(u => { if (u) data.priority.add(u); });

  // Load clans
  raw.clans?.forEach(c => { if (c) data.clans.add(c.toUpperCase()); });

  // Submission & message IDs
  data.submissionChannel = raw.submissionChannelId || data.submissionChannel;
  data.listMessages.players = raw.listData?.playersMessageId || data.listMessages.players;
  data.listMessages.priority = raw.listData?.priorityMessageId || data.listMessages.priority;
  data.listMessages.clans = raw.listData?.clansMessageId || data.listMessages.clans;
  data.panelMessages.gif = raw.panelMessages?.gif || data.panelMessages.gif;
  data.panelMessages.tutorial = raw.panelMessages?.tutorial || data.panelMessages.tutorial;

  listLoadedFromFile = true;
}

/* ===================== HELPERS ===================== */
function canUsePriority(msg) {
  return msg.author.id === OWNER_ID || msg.member?.roles.cache.has(PRIORITY_ROLE_ID);
}

function rev() { data.revision++; return '\u200B'.repeat((data.revision % 10) + 1); }

function formatPlayers() {
  const rows = [...data.players.values()]
    .filter(p => !data.priority.has(p.username))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => `${p.name} : ${p.username}`);
  return rows.length ? rows.join('\n') : 'None';
}

function formatPriority() {
  const rows = [...data.priority].map(u => {
    // First try by username
    let p = data.players.get(u);
    if (!p) {
      // Fallback: try matching by name (case-insensitive)
      p = [...data.players.values()].find(pl => pl.name.toLowerCase() === u.toLowerCase());
    }
    return p ? `${p.name} : ${p.username || p.name}` : u; // fallback to raw
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
    .setDescription(
      `Players ^ka <name> <username> ^kr <name>\n` +
      `Clans ^kca <name> <region> ^kcr <name> <region>\n` +
      `Priority ^p <name/username> ^pa <name> <username> ^pr <name/username>`
    );

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
    setTimeout(() => m.delete().catch(() => {}), 4000);
    return msg.delete().catch(() => {});
  }
  if (data.submissionChannel && msg.channel.id !== data.submissionChannel) {
    const m = await msg.channel.send(`<@${msg.author.id}> Use KOS commands in <#${data.submissionChannel}>.`);
    setTimeout(() => m.delete().catch(() => {}), 4000);
    return msg.delete().catch(() => {});
  }

  let changed = false;
  let reply = '';

  // ---------- Helpers ----------
  function checkMissing(params, values) {
    const missing = [];
    params.forEach((p,i) => { if (!values[i]) missing.push(p); });
    return missing;
  }

  function findPlayer(identifier) {
    if (data.players.has(identifier)) return data.players.get(identifier);
    const matches = [...data.players.values()].filter(p => p.name.toLowerCase() === identifier.toLowerCase());
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return 'AMBIGUOUS';
    return null;
  }

  // ---------- ^ka ----------
  if (cmd === '^ka') {
    const [name, username] = args;
    const missing = checkMissing(['name'], [name]);
    if (missing.length) return msg.channel.send(`<@${msg.author.id}> Missing name`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
    if (data.players.has(username)) return msg.channel.send(`<@${msg.author.id}> Player already in KOS: ${username}`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));

    data.players.set(username, { name, username, addedBy: msg.author.id });
    changed = true;
    reply = `Added ${username}`;
    await updateKosList(msg.channel, 'players');
  }

  // ---------- ^kr ----------
  if (cmd === '^kr') {
    const [identifier] = args;
    if (!identifier) return msg.channel.send(`<@${msg.author.id}> Missing name`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));

    const player = findPlayer(identifier);
    if (!player) return msg.channel.send(`<@${msg.author.id}> Player not found`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
    if (player === 'AMBIGUOUS') return msg.channel.send(`<@${msg.author.id}> Multiple players share that name. Please provide a username.`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));

    // Owner or priority role can remove anyone
    if (player.addedBy !== msg.author.id && msg.author.id !== OWNER_ID && !canUsePriority(msg)) {
      return msg.channel.send(`<@${msg.author.id}> You can't remove this player.`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
    }

    data.players.delete(player.username);
    data.priority.delete(player.username);
    changed = true;
    reply = `Removed ${player.username}`;
    await updateKosList(msg.channel, 'players');
    await updateKosList(msg.channel, 'priority');
  }

  // ---------- ^kca ----------
  if (cmd === '^kca') {
    const [name, region] = args;
    const missing = checkMissing(['name', 'region'], [name, region]);
    if (missing.length) return msg.channel.send(`<@${msg.author.id}> Missing name`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));

    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (!data.clans.has(clan)) {
      data.clans.add(clan);
      changed = true;
      reply = `Added clan ${clan}`;
      await updateKosList(msg.channel, 'clans');
    }
  }

  // ---------- ^kcr ----------
  if (cmd === '^kcr') {
    const [name, region] = args;
    const missing = checkMissing(['name', 'region'], [name, region]);
    if (missing.length) return msg.channel.send(`<@${msg.author.id}> Missing name`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));

    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (data.clans.delete(clan)) {
      changed = true;
      reply = `Removed clan ${clan}`;
      await updateKosList(msg.channel, 'clans');
    }
  }

  // ---------- Priority commands ----------
  if (['^p','^pr','^pa'].includes(cmd)) {
    if (!canUsePriority(msg)) return msg.channel.send(`<@${msg.author.id}> You cannot use priority commands.`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));

    if (cmd === '^pa') {
      const [name, username] = args;
      const missing = checkMissing(['name'], [name]);
      if (missing.length) return msg.channel.send(`<@${msg.author.id}> Missing name`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
      if (data.players.has(username)) return msg.channel.send(`<@${msg.author.id}> Player already exists: ${username}`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));

      data.players.set(username, { name, username, addedBy: msg.author.id });
      data.priority.add(username);
      changed = true;
      reply = `Added ${username} directly to priority`;
      await updateKosList(msg.channel, 'players');
      await updateKosList(msg.channel, 'priority');
      return;
    }

    const [identifier] = args;
    if (!identifier) return msg.channel.send(`<@${msg.author.id}> Missing name`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));

    const player = findPlayer(identifier);
    if (!player) return msg.channel.send(`<@${msg.author.id}> Player not found`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
    if (player === 'AMBIGUOUS') return msg.channel.send(`<@${msg.author.id}> Multiple players share that name. Please provide a username.`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));

    if (cmd === '^p') {
      data.priority.add(player.username);
      reply = `Promoted ${player.username} to priority`;
    } else if (cmd === '^pr') {
      data.priority.delete(player.username);
      reply = `Removed ${player.username} from priority`;
    }

    changed = true;
    await updateKosList(msg.channel, 'priority');
  }

  // ---------- Send reply ----------
  if (!changed) return msg.delete().catch(()=>{});
  saveData();
  const m = await msg.channel.send(`<@${msg.author.id}> ${reply}`);
  setTimeout(() => m.delete().catch(()=>{}), 3000);
  msg.delete().catch(()=>{});
});

/* ===================== SLASH COMMANDS ===================== */
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;

  try {
    if (i.commandName === 'list') {
      await i.deferReply({ ephemeral: true });

      if (!listLoadedFromFile) loadLegacyData();

      await updateKosList(i.channel);
      await i.editReply({ content: 'KOS list created.' });
    }

    if (i.commandName === 'panel') {
      await i.deferReply({ ephemeral: true });
      await updatePanel(i.channel);
      await i.editReply({ content: 'Panel updated.' });
    }
  } catch (err) {
    console.error('Interaction error:', err);
  }
});

/* ===================== LOGIN ===================== */
client.login(process.env.TOKEN);

