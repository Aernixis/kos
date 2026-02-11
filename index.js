const { Client, GatewayIntentBits, Partials, ChannelType } = require("discord.js");
const fs = require("fs");
const path = require("path");

const OWNER_ID = "1283217337084018749"; // automatically remembered

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const PREFIX = "^";

const dataPath = path.join(__dirname, "data.json");

let data = {
  submissionChannelId: null,
  listChannelId: null,
  listMessageId: null,
  players: [],
  clans: [],
  topPriority: [],
};

// Load existing data.json safely
if (fs.existsSync(dataPath)) {
  try {
    data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch (err) {
    console.error("Failed to read data.json:", err);
    // fallback to empty data to prevent crash
    data = {
      submissionChannelId: null,
      listChannelId: null,
      listMessageId: null,
      players: [],
      clans: [],
      topPriority: [],
    };
  }
}

// Save function
function saveData() {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// Generate the KOS list message
function generateKosMessage() {
  let msg = "Kos :\n\nName : Username\n\n";
  data.players
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((player) => {
      msg += player.username ? `${player.name} : ${player.username}\n` : `${player.name}\n`;
    });

  msg += "\n------TOP PRIORITY------\n\n";
  data.topPriority?.forEach((p) => {
    msg += `${p}\n`;
  });

  msg += "\n–––––– CLANS ––––––\n\n";

  const euClans = data.clans
    .filter(c => c.region.toLowerCase() === "eu")
    .sort((a, b) => a.name.localeCompare(b.name));
  const naClans = data.clans
    .filter(c => c.region.toLowerCase() === "na")
    .sort((a, b) => a.name.localeCompare(b.name));

  euClans.forEach(c => msg += `EU»${c.name}\n`);
  naClans.forEach(c => msg += `NA»${c.name}\n`);

  msg += "\n-# ontop all of these i expect every clan member to be treated the same kos way\n";
  msg += "-# creds (shadd/aren)";

  return msg;
}

// Robust KOS list updater
async function updateListMessage() {
  if (!data.listChannelId) return; // no list channel set

  // fetch the channel
  let channel;
  try {
    channel = await client.channels.fetch(data.listChannelId);
  } catch {
    console.warn("List channel not found.");
    return;
  }

  if (!channel || channel.type !== ChannelType.GuildText) return;

  const msgContent = generateKosMessage();

  if (data.listMessageId) {
    // try to fetch the old message
    try {
      const oldMsg = await channel.messages.fetch(data.listMessageId);
      if (oldMsg) {
        await oldMsg.edit(msgContent);
        return;
      }
    } catch {
      console.warn("Previous KOS list message not found, sending a new one.");
      // message doesn't exist anymore, continue to send new
    }
  }

  // send new message if old one was missing or never existed
  try {
    const newMsg = await channel.send(msgContent);
    data.listMessageId = newMsg.id;
    saveData();
  } catch (err) {
    console.error("Failed to send KOS list:", err);
  }
}

// Helper: check owner
function isOwner(id) {
  return id === OWNER_ID;
}

// Slash command handling
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!isOwner(interaction.user.id)) {
    return interaction.reply({ content: "You cannot use this command.", ephemeral: true });
  }

  // Defer reply to prevent timeouts
  await interaction.deferReply({ ephemeral: true });

  if (interaction.commandName === "channellist") {
    const channel = interaction.options.getChannel("channel");
    if (!channel || channel.type !== ChannelType.GuildText)
      return interaction.editReply({ content: "Invalid channel." });

    data.listChannelId = channel.id;
    saveData();

    // Update or post KOS list robustly
    await updateListMessage();

    return interaction.editReply({
      content: `✅ List channel set to **${channel.name}** and KOS list posted/updated.`,
    });
  }

  if (interaction.commandName === "channelsubmission") {
    const channel = interaction.options.getChannel("channel");
    if (!channel || channel.type !== ChannelType.GuildText)
      return interaction.editReply({ content: "Invalid channel." });

    data.submissionChannelId = channel.id;
    saveData();

    return interaction.editReply({
      content: `✅ Submission channel set to **${channel.name}**.`,
    });
  }
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  updateListMessage(); // ensure the list is posted on startup
});

client.login(process.env.BOT_TOKEN);
