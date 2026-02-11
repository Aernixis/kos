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

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Helper: ensure command args
function validateArgs(interaction, argsNeeded, usageText) {
  if (interaction.options._hoistedOptions.length < argsNeeded) {
    interaction.reply({ content: `Usage: ${usageText}`, ephemeral: true });
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

// Panel
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

  // Channels
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

// Bot login
client.login(process.env.BOT_TOKEN);
