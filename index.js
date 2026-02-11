const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

// ---------- CONFIG ----------
const BOT_TOKEN = process.env.BOT_TOKEN; // replace
const CLIENT_ID = '1470922510496436378'; // replace with your bot's application ID
const GUILD_ID = '1470930306596081699';   // replace if registering guild commands
const BOT_PREFIXES = ['^kos add', '^ka'];

// ---------- LOAD DATA ----------
const dataFile = './data.json';
let data = { players: [], submissionChannel: null, listChannel: null };

if (fs.existsSync(dataFile)) {
  data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
} else {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// ---------- CLIENT ----------
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// ---------- HELPERS ----------
function saveData() {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function isDuplicatePlayer(name, username) {
  return data.players.some(p => p.name.toLowerCase() === name.toLowerCase() || p.username.toLowerCase() === username.toLowerCase());
}

async function updateListChannel() {
  if (!data.listChannel) return;
  const channel = await client.channels.fetch(data.listChannel).catch(() => null);
  if (!channel) return;

  const listText = data.players.length === 0 
    ? 'No players on KOS yet.' 
    : data.players.map(p => `• **${p.name}** (${p.username})`).join('\n');

  // Delete previous messages in list channel
  const messages = await channel.messages.fetch({ limit: 10 });
  messages.forEach(msg => msg.delete().catch(() => {}));

  channel.send(`**Current KOS Players:**\n${listText}`).catch(() => {});
}

// ---------- MESSAGE HANDLER ----------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== data.submissionChannel) return;

  const content = message.content.trim();
  const prefixUsed = BOT_PREFIXES.find(p => content.toLowerCase().startsWith(p));
  if (!prefixUsed) return;

  const args = content.slice(prefixUsed.length).trim().split(/\s+/);
  if (args[0]?.toLowerCase() !== 'player' || args.length < 3) {
    const reply = await message.reply('❌ Usage: ^kos add player <name> <username>');
    setTimeout(() => { message.delete().catch(() => {}); reply.delete().catch(() => {}); }, 5000);
    return;
  }

  const [, name, username] = args;

  if (isDuplicatePlayer(name, username)) {
    const reply = await message.reply('❌ This player is already on KOS.');
    setTimeout(() => { message.delete().catch(() => {}); reply.delete().catch(() => {}); }, 5000);
    return;
  }

  // Add player
  data.players.push({ name, username });
  saveData();

  const reply = await message.reply(`✅ Player **${name}** (${username}) added to KOS.`);
  setTimeout(() => { message.delete().catch(() => {}); reply.delete().catch(() => {}); }, 5000);

  // Update list channel
  await updateListChannel();
});

// ---------- SLASH COMMANDS ----------
client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('channelsubmission')
      .setDescription('Set the channel for KOS submissions')
      .addChannelOption(option =>
        option.setName('channel')
              .setDescription('Choose the submission channel')
              .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('channellist')
      .setDescription('Set the channel where the KOS list is posted')
      .addChannelOption(option =>
        option.setName('channel')
              .setDescription('Choose the list channel')
              .setRequired(true)
      )
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  if (commandName === 'channelsubmission') {
    const channel = options.getChannel('channel');
    data.submissionChannel = channel.id;
    saveData();
    await interaction.reply({ content: `✅ Submission channel set to ${channel}`, ephemeral: true });
  }

  if (commandName === 'channellist') {
    const channel = options.getChannel('channel');
    data.listChannel = channel.id;
    saveData();
    await updateListChannel();
    await interaction.reply({ content: `✅ List channel set to ${channel}`, ephemeral: true });
  }
});

// ---------- LOGIN ----------
client.login(BOT_TOKEN);

