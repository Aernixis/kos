require("dotenv").config();
const fs = require("fs");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const DATA_FILE = "./data.json";
const OWNER_ID = "1283217337084018749";

let data = {
  players: [],
  priority: [],
  clans: [],
  panelMessages: { gif: null, tutorial: null },
  listMessageIds: {},
  submissionChannelId: null
};

// ---------------- LOAD DATA ----------------
function load() {
  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  }

  // Normalize players
  data.players = (data.players || []).map(p => ({
    name: String(p.name).trim(),
    username: p.username ? String(p.username).trim() : null,
    addedBy: p.addedBy || null
  }));

  // Normalize priority
  data.priority = Array.isArray(data.priority) ? [...new Set(data.priority)] : [];

  // Normalize clans
  data.clans = [...new Set((data.clans || []).map(c => {
    if (typeof c === "string") return c.trim();
    if (c?.clan) return c.clan.trim();
    return null;
  }).filter(Boolean))];

  save();
}

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ---------------- LIST BUILDER ----------------
async function updateKosList(channel) {
  if (!channel) return;

  async function fetchOrSend(id, content) {
    if (id) {
      const msg = await channel.messages.fetch(id).catch(() => null);
      if (msg) return (await msg.edit({ content }))?.id;
    }
    const msg = await channel.send({ content });
    return msg.id;
  }

  // Players
  const playersText = "```–––––– PLAYERS ––––––\n" +
    (data.players.length
      ? data.players.sort((a, b) => a.name.localeCompare(b.name))
        .map(p => p.username ? `${p.name} : ${p.username}` : p.name)
        .join("\n")
      : "None") +
    "```";

  // Priority
  const priorityText = "```–––––– PRIORITY ––––––\n" +
    (data.priority.length
      ? data.priority.sort().join("\n")
      : "None") +
    "```";

  // Clans
  const clansText = "```–––––– CLANS ––––––\n" +
    (data.clans.length
      ? data.clans.sort().join("\n")
      : "None") +
    "```";

  data.listMessageIds.players = await fetchOrSend(data.listMessageIds.players, playersText);
  data.listMessageIds.priority = await fetchOrSend(data.listMessageIds.priority, priorityText);
  data.listMessageIds.clans = await fetchOrSend(data.listMessageIds.clans, clansText);

  save();
}

// ---------------- PANEL ----------------
let panelUpdating = false;
async function updatePanel(channel) {
  if (!channel || panelUpdating) return;
  panelUpdating = true;

  const gifEmbed = new EmbedBuilder()
    .setImage("https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExc2FoODRjMmVtNmhncjkyZzY0ZGVwa2l3dzV0M3UyYmZ4bjVsZ2pnOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/iuttaLUMRLWEgJKRHx/giphy.gif")
    .setColor(0xff0000);

  const tutorialEmbed = new EmbedBuilder()
    .setTitle("KOS Submission System")
    .setColor(0xff0000)
    .setDescription(`
This bot organizes LBG players and clans onto the KOS list for YX members.

Players
To add players, use the command ^kos add or ^ka
When adding players, place the name before the username
Example:
^kos add poison poisonrebuild
^ka poison poisonrebuild
To remove players, use the command ^kos remove or ^kr
Removing players follows the same format as adding them
Example:
^kos remove poison poisonrebuild
^kr poison poisonrebuild

Clans
To add clans, use the command ^kos clan add or ^kca
When adding clans, place the name before the region and use the short region code
Example:
^kos clan add yx eu
^kca yx eu
To remove clans, use the command ^kos clan remove or ^kcr
Removing clans follows the same format as adding them
Example:
^kos clan remove yx eu
^kcr yx eu

Thank you for being a part of YX!
    `);

  async function fetchOrSendEmbed(id, embed) {
    if (id) {
      const msg = await channel.messages.fetch(id).catch(() => null);
      if (msg) return (await msg.edit({ embeds: [embed] }))?.id;
    }
    const msg = await channel.send({ embeds: [embed] });
    return msg.id;
  }

  data.panelMessages.gif = await fetchOrSendEmbed(data.panelMessages.gif, gifEmbed);
  data.panelMessages.tutorial = await fetchOrSendEmbed(data.panelMessages.tutorial, tutorialEmbed);

  save();
  panelUpdating = false;
}

// ---------------- HELPER ----------------
function canUsePrefix(msg) {
  if (msg.author.id === OWNER_ID) return true;
  return msg.channel.id === data.submissionChannelId;
}

// ---------------- PREFIX COMMANDS ----------------
client.on("messageCreate", async msg => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith("^")) return;
  if (!canUsePrefix(msg)) {
    return msg.reply(`Use KOS commands in <#${data.submissionChannelId}>`).catch(() => {});
  }

  const args = msg.content.slice(1).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();
  let changed = false;

  if (cmd === "ka") {
    const name = args.shift();
    const username = args.shift() || null;
    if (name && !data.players.some(p => p.name === name && p.username === username)) {
      data.players.push({ name, username, addedBy: msg.author.id });
      changed = true;
    }
  }

  if (cmd === "kr") {
    const name = args.shift();
    const username = args.shift() || null;
    const before = data.players.length;
    data.players = data.players.filter(p => !(p.name === name && (username ? p.username === username : true)));
    if (before !== data.players.length) changed = true;
  }

  if (cmd === "p" || cmd === "pa") {
    const name = args.join(" ");
    if (name && !data.priority.includes(name)) {
      data.priority.push(name);
      changed = true;
    }
  }

  if (cmd === "pr") {
    const name = args.join(" ");
    const before = data.priority.length;
    data.priority = data.priority.filter(p => p !== name);
    if (before !== data.priority.length) changed = true;
  }

  if (cmd === "kca") {
    const clan = args.join(" ");
    if (clan && !data.clans.includes(clan)) {
      data.clans.push(clan);
      changed = true;
    }
  }

  if (cmd === "kcr") {
    const clan = args.join(" ");
    const before = data.clans.length;
    data.clans = data.clans.filter(c => c !== clan);
    if (before !== data.clans.length) changed = true;
  }

  if (!changed) return;

  save();
  await updateKosList(msg.channel);
  msg.reply("KOS list updated.").catch(() => {});
});

// ---------------- SLASH COMMANDS ----------------
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, channel } = interaction;

  try {
    if (commandName === "panel") {
      await interaction.deferReply({ ephemeral: true });
      await updatePanel(channel);
      await interaction.editReply("Panel updated.");
    }
    if (commandName === "list") {
      await interaction.deferReply({ ephemeral: true });
      await updateKosList(channel);
      await interaction.editReply("KOS list updated.");
    }
    if (commandName === "submission") {
      data.submissionChannelId = channel.id;
      save();
      await interaction.reply({ content: `Submission channel set to <#${channel.id}>`, ephemeral: true });
    }
  } catch (e) {
    console.error("Slash command error:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Error occurred.", ephemeral: true }).catch(() => {});
    }
  }
});

// ---------------- STARTUP ----------------
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  load();
});

client.login(process.env.TOKEN);
