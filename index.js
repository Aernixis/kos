const fs = require("fs");
const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder } = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const OWNER_ID = "1283217337084018749";
const ADMIN_ROLE = "1412837397607092405";

let data = {
  submissionChannelId: null,
  listChannelId: null,
  listMessages: { regular: null, priority: null, clans: null },
  players: [],
  priority: [],
  clans: [],
};

// Load data.json if exists
if (fs.existsSync("./data.json")) {
  data = JSON.parse(fs.readFileSync("./data.json", "utf8"));
}

function saveData() {
  fs.writeFileSync("./data.json", JSON.stringify(data, null, 2));
}

function sortAndFormatPlayers(list) {
  if (!list.length) return "```\nNo players.\n```";
  const formatted = list
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((p) => (p.username ? `${p.name} : ${p.username}` : p.name))
    .join("\n");
  return "```\n" + formatted + "\n```";
}

function sortAndFormatClans(list) {
  if (!list.length) return "```\nNo clans.\n```";
  const formatted = list.sort().join("\n");
  return "```\n" + formatted + "\n```";
}

async function updateListMessages(channel) {
  if (!channel) return;
  // Regular players
  if (data.listMessages.regular) {
    const msg = await channel.messages.fetch(data.listMessages.regular).catch(() => null);
    if (msg) await msg.edit({ content: sortAndFormatPlayers(data.players) });
  } else {
    const msg = await channel.send({ content: sortAndFormatPlayers(data.players) });
    data.listMessages.regular = msg.id;
  }

  // Priority players
  if (data.listMessages.priority) {
    const msg = await channel.messages.fetch(data.listMessages.priority).catch(() => null);
    if (msg) await msg.edit({ content: sortAndFormatPlayers(data.priority) });
  } else {
    const msg = await channel.send({ content: sortAndFormatPlayers(data.priority) });
    data.listMessages.priority = msg.id;
  }

  // Clans
  if (data.listMessages.clans) {
    const msg = await channel.messages.fetch(data.listMessages.clans).catch(() => null);
    if (msg) await msg.edit({ content: sortAndFormatClans(data.clans) });
  } else {
    const msg = await channel.send({ content: sortAndFormatClans(data.clans) });
    data.listMessages.clans = msg.id;
  }

  saveData();
}

// OWNER ONLY middleware
function isOwner(userId) {
  return userId === OWNER_ID;
}

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Handle prefix commands
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!isOwner(message.author.id)) return;

  const submissionChannel = data.submissionChannelId;
  if (submissionChannel && message.channel.id !== submissionChannel) return;

  const args = message.content.trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  // PLAYER ADD
  if (command === "^kos" && args[0] === "add" && args.length >= 3) {
    const name = args[1];
    const username = args[2];
    data.players.push({ name, username, submitter: message.author.id });
    await message.channel.send({ content: "Player added!", fetchReply: true }).then(msg => setTimeout(() => msg.delete(), 3000));
    updateListMessages(client.channels.cache.get(data.listChannelId));
    saveData();
    return;
  }

  if (command === "^ka" && args.length >= 2) {
    const name = args[0];
    const username = args[1];
    data.players.push({ name, username, submitter: message.author.id });
    await message.channel.send({ content: "Player added!", fetchReply: true }).then(msg => setTimeout(() => msg.delete(), 3000));
    updateListMessages(client.channels.cache.get(data.listChannelId));
    saveData();
    return;
  }

  // PLAYER REMOVE
  if (command === "^kos" && args[0] === "remove" && args.length >= 3) {
    const name = args[1];
    const username = args[2];
    const index = data.players.findIndex(p => p.name === name && p.username === username);
    if (index !== -1 && (data.players[index].submitter === message.author.id || message.member.roles.cache.has(ADMIN_ROLE))) {
      data.players.splice(index, 1);
      await message.channel.send({ content: "Player removed!", fetchReply: true }).then(msg => setTimeout(() => msg.delete(), 3000));
      updateListMessages(client.channels.cache.get(data.listChannelId));
      saveData();
    }
    return;
  }

  if (command === "^kr" && args.length >= 2) {
    const name = args[0];
    const username = args[1];
    const index = data.players.findIndex(p => p.name === name && p.username === username);
    if (index !== -1 && (data.players[index].submitter === message.author.id || message.member.roles.cache.has(ADMIN_ROLE))) {
      data.players.splice(index, 1);
      await message.channel.send({ content: "Player removed!", fetchReply: true }).then(msg => setTimeout(() => msg.delete(), 3000));
      updateListMessages(client.channels.cache.get(data.listChannelId));
      saveData();
    }
    return;
  }

  // CLAN ADD
  if ((command === "^kos" && args[0] === "clan" && args[1] === "add" && args.length >= 4) || (command === "^kca" && args.length >= 2)) {
    const name = args[args.length - 2];
    const region = args[args.length - 1];
    data.clans.push(`${name} » ${region}`);
    await message.channel.send({ content: "Clan added!", fetchReply: true }).then(msg => setTimeout(() => msg.delete(), 3000));
    updateListMessages(client.channels.cache.get(data.listChannelId));
    saveData();
    return;
  }

  // CLAN REMOVE
  if ((command === "^kos" && args[0] === "clan" && args[1] === "remove" && args.length >= 4) || (command === "^kcr" && args.length >= 2)) {
    const name = args[args.length - 2];
    const region = args[args.length - 1];
    const index = data.clans.findIndex(c => c === `${name} » ${region}`);
    if (index !== -1 && (message.member.roles.cache.has(ADMIN_ROLE))) {
      data.clans.splice(index, 1);
      await message.channel.send({ content: "Clan removed!", fetchReply: true }).then(msg => setTimeout(() => msg.delete(), 3000));
      updateListMessages(client.channels.cache.get(data.listChannelId));
      saveData();
    }
    return;
  }
});

// Slash commands
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!isOwner(interaction.user.id)) return interaction.reply({ content: "Unauthorized.", ephemeral: true });

  if (interaction.commandName === "panel") {
    await interaction.reply({
      content: `**KOS Submission System**\nThis bot organizes LBG players and clans onto the KOS list for YX members.\n
Players
* To add players, use the command ^kos add or ^ka
* When adding players, place the name before the username
Example:
^kos add poison poisonrebuild
^ka poison poisonrebuild
* To remove players, use the command ^kos remove or ^kr
* Removing players follows the same format as adding them
Example:
^kos remove poison poisonrebuild
^kr poison poisonrebuild
Clans
* To add clans, use the command ^kos clan add or ^kca
* When adding clans, place the name before the region and use the short region code
Example:
^kos clan add yx eu
^kca yx eu
* To remove clans, use the command ^kos clan remove or ^kcr
* Removing clans follows the same format as adding them
Example:
^kos clan remove yx eu
^kcr yx eu
Thank you for being apart of YX!`,
    });
  }

  if (interaction.commandName === "submission") {
    data.submissionChannelId = interaction.channelId;
    saveData();
    await interaction.reply({ content: `Submission channel set to <#${interaction.channelId}>`, ephemeral: false });
  }

  if (interaction.commandName === "list") {
    data.listChannelId = interaction.channelId;
    saveData();
    await updateListMessages(interaction.channel);
    await interaction.reply({ content: `KOS list posted in <#${interaction.channelId}>`, ephemeral: false });
  }
});

client.login(process.env.TOKEN);
