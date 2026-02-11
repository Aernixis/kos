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
  const playersSorted = [...data.players].sort((a,b)=>a.name.localeCompare(b.name));
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

// --- UPDATE KOS LIST (async) ---
function updateListMessage() {
  if (!data.listChannelId) return;
  client.channels.fetch(data.listChannelId).then(channel => {
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const msgContent = generateKosMessage();

    if (data.listMessageId) {
      channel.messages.fetch(data.listMessageId).then(oldMsg => {
        if (oldMsg) return oldMsg.edit(msgContent);
        channel.send(msgContent).then(newMsg => { data.listMessageId = newMsg.id; saveData(); }).catch(()=>{});
      }).catch(()=>{
        channel.send(msgContent).then(newMsg => { data.listMessageId = newMsg.id; saveData(); }).catch(()=>{});
      });
    } else {
      channel.send(msgContent).then(newMsg => { data.listMessageId = newMsg.id; saveData(); }).catch(()=>{});
    }
  }).catch(()=>{});
}

// --- HELPERS ---
function isOwner(id) {
  return id === OWNER_ID;
}

// --- SLASH COMMANDS ---
client.on("interactionCreate", interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!isOwner(interaction.user.id)) return interaction.reply({ content:"You cannot use this command.", flags:64 });

  const { commandName } = interaction;

  try {
    if (commandName==="list") {
      const channel = interaction.options.getChannel("channel");
      if (!channel || channel.type !== ChannelType.GuildText)
        return interaction.reply({ content:"Invalid channel", flags:64 });

      data.listChannelId = channel.id;
      saveData();

      interaction.reply({ content:`✅ List channel set to ${channel.name}`, flags:64 });
      updateListMessage(); // fire-and-forget

    } else if (commandName==="submission") {
      const channel = interaction.options.getChannel("channel");
      if (!channel || channel.type !== ChannelType.GuildText)
        return interaction.reply({ content:"Invalid channel", flags:64 });

      data.submissionChannelId = channel.id;
      saveData();

      interaction.reply({ content:`✅ Submission channel set to ${channel.name}`, flags:64 });

    } else if (commandName==="panel") {
      // reply with your instructions
      const panelMessage = `
**KOS Submission System**
This bot organizes submissions for YX players and clans onto the KOS list, keeping everything tracked efficiently.

**Players**
* To add players, use the command ^kos add or ^ka 
* When adding players, place the name before the username 
Example:
^kos add poison poisonrebuild
^ka poison poisonrebuild

**Clans**
* To add clans, use the command ^kos clan add or ^kca 
* When adding clans, place the name before the region and use the short region code 
Example:
^kos clan add yx eu
^kca yx eu

Follow the instructions carefully to avoid duplicates.
      `;
      interaction.reply({ content: panelMessage, flags:64 });
    }
  } catch {
    interaction.reply({ content:"❌ An error occurred", flags:64 });
  }
});

// --- READY ---
client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
  updateListMessage(); // background
});

// --- LOGIN ---
client.login(process.env.BOT_TOKEN);
