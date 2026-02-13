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
  players: new Map(),      // username → { name, username, addedBy }
  priority: new Set(),     // username
  clans: new Set(),        // REGION»NAME
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
  data.players = new Map();
  raw.players?.forEach(p => { if (p.username) data.players.set(p.username, p); });
  data.priority = new Set(raw.priority || []);
  data.clans = new Set(raw.clans || []);
  data.submissionChannel = raw.submissionChannel || null;
  data.listMessages = raw.listMessages || data.listMessages;
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
    .filter(p => !data.priority.has(p.username))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => `${p.name} : ${p.username}`);
  return rows.length ? rows.join('\n') : 'None';
}

function formatPriority() {
  const rows = [...data.priority]
    .map(u => {
      const p = data.players.get(u);
      return p ? `${p.name} : ${p.username}` : u; // fallback
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
      `Players ^ka <name> <username> ^kr <name> [username]\n` +
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
    setTimeout(() => m.delete().catch(()=>{}), 4000);
    return msg.delete().catch(()=>{});
  }
  if (data.submissionChannel && msg.channel.id !== data.submissionChannel) {
    const m = await msg.channel.send(`<@${msg.author.id}> Use KOS commands in <#${data.submissionChannel}>.`);
    setTimeout(() => m.delete().catch(()=>{}), 4000);
    return msg.delete().catch(()=>{});
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
    const missing = checkMissing(['name','username'], [name, username]);
    if (missing.length) return msg.channel.send(`<@${msg.author.id}> Missing ${missing.join(' and ')}`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
    if (data.players.has(username)) return msg.channel.send(`<@${msg.author.id}> Player already in KOS: ${username}`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));

    data.players.set(username, { name, username, addedBy: msg.author.id });
    changed = true;
    reply = `Added ${username}`;
    await updateKosList(msg.channel, 'players');
  }

  // ---------- ^kr ----------
  if (cmd === '^kr') {
    const [identifier] = args;
    if (!identifier) return msg.channel.send(`<@${msg.author.id}> Missing name or username`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));

    const player = findPlayer(identifier);
    if (!player) return msg.channel.send(`<@${msg.author.id}> Player not found: ${identifier}`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
    if (player === 'AMBIGUOUS') return msg.channel.send(`<@${msg.author.id}> Multiple players share that name. Please provide a username.`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));

    if (player.addedBy !== msg.author.id && msg.author.id !== OWNER_ID && !canUsePriority(msg)) {
      return msg.channel.send(`<@${msg.author.id}> You didn't add this player.`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
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
    const missing = checkMissing(['name','region'], [name, region]);
    if (missing.length) return msg.channel.send(`<@${msg.author.id}> Missing ${missing.join(' and ')}`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));

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
    const missing = checkMissing(['name','region'], [name, region]);
    if (missing.length) return msg.channel.send(`<@${msg.author.id}> Missing ${missing.join(' and ')}`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));

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
      const missing = checkMissing(['name','username'], [name, username]);
      if (missing.length) return msg.channel.send(`<@${msg.author.id}> Missing ${missing.join(' and ')}`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
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
    if (!identifier) return msg.channel.send(`<@${msg.author.id}> Missing name or username.`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));

    const player = findPlayer(identifier);
    if (!player) return msg.channel.send(`<@${msg.author.id}> Player not found: ${identifier}`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
    if (player === 'AMBIGUOUS') return msg.channel.send(`<@${msg.author.id}> Multiple players share that name. Please provide a username.`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));

    if (cmd === '^p') {
      if (!data.players.has(player.username)) return msg.channel.send(`<@${msg.author.id}> Player not in KOS list.`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
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

  if (i.commandName === 'panel') {
    await i.reply({ content: 'Panel updated.', ephemeral: true });
    await updatePanel(i.channel);
  }

  if (i.commandName === 'list') {
    await i.reply({ content: 'KOS list created.', ephemeral: true });
    await updateKosList(i.channel);
  }
});

/* ===================== LOGIN ===================== */
client.login(process.env.TOKEN);
