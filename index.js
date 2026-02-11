require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const BOT_OWNER = "1283217337084018749"; // Replace with your Discord ID

const DATA_PATH = path.join(__dirname, "data.json");
let data = fs.existsSync(DATA_PATH) ? JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) : {
  players: [],
  clans: [],
  submissionChannel: null,
  listChannel: null
};

function saveData() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

// Utility: check if user is owner
function isOwner(userId) {
  return userId === BOT_OWNER;
}

// Alphabetical sort
function sortPlayers() { data.players.sort((a, b) => a.name.localeCompare(b.name)); }
function sortClans() { data.clans.sort((a, b) => a.name.localeCompare(b.name)); }

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== Commands handling =====
client.on("messageCreate", async message => {
  if (message.author.bot) return;

  const prefix = "^";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // ---- Player add ----
  if (cmd === "kos" && args[0] === "add" || cmd === "ka") {
    let name, username;
    if (args[0] === "add") {
      name = args[1];
      username = args[2];
    } else {
      name = args[0];
      username = args[1];
    }
    if (!name || !username) return message.reply("Usage: ^kos add <name> <username> or ^ka <name> <username>");

    if (data.players.find(p => p.name === name && p.username === username)) {
      return message.reply("This player is already on KOS.");
    }

    let retries = 0;
    while (retries < 3) {
      data.players.push({ name, username, addedBy: message.author.id });
      sortPlayers();
      saveData();
      const added = data.players.find(p => p.name === name && p.username === username);
      if (added) {
        // Delete the command message after successful add
        message.delete().catch(() => {});
        break;
      } else {
        retries++;
      }
    }
    if (retries === 3) {
      message.reply(`Unable to add ${name}. Please try again later.`);
    }
  }

  // ---- Player remove ----
  if (cmd === "kos" && args[0] === "remove" || cmd === "kr") {
    let name, username;
    if (args[0] === "remove") {
      name = args[1];
      username = args[2];
    } else {
      name = args[0];
      username = args[1];
    }
    if (!name || !username) return message.reply("Usage: ^kos remove <name> <username> or ^kr <name> <username>");

    const index = data.players.findIndex(p => p.name === name && p.username === username);
    if (index === -1) return message.reply("This player is not on the KOS list.");

    data.players.splice(index, 1);
    sortPlayers();
    saveData();
    message.reply(`${name} removed from KOS.`);
  }

  // ---- Clan add ----
  if (cmd === "kos" && args[0] === "clan" && args[1] === "add" || cmd === "kca") {
    let name, region;
    if (args[0] === "clan" && args[1] === "add") {
      name = args[2];
      region = args[3];
    } else {
      name = args[0];
      region = args[1];
    }
    if (!name || !region) return message.reply("Usage: ^kos clan add <name> <region> or ^kca <name> <region>");

    if (data.clans.find(c => c.name === name && c.region === region)) {
      return message.reply("This clan is already on KOS.");
    }

    let retries = 0;
    while (retries < 3) {
      data.clans.push({ name, region, addedBy: message.author.id });
      sortClans();
      saveData();
      const added = data.clans.find(c => c.name === name && c.region === region);
      if (added) {
        message.delete().catch(() => {});
        break;
      } else {
        retries++;
      }
    }
    if (retries === 3) {
      message.reply(`Unable to add ${name}. Please try again later.`);
    }
  }

  // ---- Clan remove ----
  if (cmd === "kos" && args[0] === "clan" && args[1] === "remove" || cmd === "kcr") {
    let name, region;
    if (args[0] === "clan" && args[1] === "remove") {
      name = args[2];
      region = args[3];
    } else {
      name = args[0];
      region = args[1];
    }
    if (!name || !region) return message.reply("Usage: ^kos clan remove <name> <region> or ^kcr <name> <region>");

    const index = data.clans.findIndex(c => c.name === name && c.region === region);
    if (index === -1) return message.reply("This clan is not on the KOS list.");

    data.clans.splice(index, 1);
    sortClans();
    saveData();
    message.reply(`${name} removed from KOS.`);
  }
});

// ===== Slash Commands =====
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (!isOwner(interaction.user.id)) return interaction.reply({ content: "You cannot use this command.", ephemeral: true });

  if (commandName === "panel") {
    try {
      await interaction.deferReply();
      const embed = {
        color: 0x1AC6C6,
        title: "KOS Submission System",
        description: "This bot organizes submissions for YX players and clans onto the KOS list.",
        fields: [
          {
            name: "Players",
            value:
`* To add players, use the command ^kos add or ^ka
* When adding players, place the name before the username
Example:
^kos add poison poisonrebuild
^ka poison poisonrebuild
* To remove players, use the command ^kos remove or ^kr
* Removing players follows the same format as adding them
Example:
^kos remove poison poisonrebuild
^kr poison poisonrebuild`
          },
          {
            name: "Clans",
            value:
`* To add clans, use the command ^kos clan add or ^kca
* When adding clans, place the name before the region and use the short region code
Example:
^kos clan add yx eu
^kca yx eu
* To remove clans, use the command ^kos clan remove or ^kcr
* Removing clans follows the same format as adding them
Example:
^kos clan remove yx eu
^kcr yx eu`
          }
        ],
        footer: { text: "Thank you for being apart of YX!" }
      };

      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("submission_select")
            .setPlaceholder("📋 Submission Panel - choose Player or Clan")
            .addOptions([
              { label: "Player", value: "player" },
              { label: "Clan", value: "clan" }
            ])
        );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error(err);
    }
  }
});

// ===== Bot login =====
client.login(process.env.BOT_TOKEN);
