import 'dotenv/config';
import fs from 'fs';
import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js';

const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;

const DATA_FILE = './data.json';
const MOD_ROLE_ID = '1412837397607092405';

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* ---------------- SLASH COMMAND REGISTRATION ---------------- */

const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post the KOS submission panel'),

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
    .setDescription('Post the KOS list')
    .addChannelOption(o =>
      o.setName('channel')
        .setDescription('List channel')
        .setRequired(true)
    )
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, GUILD_ID),
    { body: commands }
  );
}

/* ---------------- READY ---------------- */

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
  console.log('Slash commands registered!');
});

/* ---------------- INTERACTIONS ---------------- */

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const data = loadData();

    if (interaction.commandName === 'submission') {
      const channel = interaction.options.getChannel('channel');
      data.submissionChannelId = channel.id;
      saveData(data);
      await interaction.reply({ content: `✅ Submission channel set to ${channel}`, ephemeral: true });
    }

    if (interaction.commandName === 'list') {
      const channel = interaction.options.getChannel('channel');
      data.listChannelId = channel.id;
      saveData(data);

      await channel.send('📋 **Regular KOS Players**');
      await channel.send('⚠️ **Priority KOS**');
      await channel.send('🏷️ **KOS Clans**');

      await interaction.reply({ content: `✅ KOS list posted in ${channel}`, ephemeral: true });
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
• Name before region (short code)

**Example**
\`^kos clan add yx eu\`

• To remove clans, use \`^kos clan remove\` or \`^kcr\`

Thank you for being apart of YX!`
        )
        .setColor(0xff0000);

      await interaction.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
    }
  }
});

/* ---------------- LOGIN ---------------- */

client.login(TOKEN);
