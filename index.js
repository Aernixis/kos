require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');

const OWNER_ID = '1283217337084018749';

const dataFile = './data.json';
let data = {
  regular: [],
  priority: [],
  clans: [],
  submissionChannelId: null,
  listChannelId: null,
};

// Load saved data if exists
if (fs.existsSync(dataFile)) {
  try {
    const saved = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    data = { ...data, ...saved };
  } catch {
    console.log('Failed to load data.json, starting fresh.');
  }
}

function saveData() {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

function ownerOnly(interaction) {
  if (interaction.user.id !== OWNER_ID) {
    interaction.reply({ content: '❌ You are not authorized to use this bot.', ephemeral: true });
    return false;
  }
  return true;
}

// Utility to update KOS list messages in the list channel
async function updateListMessages(channel) {
  if (!channel) return;
  data.regular = data.regular || [];
  data.priority = data.priority || [];
  data.clans = data.clans || [];

  const regularText = '```' + data.regular.sort().join('\n') + '```';
  const priorityText = '```' + data.priority.sort().join('\n') + '```';
  const clansText = '```' + data.clans.sort().join('\n') + '```';

  // Clear previous messages before posting? Optional
  // await channel.bulkDelete(10);

  await channel.send({ content: regularText }).catch(console.error);
  await channel.send({ content: priorityText }).catch(console.error);
  await channel.send({ content: clansText }).catch(console.error);
}

// PREFIX COMMAND HANDLER
async function handlePrefix(message) {
  if (message.author.bot) return;
  if (message.author.id !== OWNER_ID) return;

  const content = message.content.trim();
  const args = content.split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // Helper: respond + auto delete
  async function quickPing(text) {
    const reply = await message.channel.send(`${message.author}, ${text}`);
    setTimeout(() => reply.delete().catch(() => {}), 3000);
    setTimeout(() => message.delete().catch(() => {}), 3000);
  }

  // PLAYER ADD
  if (cmd === '^kos' && args[0] === 'add' || cmd === '^ka') {
    const [name, username] = args.slice(cmd === '^ka' ? 0 : 1);
    if (!name || !username) return;
    const entry = `${name} : ${username}`;
    if (!data.regular.includes(entry)) data.regular.push(entry);
    saveData();
    quickPing('Player added!');
    if (data.listChannelId) {
      const ch = message.guild.channels.cache.get(data.listChannelId);
      updateListMessages(ch);
    }
  }

  // PLAYER REMOVE
  if (cmd === '^kos' && args[0] === 'remove' || cmd === '^kr') {
    const [name, username] = args.slice(cmd === '^kr' ? 0 : 1);
    if (!name || !username) return;
    const entry = `${name} : ${username}`;
    data.regular = data.regular.filter(e => e !== entry);
    saveData();
    quickPing('Player removed!');
    if (data.listChannelId) {
      const ch = message.guild.channels.cache.get(data.listChannelId);
      updateListMessages(ch);
    }
  }

  // CLAN ADD
  if (cmd === '^kos' && args[0] === 'clan' && args[1] === 'add' || cmd === '^kca') {
    const [name, region] = args.slice(cmd === '^kca' ? 0 : 2);
    if (!name || !region) return;
    const entry = `${name} » ${region}`;
    if (!data.clans.includes(entry)) data.clans.push(entry);
    saveData();
    quickPing('Clan added!');
    if (data.listChannelId) {
      const ch = message.guild.channels.cache.get(data.listChannelId);
      updateListMessages(ch);
    }
  }

  // CLAN REMOVE
  if (cmd === '^kos' && args[0] === 'clan' && args[1] === 'remove' || cmd === '^kcr') {
    const [name, region] = args.slice(cmd === '^kcr' ? 0 : 2);
    if (!name || !region) return;
    const entry = `${name} » ${region}`;
    data.clans = data.clans.filter(e => e !== entry);
    saveData();
    quickPing('Clan removed!');
    if (data.listChannelId) {
      const ch = message.guild.channels.cache.get(data.listChannelId);
      updateListMessages(ch);
    }
  }
}

// SLASH COMMAND HANDLER
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!ownerOnly(interaction)) return;

  const { commandName } = interaction;

  if (commandName === 'panel') {
    const embed = new EmbedBuilder()
      .setTitle('KOS Submission System')
      .setDescription(
`This bot organizes LBG players and clans onto the KOS list for YX members.

Players
* To add players, use the command ^kos add or ^ka
* When adding players, place the name before the username
Example:
^kos add poison poisonrebuild
^ka poison poisonrebuild
* To remove players, use the command ^kos remove or ^kr
* Removing players follows the same format as adding them
Example:
^kos remove poison poisonrebuild
^kr poison poisonrebuild

Clans
* To add clans, use the command ^kos clan add or ^kca
* When adding clans, place the name before the region and use the short region code
Example:
^kos clan add yx eu
^kca yx eu
* To remove clans, use the command ^kos clan remove or ^kcr
* Removing clans follows the same format as adding them
Example:
^kos clan remove yx eu
^kcr yx eu

Thank you for being apart of YX!`
      )
      .setColor(0xFF0000);

    await interaction.reply({ embeds: [embed], ephemeral: false });
  }

  if (commandName === 'list') {
    await interaction.deferReply({ ephemeral: false });
    if (!data.listChannelId) {
      data.listChannelId = interaction.channelId;
      saveData();
    }
    const ch = interaction.guild.channels.cache.get(data.listChannelId);
    if (ch) await updateListMessages(ch);
    await interaction.editReply({ content: `KOS list posted in <#${interaction.channelId}>` });
  }

  if (commandName === 'submission') {
    await interaction.reply({ content: `Set this channel as the submission channel.`, ephemeral: false });
    data.submissionChannelId = interaction.channelId;
    saveData();
  }
});

client.on('messageCreate', handlePrefix);

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN);
