require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  PermissionFlagsBits 
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "data.json");
let data = fs.existsSync(DATA_PATH) ? JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) : {
  submissionChannel: null,
  listChannel: null,
  players: [],
  clans: []
};

function saveData() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Helper: ensure command args
function validateArgs(message, argsNeeded, usageText) {
  if (message.content.trim().split(/\s+/).length - 1 < argsNeeded) {
    message.reply(`Usage: ${usageText}`);
    return false;
  }
  return true;
}

// Slash command registration
client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.first();
  if (!guild) return console.log("No guild found.");

  await guild.commands.set([
    new SlashCommandBuilder()
      .setName("panel")
      .setDescription("Show the submission panel"),

    new SlashCommandBuilder()
      .setName("channelsubmission")
      .setDescription("Set the submission channel")
      .addChannelOption(option =>
        option.setName("channel")
          .setDescription("Select a channel for submissions")
          .setRequired(true)),

    new SlashCommandBuilder()
      .setName("channellist")
      .setDescription("Set the list channel")
      .addChannelOption(option =>
        option.setName("channel")
          .setDescription("Select a channel for the KOS list")
          .setRequired(true)),

    new SlashCommandBuilder()
      .setName("submissions")
      .setDescription("Show the current submission channel"),

    new SlashCommandBuilder()
      .setName("list")
      .setDescription("Show the current list channel")
  ]);
});

// Slash commands
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === "panel") {
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("submissionType")
        .setPlaceholder("Select Player or Clan")
        .addOptions([
          { label: "Player", value: "player" },
          { label: "Clan", value: "clan" }
        ])
    );

    interaction.reply({
      embeds: [{
        color: 1752220,
        title: "KOS Submission System",
        description: "This bot organizes submissions for YX players and clans onto the KOS list.",
        fields: [
          {
            name: "Players:",
            value: "* To add players, use the command ^kos add or ^ka\n* When adding players, place the name before the username\nEx: ^kos add poison poisonrebuild\n    ^ka poison poisonrebuild"
          },
          {
            name: "Clans:",
            value: "* To add clans, use the command ^kos clan add or ^kca\n* Say the name before the region (region should be shortened)\nEx: ^kos clan add yx eu\n    ^kca yx eu"
          }
        ],
        footer: { text: "Thank you for being a part of YX!" }
      }],
      components: [row]
    });
  }

  if (commandName === "channelsubmission") {
    const channel = interaction.options.getChannel("channel");
    data.submissionChannel = channel.id;
    saveData();
    await interaction.reply({ content: `✅ Submission channel set to ${channel.name}`, ephemeral: true });
  }

  if (commandName === "channellist") {
    const channel = interaction.options.getChannel("channel");
    data.listChannel = channel.id;
    saveData();
    await interaction.reply({ content: `✅ List channel set to ${channel.name}`, ephemeral: true });
  }

  if (commandName === "submissions") {
    if (!data.submissionChannel) return interaction.reply({ content: "No submission channel set.", ephemeral: true });
    const channel = await interaction.guild.channels.fetch(data.submissionChannel);
    await interaction.reply({ content: `Current submission channel: ${channel.name}`, ephemeral: true });
  }

  if (commandName === "list") {
    if (!data.listChannel) return interaction.reply({ content: "No list channel set.", ephemeral: true });
    const channel = await interaction.guild.channels.fetch(data.listChannel);
    await interaction.reply({ content: `Current list channel: ${channel.name}`, ephemeral: true });
  }
});

// Prefix commands
client.on("messageCreate", async message => {
  if (message.author.bot) return;

  const content = message.content.trim();
  const args = content.split(/\s+/);
  
  // PLAYER ADD
  if (content.startsWith("^kos add") || content.startsWith("^ka")) {
    const isKos = content.startsWith("^kos add");
    const usage = isKos ? "^kos add <name> <username>" : "^ka <name> <username>";

    if (!validateArgs(message, isKos ? 2 : 2, usage)) return;

    const name = args[isKos ? 2 : 1];
    const username = args[isKos ? 3 : 2];

    if (data.players.find(p => p.name === name && p.username === username)) {
      message.reply("This person is on KOS.");
      return;
    }

    data.players.push({ name, username });
    saveData();

    await message.delete().catch(() => {});
    message.channel.send(`Added player: ${name} (${username})`);
  }

  // CLAN ADD
  if (content.startsWith("^kos clan add") || content.startsWith("^kca")) {
    const isKos = content.startsWith("^kos clan add");
    const usage = isKos ? "^kos clan add <name> <region>" : "^kca <name> <region>";

    if (!validateArgs(message, isKos ? 2 : 2, usage)) return;

    const name = args[isKos ? 3 : 1];
    const region = args[isKos ? 4 : 2];

    if (data.clans.find(c => c.name === name && c.region === region)) {
      message.reply("This clan is on KOS.");
      return;
    }

    data.clans.push({ name, region });
    saveData();

    await message.delete().catch(() => {});
    message.channel.send(`Added clan: ${name} (${region})`);
  }
});

client.login(process.env.BOT_TOKEN);
