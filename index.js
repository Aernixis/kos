require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  EmbedBuilder, 
  PermissionFlagsBits,
  Events
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "data.json");
let data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

function saveData() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// --------------------- COMMAND HANDLERS ---------------------

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isStringSelectMenu()) return;

  // ---------- PANEL ----------
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "panel") {
      await interaction.deferReply({ ephemeral: false });

      const embed = new EmbedBuilder()
        .setTitle("📋 KOS Submission Panel")
        .setDescription("Organize submissions for YX players and clans on the KOS list efficiently.")
        .addFields(
          {
            name: "Players:",
            value: "* To add players, use the command `^kos add` or `^ka`\n* Put the **name before the username**\nEx: `^kos add poison poisonrebuild`\n    `^ka poison poisonrebuild`"
          },
          {
            name: "Clans:",
            value: "* To add clans, use the command `^kos clan add` or `^kca`\n* Put the **name before the region** and use the shortened region\nEx: `^kos clan add yx eu`\n    `^kca yx eu`"
          }
        )
        .setColor(0x00AE86);

      const menu = new StringSelectMenuBuilder()
        .setCustomId("panel_select")
        .setPlaceholder("Select Player or Clan")
        .addOptions(
          { label: "Player", description: "Submit a player to KOS", value: "player" },
          { label: "Clan", description: "Submit a clan to KOS", value: "clan" }
        );

      const row = new ActionRowBuilder().addComponents(menu);

      await interaction.editReply({ embeds: [embed], components: [row] });
    }
  }

  // ---------- DROPDOWN ----------
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "panel_select") {
      const choice = interaction.values[0];

      if (choice === "player") {
        await interaction.reply({ content: "Submit a player using `^kos add name username` or `^ka name username` in the submission channel.", ephemeral: true });
      } else if (choice === "clan") {
        await interaction.reply({ content: "Submit a clan using `^kos clan add name region` or `^kca name region` in the submission channel.", ephemeral: true });
      }
    }
  }
});

// --------------------- MESSAGE COMMAND HANDLER ---------------------

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const submissionChannelId = data.submissionChannel;

  const args = message.content.trim().split(/ +/g);

  // ---------- SET CHANNELS ----------
  if (args[0] === "^channelsubmission" && message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply("Please mention a channel to set as submission channel.");
    data.submissionChannel = channel.id;
    saveData();
    return message.reply(`✅ Submission channel set to ${channel.name}`);
  }

  if (args[0] === "^channellist" && message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply("Please mention a channel to set as list channel.");
    data.listChannel = channel.id;
    saveData();
    return message.reply(`✅ List channel set to ${channel.name}`);
  }

  // ---------- PLAYER ADD ----------
  if ((args[0] === "^kos" && args[1] === "add") || args[0] === "^ka") {
    if (!submissionChannelId || message.channel.id !== submissionChannelId) return;

    let name, username;
    if (args[0] === "^ka") {
      name = args[1];
      username = args[2];
    } else {
      name = args[2];
      username = args[3];
    }

    if (!name || !username) {
      return message.reply("Usage: `^kos add name username` or `^ka name username`");
    }

    // Check for duplicate
    const exists = data.players.find(p => p.name === name && p.username === username);
    if (exists) return message.reply("This player is already on KOS.");

    data.players.push({ name, username });
    saveData();

    message.delete().catch(() => {});
    const listChannel = client.channels.cache.get(data.listChannel);
    if (listChannel) {
      listChannel.send(`✅ Player added: **${name}** (${username})`);
    }
  }

  // ---------- CLAN ADD ----------
  if ((args[0] === "^kos" && args[1] === "clan" && args[2] === "add") || args[0] === "^kca") {
    if (!submissionChannelId || message.channel.id !== submissionChannelId) return;

    let name, region;
    if (args[0] === "^kca") {
      name = args[1];
      region = args[2];
    } else {
      name = args[3];
      region = args[4];
    }

    if (!name || !region) {
      return message.reply("Usage: `^kos clan add name region` or `^kca name region`");
    }

    // Check for duplicate
    const exists = data.clans.find(c => c.name === name && c.region === region);
    if (exists) return message.reply("This clan is already on KOS.");

    data.clans.push({ name, region });
    saveData();

    message.delete().catch(() => {});
    const listChannel = client.channels.cache.get(data.listChannel);
    if (listChannel) {
      listChannel.send(`✅ Clan added: **${name}** (${region})`);
    }
  }
});

// --------------------- LOGIN ---------------------

client.login(process.env.BOT_TOKEN);
