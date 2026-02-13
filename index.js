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
      return p ? `${p.name} : ${p.username}` : `${u} : ${u}`;
    })
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
  if (!msgId) return; // Never create messages from prefix commands

  const text = `\`\`\`${title}\n${content}\n\`\`\`${rev()}`;

  const msg = await channel.messages.fetch(msgId).catch(() => null);
  if (msg) await msg.edit(text);
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
    deleteTogether(msg, m, 4000);
    return;
  }

  if (data.submissionChannelId && msg.channel.id !== data.submissionChannelId) {
    const m = await msg.channel.send(`Use KOS messages in <#${data.submissionChannelId}>.`);
    deleteTogether(msg, m, 4000);
    return;
  }

  let changed = false;
  let reply = '';

  /* ADD PLAYER */
  if (cmd === '^ka') {
    const [name, username] = args;
    if (!username || data.players.some(p => p.username === username)) return;

    data.players.push({ name, username, addedBy: msg.author.id });
    saveData();
    changed = true;
    reply = `Added ${name} : ${username}`;

    // update section ONLY if message exists
    if (data.listData.playersMessageId) await updateSection(msg.channel, 'players');
  }

  /* REMOVE PLAYER */
  if (cmd === '^kr') {
    const username = args[0];
    const index = data.players.findIndex(p => p.username === username);
    if (index !== -1) {
      data.players.splice(index, 1);
      data.topPriority = data.topPriority.filter(u => u !== username);
      saveData();
      changed = true;
      reply = `Removed ${username}`;
      if (data.listData.playersMessageId) await updateSection(msg.channel, 'players');
    }
  }

  /* ADD CLAN */
  if (cmd === '^kca') {
    const [name, region] = args;
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (!data.clans.includes(clan)) {
      data.clans.push(clan);
      saveData();
      changed = true;
      reply = `Added clan ${clan}`;
      if (data.listData.clansMessageId) await updateSection(msg.channel, 'clans');
    }
  }

  /* REMOVE CLAN */
  if (cmd === '^kcr') {
    const [name, region] = args;
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    const index = data.clans.indexOf(clan);
    if (index !== -1) {
      data.clans.splice(index, 1);
      saveData();
      changed = true;
      reply = `Removed clan ${clan}`;
      if (data.listData.clansMessageId) await updateSection(msg.channel, 'clans');
    }
  }

  /* PRIORITY */
  if (cmd === '^p' && canUsePriority(msg)) {
    if (args[0] === 'add') {
      if (!data.topPriority.includes(args[1])) data.topPriority.push(args[1]);
      saveData();
      changed = true;
      reply = `Added ${args[1]} to priority`;
      if (data.listData.priorityMessageId) await updateSection(msg.channel, 'topPriority');
    }
    if (args[0] === 'remove') {
      data.topPriority = data.topPriority.filter(u => u !== args[1]);
      saveData();
      changed = true;
      reply = `Removed ${args[1]} from priority`;
      if (data.listData.priorityMessageId) await updateSection(msg.channel, 'topPriority');
    }
  }

  if (!changed) return;

  const m = await msg.channel.send(`<@${msg.author.id}> ${reply}`);
  deleteTogether(msg, m);
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

    // create section messages if missing
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
