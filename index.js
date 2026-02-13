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
  players: [],        // array of { name, username, addedBy }
  topPriority: [],    // array of usernames
  clans: [],          // array of strings REGION»NAME
  submissionChannelId: null,
  listData: {         // section message IDs
    playersMessageId: null,
    priorityMessageId: null,
    clansMessageId: null
  },
  panelMessages: {
    gif: null,
    tutorial: null
  },
  revision: 0
};

/* ===================== LOAD / SAVE ===================== */
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return;
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  data = { ...data, ...raw };
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

async function deleteTogether(userMsg, botMsg, delay = 3000) {
  setTimeout(() => {
    userMsg?.delete().catch(() => {});
    botMsg?.delete().catch(() => {});
  }, delay);
}

/* ===================== FORMATTERS ===================== */
function formatPlayers() {
  return data.players
    .filter(p => !data.topPriority.includes(p.username))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => `${p.name} : ${p.username || 'N/A'}`)
    .join('\n') || 'None';
}

function formatPriority() {
  return data.topPriority
    .map(u => {
      const p = data.players.find(p => p.username === u);
      return p ? `${p.name} : ${p.username}` : null; // leave missing usernames blank
    })
    .filter(Boolean)
    .join('\n') || 'None';
}

function formatClans() {
  return data.clans.length ? [...data.clans].sort().join('\n') : 'None';
}

/* ===================== SECTION-UPDATER ===================== */
async function updateSection(channel, key) {
  if (!channel) return;

  const map = {
    players: ['–––––– PLAYERS ––––––', formatPlayers(), data.listData.playersMessageId],
    topPriority: ['–––––– PRIORITY ––––––', formatPriority(), data.listData.priorityMessageId],
    clans: ['–––––– CLANS ––––––', formatClans(), data.listData.clansMessageId]
  };

  const [title, content, msgId] = map[key];
  if (!msgId) return; // never create messages from prefix commands

  const msg = await channel.messages.fetch(msgId).catch(() => null);
  if (msg) await msg.edit(`\`\`\`${title}\n${content}\n\`\`\`${rev()}`);
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
      `Players ^ka name username ^kr name username\nClans ^kca name region ^kcr name region\nPriority ^p add username ^p remove username`
    );

  async function upsert(id, embed) {
    if (id) {
      const msg = await channel.messages.fetch(id).catch(() => null);
      if (msg) return (await msg.edit({ embeds: [embed] })).id;
    }
    const msg = await channel.send({ embeds: [embed] });
    return msg.id;
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

  /* SUBMISSION */
  if (cmd === '^submission') {
    data.submissionChannelId = msg.channel.id;
    saveData();
    const m = await msg.channel.send(`KOS commands locked to <#${msg.channel.id}>`);
    return deleteTogether(msg, m, 4000);
  }

  if (data.submissionChannelId && msg.channel.id !== data.submissionChannelId) {
    const m = await msg.channel.send(`Use KOS messages in <#${data.submissionChannelId}>.`);
    return deleteTogether(msg, m, 4000);
  }

  /* ===================== ADD PLAYER ^ka ===================== */
  if (cmd === '^ka') {
    const [name, username] = args;
    if (!username) return;

    const exists = data.players.some(p => p.username === username);
    if (exists) {
      const m = await msg.channel.send(`<@${msg.author.id}> Player already in KOS.`);
      return deleteTogether(msg, m);
    }

    data.players.push({ name, username, addedBy: msg.author.id });
    saveData();

    if (data.listData.playersMessageId) await updateSection(msg.channel, 'players');

    const m = await msg.channel.send(`<@${msg.author.id}> Added ${name} : ${username}`);
    return deleteTogether(msg, m);
  }

  /* ===================== REMOVE PLAYER ^kr ===================== */
  if (cmd === '^kr') {
    const [nameOrUsername, maybeUsername] = args;
    let removed = false;

    if (maybeUsername) {
      const index = data.players.findIndex(p => p.username === maybeUsername);
      if (index !== -1) {
        const removedPlayer = data.players.splice(index, 1)[0];
        data.topPriority = data.topPriority.filter(u => u !== removedPlayer.username);
        removed = true;
      }
    } else {
      const index = data.players.findIndex(p => p.name === nameOrUsername);
      if (index !== -1) {
        const removedPlayer = data.players.splice(index, 1)[0];
        data.topPriority = data.topPriority.filter(u => u !== removedPlayer.username);
        removed = true;
      }
    }

    if (!removed) return;

    saveData();
    if (data.listData.playersMessageId) await updateSection(msg.channel, 'players');

    const m = await msg.channel.send(`<@${msg.author.id}> Removed ${maybeUsername || nameOrUsername}`);
    return deleteTogether(msg, m);
  }

  /* ===================== ADD CLAN ^kca ===================== */
  if (cmd === '^kca') {
    const [name, region] = args;
    if (!name || !region) return;
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (!data.clans.includes(clan)) {
      data.clans.push(clan);
      saveData();
      if (data.listData.clansMessageId) await updateSection(msg.channel, 'clans');
      const m = await msg.channel.send(`<@${msg.author.id}> Added clan ${clan}`);
      return deleteTogether(msg, m);
    }
  }

  /* ===================== REMOVE CLAN ^kcr ===================== */
  if (cmd === '^kcr') {
    const [name, region] = args;
    if (!name || !region) return;
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    const index = data.clans.indexOf(clan);
    if (index !== -1) {
      data.clans.splice(index, 1);
      saveData();
      if (data.listData.clansMessageId) await updateSection(msg.channel, 'clans');
      const m = await msg.channel.send(`<@${msg.author.id}> Removed clan ${clan}`);
      return deleteTogether(msg, m);
    }
  }

  /* ===================== PRIORITY ^p ===================== */
  if (cmd === '^p' && canUsePriority(msg)) {
    if (args[0] === 'add' && args[1]) {
      if (!data.topPriority.includes(args[1])) data.topPriority.push(args[1]);
      saveData();
      if (data.listData.priorityMessageId) await updateSection(msg.channel, 'topPriority');
      const m = await msg.channel.send(`<@${msg.author.id}> Added ${args[1]} to priority`);
      return deleteTogether(msg, m);
    }

    if (args[0] === 'remove' && args[1]) {
      data.topPriority = data.topPriority.filter(u => u !== args[1]);
      saveData();
      if (data.listData.priorityMessageId) await updateSection(msg.channel, 'topPriority');
      const m = await msg.channel.send(`<@${msg.author.id}> Removed ${args[1]} from priority`);
      return deleteTogether(msg, m);
    }
  }
});

/* ===================== SLASH COMMANDS ===================== */
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;

  if (i.user.id !== OWNER_ID) {
    return i.reply({ content: 'Only the bot owner can use this command.', ephemeral: true }).catch(() => {});
  }

  if (i.commandName === 'panel') {
    await i.reply({ content: 'Panel updated.', ephemeral: true });
    await updatePanel(i.channel);
  }

  if (i.commandName === 'list') {
    await i.reply({ content: 'KOS list created.', ephemeral: true });

    const sections = ['players', 'topPriority', 'clans'];
    for (const key of sections) {
      if (!data.listData[`${key}MessageId`]) {
        const map = {
          players: formatPlayers(),
          topPriority: formatPriority(),
          clans: formatClans()
        };
        const text = `\`\`\`–––––– ${key.toUpperCase()} ––––––\n${map[key]}\n\`\`\`${rev()}`;
        const msg = await i.channel.send(text);
        data.listData[`${key}MessageId`] = msg.id;
      }
    }
    saveData();
  }
});

/* ===================== LOGIN ===================== */
client.login(process.env.TOKEN);
