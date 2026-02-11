const { Client, GatewayIntentBits, Partials, ChannelType, EmbedBuilder } = require("discord.js");
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

// --- DATA ---
let data = {
  submissionChannelId: null,
  listChannelId: null,
  listMessageId: null,
  players: [],
  clans: [],
  topPriority: [],
};

// Safe load
if (fs.existsSync(dataPath)) {
  try {
    data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch {
    console.error("Failed to load data.json, using empty data");
  }
}

// Save
function saveData() {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// --- GENERATE KOS LIST ---
function generateKosMessage() {
  const playersSorted = [...data.players].sort((a, b) => a.name.localeCompare(b.name));
  let msg = "Kos :\n\nName : Username\n\n";
  for (const p of playersSorted) msg += p.username ? `${p.name} : ${p.username}\n` : `${p.name}\n`;

  msg += "\n------TOP PRIORITY------\n\n";
  for (const p of data.topPriority) msg += `${p}\n`;

  msg += "\n–––––– CLANS ––––––\n\n";
  const euClans = data.clans.filter(c => c.region.toLowerCase() === "eu").sort((a, b) => a.name.localeCompare(b.name));
  const naClans = data.clans.filter(c => c.region.toLowerCase() === "na").sort((a, b) => a.name.localeCompare(b.name));
  for (const c of euClans) msg += `EU»${c.name}\n`;
  for (const c of naClans) msg += `NA»${c.name}\n`;

  msg += "\n-# ontop all of these i expect every clan member to be treated the same kos way\n";
  msg += "-# creds (shadd/aren)";
  return msg;
}

// --- UPDATE KOS LIST ---
async function updateListMessage() {
  if (!data.listChannelId) return;
  try {
    const channel = await client.channels.fetch(data.listChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const msgContent = generateKosMessage();

    if (data.listMessageId) {
      try {
        const oldMsg = await channel.messages.fetch(data.listMessageId);
        if (oldMsg) return await oldMsg.edit(msgContent);
      } catch {
        // old message not found, send new one
        const newMsg = await channel.send(msgContent);
        data.listMessageId = newMsg.id;
        saveData();
      }
    } else {
      const newMsg = await channel.send(msgContent);
      data.listMessageId = newMsg.id;
      saveData();
    }
  } catch (err) {
    console.error("Failed to update KOS list:", err);
  }
}

// --- HELPERS ---
function isOwner(id) {
  return id === OWNER_ID;
}

// --- SLASH COMMANDS ---
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (!isOwner(interaction.user.id)) 
    return interaction.reply({ content:"You cannot use this command.", ephemeral:true });

  const { commandName } = interaction;

  try {
    // --- /list ---
    if (commandName === "list") {
      const channel = interaction.options.getChannel("channel");
      if (!channel || channel.type !== ChannelType.GuildText)
        return interaction.reply({ content:"Invalid channel", ephemeral:true });

      data.listChannelId = channel.id;
      saveData();

      await interaction.reply({ content:`✅ List channel set to ${channel.name} and KOS list posted!`, ephemeral:true });

      // Immediately post the full KOS list
      await updateListMessage();

    // --- /submission ---
    } else if (commandName === "submission") {
      const channel = interaction.options.getChannel("channel");
      if (!channel || channel.type !== ChannelType.GuildText)
        return interaction.reply({ content:"Invalid channel", ephemeral:true });

      data.submissionChannelId = channel.id;
      saveData();

      interaction.reply({ content:`✅ Submission channel set to ${channel.name}`, ephemeral:true });

    // --- /panel ---
    } else if (commandName === "panel") {
      const embed = new EmbedBuilder()
        .setTitle("KOS Submission System")
        .setDescription("This bot organizes submissions for YX players and clans onto the KOS list, keeping everything tracked efficiently.")
        .addFields(
          { name: "Players", value: "• To add players, use `^kos add` or `^ka`\n• Place the name before the username\nExample:\n^kos add poison poisonrebuild\n^ka poison poisonrebuild" },
          { name: "Clans", value: "• To add clans, use `^kos clan add` or `^kca`\n• Place the name before the region using the short region code\nExample:\n^kos clan add yx eu\n^kca yx eu" },
          { name: "Notes", value: "Follow the instructions carefully to avoid duplicates." }
        )
        .setColor(0xff0000)
        .setFooter({ text: "KOS System by shadd/aren" });

      interaction.reply({ embeds:[embed], ephemeral:true });
    }
  } catch (err) {
    console.error(err);
    interaction.reply({ content:"❌ An error occurred", ephemeral:true });
  }
});

// --- READY ---
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  // Background update if list already exists
  updateListMessage();
});

// --- LOGIN ---
client.login(process.env.BOT_TOKEN);
