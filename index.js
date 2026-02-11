require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ChannelType, EmbedBuilder, REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
require('dotenv').config();


// === CONFIG ===
const OWNER_ID = "1283217337084018749";
const MOD_ROLE_ID = "1412837397607092405";
const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// === CLIENT ===
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

// === DATA ===
const dataPath = path.join(__dirname, "data.json");
let data = {
  submissionChannelId: null,
  listChannelId: null,
  messages: { players: null, topPriority: null, clans: null },
  players: [],
  topPriority: [],
  clans: []
};
if (fs.existsSync(dataPath)) {
  try { data = JSON.parse(fs.readFileSync(dataPath, "utf8")); } 
  catch { console.error("Failed to load data.json, using empty data"); }
}
function saveData() { fs.writeFileSync(dataPath, JSON.stringify(data, null, 2)); }
function isOwner(id) { return id === OWNER_ID; }
function hasModRole(member) { return member.roles.cache.has(MOD_ROLE_ID); }

// === KOS MESSAGE GENERATORS ===
function generatePlayersMessage() {
  const sorted = [...data.players].sort((a,b)=>a.name.localeCompare(b.name));
  let msg = "**KOS : Players**\n\n";
  for (const p of sorted) msg += p.username ? `${p.name} : ${p.username}\n` : `${p.name}\n`;
  return msg || "No players yet.";
}

function generateTopPriorityMessage() {
  return "**TOP PRIORITY**\n\n" + (data.topPriority.length ? data.topPriority.join("\n") : "None");
}

function generateClansMessage() {
  const sorted = [...data.clans].sort();
  return "**CLANS**\n\n" + (sorted.length ? sorted.join("\n") : "None");
}

// === KOS MESSAGE UPDATER ===
async function updateKosMessages() {
  if (!data.listChannelId) return;
  try {
    const channel = await client.channels.fetch(data.listChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    // Players
    if (data.messages.players) {
      try {
        const msg = await channel.messages.fetch(data.messages.players);
        await msg.edit(generatePlayersMessage());
      } catch { data.messages.players = null; }
    }
    if (!data.messages.players) {
      const msg = await channel.send(generatePlayersMessage());
      data.messages.players = msg.id;
    }

    // Top Priority
    if (data.messages.topPriority) {
      try {
        const msg = await channel.messages.fetch(data.messages.topPriority);
        await msg.edit(generateTopPriorityMessage());
      } catch { data.messages.topPriority = null; }
    }
    if (!data.messages.topPriority) {
      const msg = await channel.send(generateTopPriorityMessage());
      data.messages.topPriority = msg.id;
    }

    // Clans
    if (data.messages.clans) {
      try {
        const msg = await channel.messages.fetch(data.messages.clans);
        await msg.edit(generateClansMessage());
      } catch { data.messages.clans = null; }
    }
    if (!data.messages.clans) {
      const msg = await channel.send(generateClansMessage());
      data.messages.clans = msg.id;
    }

    saveData();
  } catch(err) { console.error("Failed to update KOS messages:", err); }
}

// === SLASH COMMANDS ===
async function registerCommands() {
  const commands = [
    {
      name: "panel",
      description: "Shows the KOS panel"
    },
    {
      name: "submission",
      description: "Sets the submission channel",
      options: [
        { type: 7, name: "channel", description: "Text channel for submissions", required: true }
      ]
    },
    {
      name: "list",
      description: "Sets the list channel",
      options: [
        { type: 7, name: "channel", description: "Text channel for KOS list", required: true }
      ]
    }
  ];
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("Slash commands registered!");
  } catch (err) { console.error(err); }
}

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!isOwner(interaction.user.id)) return interaction.reply({ content: "You cannot use this command.", ephemeral: true });

  try {
    if (interaction.commandName === "panel") {
      const embed = new EmbedBuilder()
        .setTitle("KOS Submission System")
        .setDescription("This bot organizes submissions for YX players and clans onto the KOS list.")
        .addFields(
          { name: "Players", value: `* To add players: ^kos add or ^ka\n* To remove players: ^kos remove or ^kr` },
          { name: "Clans", value: `* To add clans: ^kos clan add or ^kca\n* To remove clans: ^kos clan remove or ^kcr` },
          { name: "Notes", value: "Thank you for being apart of YX!" }
        )
        .setColor(0xff0000);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.commandName === "submission") {
      const channel = interaction.options.getChannel("channel");
      if (!channel || channel.type !== ChannelType.GuildText) return interaction.reply({ content: "Invalid channel.", ephemeral: true });
      data.submissionChannelId = channel.id;
      saveData();
      return interaction.reply({ content: `✅ Submission channel set to ${channel.name}`, ephemeral: true });
    }

    if (interaction.commandName === "list") {
      const channel = interaction.options.getChannel("channel");
      if (!channel || channel.type !== ChannelType.GuildText) return interaction.reply({ content: "Invalid channel.", ephemeral: true });
      data.listChannelId = channel.id;
      saveData();
      await interaction.reply({ content: `✅ List channel set to ${channel.name} and KOS list posted!`, ephemeral: true });
      await updateKosMessages();
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) interaction.reply({ content: "❌ An error occurred.", ephemeral: true });
  }
});

// === PREFIX COMMANDS ===
client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;
  if (!isOwner(message.author.id)) return;
  if (!data.submissionChannelId || message.channel.id !== data.submissionChannelId) return;

  const content = message.content.trim();
  const args = content.split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // PLAYER ADD
  if (cmd === "^kos" && args[0] === "add" || cmd === "^ka") {
    const name = args.shift();
    const username = args.shift() || "";
    if (!name) return message.reply("❌ Please provide a name.");
    if (data.players.find(p=>p.name === name)) return message.reply("❌ Player already exists.");
    data.players.push({ name, username, addedBy: message.author.id });
    saveData();
    await updateKosMessages();
    return message.reply(`✅ Added player ${name}${username ? " : "+username : ""}`);
  }

  // PLAYER REMOVE
  if (cmd === "^kos" && args[0] === "remove" || cmd === "^kr") {
    const name = args.shift();
    const username = args.shift() || "";
    const player = data.players.find(p=>p.name === name && (!username || p.username === username));
    if (!player) return message.reply("❌ Player not found.");
    if (player.addedBy !== message.author.id && !hasModRole(message.member)) return message.reply("❌ You cannot remove this player.");
    data.players = data.players.filter(p=>p!==player);
    saveData();
    await updateKosMessages();
    return message.reply(`✅ Removed player ${name}${username ? " : "+username : ""}`);
  }

  // CLAN ADD
  if (cmd === "^kos" && args[0] === "clan" && args[1] === "add" || cmd === "^kca") {
    const name = args.shift();
    const region = args.shift();
    if (!name || !region) return message.reply("❌ Provide name and region.");
    if (data.clans.includes(`${region.toUpperCase()}»${name}`)) return message.reply("❌ Clan already exists.");
    data.clans.push(`${region.toUpperCase()}»${name}`);
    saveData();
    await updateKosMessages();
    return message.reply(`✅ Added clan ${region.toUpperCase()}»${name}`);
  }

  // CLAN REMOVE
  if (cmd === "^kos" && args[0] === "clan" && args[1] === "remove" || cmd === "^kcr") {
    const name = args.shift();
    const region = args.shift();
    const clanStr = `${region.toUpperCase()}»${name}`;
    if (!data.clans.includes(clanStr)) return message.reply("❌ Clan not found.");
    data.clans = data.clans.filter(c => c !== clanStr);
    saveData();
    await updateKosMessages();
    return message.reply(`✅ Removed clan ${clanStr}`);
  }
});

// === READY ===
client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
  updateKosMessages();
});

// === START ===
(async () => {
  await registerCommands();
client.login(process.env.TOKEN);
})();


