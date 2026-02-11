const { Client, GatewayIntentBits, Partials, Collection, ChannelType } = require("discord.js");
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
};

// Load existing data.json
if (fs.existsSync(dataPath)) {
  try {
    data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch (err) {
    console.error("Failed to read data.json:", err);
  }
}

// Save function
function saveData() {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// Generate the KOS list message
function generateKosMessage() {
  let msg = "Kos :\n\nName : Username\n\n";
  data.players.forEach((player) => {
    if (player.username) {
      msg += `${player.name} : ${player.username}\n`;
    } else {
      msg += `${player.name}\n`;
    }
  });

  msg += "\n------TOP PRIORITY------\n\n";
  data.topPriority?.forEach((p) => {
    msg += `${p}\n`;
  });

  msg += "\n–––––– CLANS ––––––\n\n";
  const euClans = data.clans.filter(c => c.region.toLowerCase() === "eu").sort((a,b) => a.name.localeCompare(b.name));
  const naClans = data.clans.filter(c => c.region.toLowerCase() === "na").sort((a,b) => a.name.localeCompare(b.name));

  euClans.forEach(c => msg += `EU»${c.name}\n`);
  naClans.forEach(c => msg += `NA»${c.name}\n`);

  msg += "\n-# ontop all of these i expect every clan member to be treated the same kos way\n";
  msg += "-# creds (shadd/aren)";
  return msg;
}

// Update the list message
async function updateListMessage() {
  if (!data.listChannelId) return;
  const channel = await client.channels.fetch(data.listChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const msgContent = generateKosMessage();
  if (data.listMessageId) {
    // edit existing
    const msg = await channel.messages.fetch(data.listMessageId).catch(() => null);
    if (msg) return msg.edit(msgContent);
  }
  // send new
  const newMsg = await channel.send(msgContent);
  data.listMessageId = newMsg.id;
  saveData();
}

// Helper: check owner
function isOwner(id) {
  return id === OWNER_ID;
}

// Helper: add player/clan with retries
async function tryAdd(targetType, name, secondary, userId) {
  for (let i = 0; i < 3; i++) {
    let success = false;
    if (targetType === "player") {
      if (data.players.find(p => p.name === name && p.username === secondary)) {
        return { success: false, message: "This player is already on KOS." };
      }
      data.players.push({ name, username: secondary });
      data.players.sort((a,b) => a.name.localeCompare(b.name));
      saveData();
      await updateListMessage();
      if (data.players.find(p => p.name === name)) {
        success = true;
      }
    } else if (targetType === "clan") {
      if (data.clans.find(c => c.name === name && c.region.toLowerCase() === secondary.toLowerCase())) {
        return { success: false, message: "This clan is already on KOS." };
      }
      data.clans.push({ name, region: secondary });
      saveData();
      await updateListMessage();
      if (data.clans.find(c => c.name === name && c.region.toLowerCase() === secondary.toLowerCase())) {
        success = true;
      }
    }
    if (success) return { success: true };
  }
  return { success: false, message: `<@${userId}> Unable to add ${targetType}, please try again later.` };
}

// Command handler
client.on("messageCreate", async message => {
  if (!message.content.startsWith(PREFIX)) return;
  if (!isOwner(message.author.id)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift()?.toLowerCase();

  // Players
  if (cmd === "kos" || cmd === "ka" || cmd === "kr") {
    const subcmd = args.shift()?.toLowerCase();
    if (!subcmd) return message.reply("You're missing a parameter.");
    
    // Add Player
    if (subcmd === "add" || cmd === "ka") {
      const name = args[0];
      const username = args[1];
      if (!name || !username) return message.reply("You're missing a parameter.");
      const res = await tryAdd("player", name, username, message.author.id);
      return message.reply(res.success ? `Added ${name}` : res.message);
    }

    // Remove Player
    if (subcmd === "remove" || cmd === "kr") {
      const name = args[0];
      const username = args[1];
      if (!name || !username) return message.reply("You're missing a parameter.");
      const index = data.players.findIndex(p => p.name === name && p.username === username);
      if (index === -1) return message.reply("This player is not on the KOS list.");
      data.players.splice(index, 1);
      saveData();
      await updateListMessage();
      return message.reply(`Removed ${name}`);
    }
  }

  // Clans
  if (cmd === "kca" || cmd === "kos" || cmd === "kcr") {
    const subcmd = args.shift()?.toLowerCase();
    if (!subcmd) return message.reply("You're missing a parameter.");
    
    // Add Clan
    if (subcmd === "clan" && args[0] === "add" || cmd === "kca") {
      const name = args[1] || args[0];
      const region = args[2] || args[1];
      if (!name || !region) return message.reply("You're missing a parameter.");
      const res = await tryAdd("clan", name, region, message.author.id);
      return message.reply(res.success ? `Added clan ${name}` : res.message);
    }

    // Remove Clan
    if (subcmd === "clan" && args[0] === "remove" || cmd === "kcr") {
      const name = args[1] || args[0];
      const region = args[2] || args[1];
      if (!name || !region) return message.reply("You're missing a parameter.");
      const index = data.clans.findIndex(c => c.name === name && c.region.toLowerCase() === region.toLowerCase());
      if (index === -1) return message.reply("This clan is not on the KOS list.");
      data.clans.splice(index, 1);
      saveData();
      await updateListMessage();
      return message.reply(`Removed clan ${name}`);
    }
  }
});

// Slash command /channellist
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!isOwner(interaction.user.id)) return interaction.reply({ content: "You cannot use this command.", flags: 64 });

  if (interaction.commandName === "channellist") {
    const channel = interaction.options.getChannel("channel");
    if (!channel || channel.type !== ChannelType.GuildText)
      return interaction.reply({ content: "Invalid channel.", flags: 64 });

    data.listChannelId = channel.id;
    saveData();
    await updateListMessage();
    return interaction.reply({ content: `List channel set to ${channel.name}`, flags: 64 });
  }

  if (interaction.commandName === "channelsubmission") {
    const channel = interaction.options.getChannel("channel");
    if (!channel || channel.type !== ChannelType.GuildText)
      return interaction.reply({ content: "Invalid channel.", flags: 64 });

    data.submissionChannelId = channel.id;
    saveData();
    return interaction.reply({ content: `Submission channel set to ${channel.name}`, flags: 64 });
  }
});

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
  updateListMessage();
});

client.login(process.env.TOKEN);
