require('dotenv').config();
const fs = require('fs');
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ChannelType
} = require('discord.js');

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const MOD_ROLE_ID = '1412837397607092405';
const DATA_FILE = './data.json';

/* ---------------- DATA ---------------- */

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      submissionChannelId: null,
      listChannelId: null,
      listMessages: {
        players: null,
        clans: null
      },
      players: [],
      clans: []
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* ---------------- CLIENT ---------------- */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* ---------------- SLASH COMMANDS ---------------- */

const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Show the KOS submission panel'),

  new SlashCommandBuilder()
    .setName('submission')
    .setDescription('Set the submission channel')
    .addChannelOption(o =>
      o.setName('channel')
        .setDescription('Submission channel')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('list')
    .setDescription('Set the KOS list channel')
    .addChannelOption(o =>
      o.setName('channel')
        .setDescription('List channel')
        .setRequired(true)
    )
].map(c => c.toJSON());

/* ---------------- READY ---------------- */

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  // THIS OVERWRITES ALL OLD COMMANDS
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log('Slash commands registered (old ones removed)');
});

/* ---------------- LIST HELPERS ---------------- */

function formatPlayers(players) {
  return players
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => p.username ? `${p.name} : ${p.username}` : p.name)
    .join('\n') || '*No players listed*';
}

function formatClans(clans) {
  return clans
    .sort((a, b) => a.localeCompare(b))
    .join('\n') || '*No clans listed*';
}

async function updateLists(guild) {
  const data = loadData();
  if (!data.listChannelId) return;

  const channel = await guild.channels.fetch(data.listChannelId);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  // Players
  let playersMsg;
  if (data.listMessages.players) {
    playersMsg = await channel.messages.fetch(data.listMessages.players).catch(() => null);
  }
  if (!playersMsg) {
    playersMsg = await channel.send('📋 **KOS Players**');
    data.listMessages.players = playersMsg.id;
  }
  await playersMsg.edit(`📋 **KOS Players**\n\n${formatPlayers(data.players)}`);

  // Clans
  let clansMsg;
  if (data.listMessages.clans) {
    clansMsg = await channel.messages.fetch(data.listMessages.clans).catch(() => null);
  }
  if (!clansMsg) {
    clansMsg = await channel.send('🏷️ **KOS Clans**');
    data.listMessages.clans = clansMsg.id;
  }
  await clansMsg.edit(`🏷️ **KOS Clans**\n\n${formatClans(data.clans)}`);

  saveData(data);
}

/* ---------------- INTERACTIONS ---------------- */

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const data = loadData();

    if (interaction.commandName === 'submission') {
      const channel = interaction.options.getChannel('channel');
      data.submissionChannelId = channel.id;
      saveData(data);
      return interaction.reply({ content: `✅ Submission channel set to ${channel}`, ephemeral: true });
    }

    if (interaction.commandName === 'list') {
      const channel = interaction.options.getChannel('channel');
      data.listChannelId = channel.id;
      data.listMessages = { players: null, clans: null };
      saveData(data);

      await updateLists(interaction.guild);
      return interaction.reply({ content: `✅ KOS list posted in ${channel}`, ephemeral: true });
    }

    if (interaction.commandName === 'panel') {
      const embed = new EmbedBuilder()
        .setTitle('KOS Submission System')
        .setDescription(
`This bot organizes submissions for YX players and clans onto the KOS list.

**Players**
• To add players, use \`^kos add\` or \`^ka\`
• Place the name before the username

**Example**
\`^kos add poison poisonrebuild\`

• To remove players, use \`^kos remove\` or \`^kr\`

**Clans**
• To add clans, use \`^kos clan add\` or \`^kca\`
• Place the name before the region

**Example**
\`^kos clan add yx eu\`

• To remove clans, use \`^kos clan remove\` or \`^kcr\`

Thank you for being apart of YX!`
        )
        .setColor(0xff0000);

      return interaction.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
    }
  }
});

/* ---------------- LOGIN ---------------- */

client.login(TOKEN);
