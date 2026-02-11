require("dotenv").config();
const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require("discord.js");
const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "data.json");
let data = { submissionChannel: null, listChannel: null, players: [], clans: [] };
if (fs.existsSync(DATA_PATH)) {
  data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

function saveData() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

// ====== Ready & Slash Commands Registration ======
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return console.log("No guild found.");

  await guild.commands.set([
    {
      name: "channelsubmission",
      description: "Set the submission channel",
      options: [
        {
          name: "channel",
          type: 7,
          description: "Select the text channel for submissions",
          required: true
        }
      ]
    },
    {
      name: "channellist",
      description: "Set the list channel",
      options: [
        {
          name: "channel",
          type: 7,
          description: "Select the text channel for the KOS list",
          required: true
        }
      ]
    },
    {
      name: "panel",
      description: "Shows the KOS Submission System panel"
    }
  ]);
  console.log("Slash commands registered.");
});

// ====== Interaction Handler ======
client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    // --- Panel Command ---
    if (commandName === "panel") {
      const embed = {
        color: 1752220,
        title: "KOS Submission System",
        description: "This bot organizes submissions for YX players and clans onto the KOS list.",
        fields: [
          {
            name: "Players",
            value: `* To add players, use ^kos add or ^ka
* To remove players, use ^kos remove or ^kr
Example:
^kos add poison poisonrebuild
^ka poison poisonrebuild
^kos remove poison poisonrebuild
^kr poison poisonrebuild`
          },
          {
            name: "Clans",
            value: `* To add clans, use ^kos clan add or ^kca
* To remove clans, use ^kos clan remove or ^kcr
Example:
^kos clan add yx eu
^kca yx eu
^kos clan remove yx eu
^kcr yx eu`
          }
        ],
        footer: { text: "Thank you for being part of YX!" }
      };
      await interaction.reply({ embeds: [embed], ephemeral: false });
    }

    // --- Submission Channel ---
    if (commandName === "channelsubmission") {
      const channel = interaction.options.getChannel("channel");
      data.submissionChannel = channel.id;
      saveData();
      await interaction.reply({ content: `✅ Submission channel set to ${channel.name}`, ephemeral: true });
    }

    // --- List Channel ---
    if (commandName === "channellist") {
      const channel = interaction.options.getChannel("channel");
      data.listChannel = channel.id;
      saveData();
      await interaction.reply({ content: `✅ List channel set to ${channel.name}`, ephemeral: true });
    }
  }
});

// ====== Prefix Command Handler ======
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const prefix = "^";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  // Helper: Add player/clan
  function addEntry(list, name, extra, userId, type) {
    const exists = list.find((e) => e.name.toLowerCase() === name.toLowerCase() && e.extra.toLowerCase() === extra.toLowerCase());
    if (exists) return false;
    list.push({ name, extra, addedBy: userId });
    saveData();
    return true;
  }

  // Helper: Remove player/clan
  function removeEntry(list, name, extra) {
    const index = list.findIndex((e) => e.name.toLowerCase() === name.toLowerCase() && e.extra.toLowerCase() === extra.toLowerCase());
    if (index === -1) return false;
    list.splice(index, 1);
    saveData();
    return true;
  }

  // --- Player Add ---
  if ((cmd === "kos" && args[0] === "add") || cmd === "ka") {
    let name, username;
    if (cmd === "ka") {
      [name, username] = args;
    } else {
      [, name, username] = args;
    }
    if (!name || !username) return message.reply("Usage: ^kos add <name> <username> OR ^ka <name> <username>");

    if (!addEntry(data.players, name, username, message.author.id, "player")) {
      return message.reply("This player is on KOS.");
    }

    message.channel.send(`${name} has been added to KOS.`).then(msg => msg.delete({ timeout: 5000 }));
  }

  // --- Player Remove ---
  if ((cmd === "kos" && args[0] === "remove") || cmd === "kr") {
    let name, username;
    if (cmd === "kr") {
      [name, username] = args;
    } else {
      [, name, username] = args;
    }
    if (!name || !username) return message.reply("Usage: ^kos remove <name> <username> OR ^kr <name> <username>");

    if (!removeEntry(data.players, name, username)) {
      return message.reply("This player is not on the KOS list.");
    }

    message.channel.send(`${name} has been removed from KOS.`).then(msg => msg.delete({ timeout: 5000 }));
  }

  // --- Clan Add ---
  if ((cmd === "kos" && args[0] === "clan" && args[1] === "add") || cmd === "kca") {
    let name, region;
    if (cmd === "kca") {
      [name, region] = args;
    } else {
      [, , name, region] = args;
    }
    if (!name || !region) return message.reply("Usage: ^kos clan add <name> <region> OR ^kca <name> <region>");

    if (!addEntry(data.clans, name, region, message.author.id, "clan")) {
      return message.reply("This clan is on KOS.");
    }

    message.channel.send(`${name} has been added to KOS.`).then(msg => msg.delete({ timeout: 5000 }));
  }

  // --- Clan Remove ---
  if ((cmd === "kos" && args[0] === "clan" && args[1] === "remove") || cmd === "kcr") {
    let name, region;
    if (cmd === "kcr") {
      [name, region] = args;
    } else {
      [, , name, region] = args;
    }
    if (!name || !region) return message.reply("Usage: ^kos clan remove <name> <region> OR ^kcr <name> <region>");

    if (!removeEntry(data.clans, name, region)) {
      return message.reply("This clan is not on the KOS list.");
    }

    message.channel.send(`${name} has been removed from KOS.`).then(msg => msg.delete({ timeout: 5000 }));
  }
});

// ====== Login ======
client.login(process.env.BOT_TOKEN);
