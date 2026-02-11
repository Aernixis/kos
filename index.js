const { Client, GatewayIntentBits, Partials, ChannelType } = require("discord.js");
const fs = require("fs");
const path = require("path");

const OWNER_ID = "1283217337084018749";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const dataPath = path.join(__dirname, "data.json");

// --- DATA MANAGEMENT ---
let data = {
  submissionChannelId: null,
  listChannelId: null,
  listMessageId: null,
  players: [],
  clans: [],
  topPriority: [],
};

// Load safely
try {
  if (fs.existsSync(dataPath)) {
    data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  }
} catch (err) {
  console.error("Failed to read data.json, using empty data:", err);
}

// Save safely
function saveData() {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// --- KOS LIST GENERATION ---
function generateKosMessage() {
  const playersSorted = [...data.players].sort((a, b) => a.name.localeCompare(b.name));
  let msg = "Kos :\n\nName : Username\n\n";
  for (const p of playersSorted) msg += p.username ? `${p.name} : ${p.username}\n` : `${p.name}\n`;

  msg += "\n------TOP PRIORITY------\n\n";
  for (const p of data.topPriority) msg += `${p}\n`;

  msg += "\n–––––– CLANS ––––––\n\n";

  const euClans = data.clans.filter(c => c.region.toLowerCase() === "eu").sort((a,b)=>a.name.localeCompare(b.name));
  const naClans = data.clans.filter(c => c.region.toLowerCase() === "na").sort((a,b)=>a.name.localeCompare(b.name));

  for (const c of euClans) msg += `EU»${c.name}\n`;
  for (const c of naClans) msg += `NA»${c.name}\n`;

  msg += "\n-# ontop all of these i expect every clan member to be treated the same kos way\n";
  msg += "-# creds (shadd/aren)";
  return msg;
}

// --- ROBUST KOS LIST UPDATER ---
async function updateListMessage() {
  if (!data.listChannelId) return;
  let channel;
  try {
    channel = await client.channels.fetch(data.listChannelId);
  } catch {
    console.warn("List channel not found");
    return;
  }
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const msgContent = generateKosMessage();

  // edit existing if exists
  if (data.listMessageId) {
    try {
      const oldMsg = await channel.messages.fetch(data.listMessageId);
      if (oldMsg) return oldMsg.edit(msgContent);
    } catch {
      console.warn("Previous KOS list message not found, sending new one");
    }
  }

  // send new
  try {
    const newMsg = await channel.send(msgContent);
    data.listMessageId = newMsg.id;
    saveData();
  } catch (err) {
    console.error("Failed to send KOS list:", err);
  }
}

// --- HELPERS ---
function isOwner(id) {
  return id === OWNER_ID;
}

async function tryAdd(targetType, name, secondary) {
  if (targetType === "player") {
    if (data.players.find(p => p.name === name && p.username === secondary)) return { success: false, message: "Player already exists." };
    data.players.push({ name, username: secondary });
  } else if (targetType === "clan") {
    if (data.clans.find(c => c.name === name && c.region.toLowerCase() === secondary.toLowerCase())) return { success: false, message: "Clan already exists." };
    data.clans.push({ name, region: secondary });
  }
  saveData();
  await updateListMessage(); // ⚡ Await here — this is the reverted behavior
  return { success: true };
}

// --- SLASH COMMAND HANDLER ---
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!isOwner(interaction.user.id)) return interaction.reply({ content: "You cannot use this command.", flags: 64 });

  const { commandName } = interaction;

  try {
    if (commandName === "channellist") {
      const channel = interaction.options.getChannel("channel");
      if (!channel || channel.type !== ChannelType.GuildText)
        return interaction.reply({ content: "Invalid channel.", flags: 64 });

      data.listChannelId = channel.id;
      saveData();

      await updateListMessage(); // ⬅ await ensures message is posted/edited before reply
      return interaction.reply({ content: `✅ List channel set to **${channel.name}** and KOS list updated.`, flags: 64 });

    } else if (commandName === "channelsubmission") {
      const channel = interaction.options.getChannel("channel");
      if (!channel || channel.type !== ChannelType.GuildText)
        return interaction.reply({ content: "Invalid channel.", flags: 64 });

      data.submissionChannelId = channel.id;
      saveData();

      return interaction.reply({ content: `✅ Submission channel set to **${channel.name}**.`, flags: 64 });
    }
  } catch (err) {
    console.error("Slash command error:", err);
    return interaction.reply({ content: "❌ An error occurred.", flags: 64 });
  }
});

// --- BOT READY ---
client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
  updateListMessage().catch(console.error);
});

// --- LOGIN ---
client.login(process.env.BOT_TOKEN);
