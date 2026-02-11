require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  PermissionsBitField
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const config = {
  submissionChannel: null,
  listChannel: null
};

/* -------------------- COMMAND REGISTRATION -------------------- */

const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post the KOS submission panel'),

  new SlashCommandBuilder()
    .setName('submission')
    .setDescription('Set the submission channel')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Submission channel')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('list')
    .setDescription('Set the KOS list channel')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('List channel')
        .setRequired(true)
    )
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );
  console.log('Slash commands registered!');
}

/* -------------------- INTERACTIONS -------------------- */

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === 'submission') {
      const channel = interaction.options.getChannel('channel');
      config.submissionChannel = channel.id;

      await interaction.reply({
        content: `✅ Submission channel set to <#${channel.id}>`,
        ephemeral: true
      });
    }

    if (interaction.commandName === 'list') {
      const channel = interaction.options.getChannel('channel');
      config.listChannel = channel.id;

      await interaction.reply({
        content: `✅ List channel set to <#${channel.id}>`,
        ephemeral: true
      });
    }

    if (interaction.commandName === 'panel') {
      if (!config.submissionChannel || !config.listChannel) {
        return interaction.reply({
          content: '❌ Submission or list channel not set.',
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('KOS Submission System')
        .setColor(0xff0000)
        .setDescription(
`This bot organizes submissions for YX players and clans onto the KOS list.

**Players**
• To add players, use the command ^kos add or ^ka  
• When adding players, place the name before the username  

**Example:**  
^kos add poison poisonrebuild  
^ka poison poisonrebuild  

• To remove players, use the command ^kos remove or ^kr  
• Removing players follows the same format as adding them  

**Example:**  
^kos remove poison poisonrebuild  
^kr poison poisonrebuild  

**Clans**
• To add clans, use the command ^kos clan add or ^kca  
• When adding clans, place the name before the region and use the short region code  

**Example:**  
^kos clan add yx eu  
^kca yx eu  

• To remove clans, use the command ^kos clan remove or ^kcr  
• Removing clans follows the same format as adding them  

**Example:**  
^kos clan remove yx eu  
^kcr yx eu  

Thank you for being apart of YX!`
        );

      const channel = await client.channels.fetch(config.submissionChannel);
      await channel.send({ embeds: [embed] });

      await interaction.reply({
        content: '✅ Panel posted.',
        ephemeral: true
      });
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      await interaction.reply({
        content: '❌ An error occurred.',
        ephemeral: true
      });
    }
  }
});

/* -------------------- STARTUP -------------------- */

(async () => {
  await registerCommands();
  await client.login(process.env.BOT_TOKEN);
})();
