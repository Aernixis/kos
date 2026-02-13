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
    .map(p => `${p.name} : ${p.username || 'N/A'}`);
  return rows.length ? rows.join('\n') : 'None';
}

function formatPriority() {
  const rows = [...data.priority]
    .map(u => {
      const p = data.players.get(u);
      if (!p) return null; // skip invalid usernames
      return `${p.name} : ${p.username}`;
    })
    .filter(Boolean);
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
      `Priority ^pa <name> <username> ^p <username> ^pr <username>`
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

  // ---------------- Submission channel lock ----------------
  if (cmd === '^submission') {
    data.submissionChannel = msg.channel.id;
    saveData();
    const m = await msg.channel.send(`KOS commands locked to <#${msg.channel.id}>`);
    setTimeout(() => m.delete().catch(()=>{}), 4000);
    return msg.delete().catch(()=>{});
  }
  if (data.submissionChannel && msg.channel.id !== data.submissionChannel) {
    const m = await msg.channel.send(`Use KOS messages in <#${data.submissionChannel}>.`);
    setTimeout(() => m.delete().catch(()=>{}), 4000);
    return msg.delete().catch(()=>{});
  }

  let changed = false;
  let reply = '';

  // ---------------- Helper for missing params ----------------
  function missing(...params) {
    return msg.channel.send(`Missing ${params.join(' and ')}`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
  }

  // ===== ^ka (add regular KOS player) =====
  if (cmd === '^ka') {
    const [name, username] = args;
    if (!name && !username) return missing('name', 'username');
    if (!name) return missing('name');
    if (!username) return missing('username');
    if (data.players.has(username)) return msg.channel.send(`<@${msg.author.id}> Player already in KOS: ${username}`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
    data.players.set(username, { name, username, addedBy: msg.author.id });
    changed = true;
    reply = `Added ${username}`;
    await updateKosList(msg.channel, 'players');
  }

  // ===== ^pa (add player directly to KOS + priority) =====
  if (cmd === '^pa' && canUsePriority(msg)) {
    const [name, username] = args;
    if (!name && !username) return missing('name', 'username');
    if (!name) return missing('name');
    if (!username) return missing('username');
    if (data.players.has(username)) return msg.channel.send(`<@${msg.author.id}> Player already exists: ${username}`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
    data.players.set(username, { name, username, addedBy: msg.author.id });
    data.priority.add(username);
    changed = true;
    reply = `Added ${username} to KOS and priority`;
    await updateKosList(msg.channel, 'players');
    await updateKosList(msg.channel, 'priority');
  }

  // ===== ^p (promote existing KOS player to priority) =====
  if (cmd === '^p' && canUsePriority(msg)) {
    const [username] = args;
    if (!username) return missing('username');
    if (!data.players.has(username)) return msg.channel.send(`<@${msg.author.id}> Player not found: ${username}`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
    if (data.priority.has(username)) return msg.channel.send(`<@${msg.author.id}> Player already in priority: ${username}`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
    data.priority.add(username);
    changed = true;
    reply = `Promoted ${username} to priority`;
    await updateKosList(msg.channel, 'priority');
  }

  // ===== ^pr (demote priority player to regular KOS) =====
  if (cmd === '^pr' && canUsePriority(msg)) {
    const [username] = args;
    if (!username) return missing('username');
    if (!data.priority.has(username)) return msg.channel.send(`<@${msg.author.id}> Player is not in priority: ${username}`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
    data.priority.delete(username);
    changed = true;
    reply = `Demoted ${username} to regular KOS`;
    await updateKosList(msg.channel, 'priority');
  }

  // ===== ^kr (remove player entirely) =====
  if (cmd === '^kr') {
    const [name, username] = args;
    if (!name && !username) return missing('name', 'username');
    if (!name) return missing('name');
    if (!username) return missing('username');
    let removed = false;
    for (const [u, p] of data.players) {
      if ((username && u === username) || (!username && p.name === name)) {
        if (p.addedBy !== msg.author.id && msg.author.id !== OWNER_ID && !canUsePriority(msg)) {
          msg.channel.send(`<@${msg.author.id}> You didn't add this player.`)
            .then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
          continue;
        }
        data.players.delete(u);
        data.priority.delete(u);
        removed = true;
        reply = `Removed ${u} from KOS`;
        await updateKosList(msg.channel, 'players');
        await updateKosList(msg.channel, 'priority');
        break;
      }
    }
    if (!removed) return msg.channel.send(`<@${msg.author.id}> Player not found.`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),3000));
  }

  // ===== ^kca (add clan) =====
  if (cmd === '^kca') {
    const [name, region] = args;
    if (!name && !region) return missing('name', 'region');
    if (!name) return missing('name');
    if (!region) return missing('region');
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (!data.clans.has(clan)) {
      data.clans.add(clan);
      changed = true;
      reply = `Added clan ${clan}`;
      await updateKosList(msg.channel, 'clans');
    }
  }

  // ===== ^kcr (remove clan) =====
  if (cmd === '^kcr') {
    const [name, region] = args;
    if (!name && !region) return missing('name', 'region');
    if (!name) return missing('name');
    if (!region) return missing('region');
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (data.clans.delete(clan)) {
      changed = true;
      reply = `Removed clan ${clan}`;
      await updateKosList(msg.channel, 'clans');
    }
  }

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
