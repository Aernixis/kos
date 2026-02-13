require("dotenv").config();
const fs = require("fs");
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const DATA_FILE = "./data.json";
let data = {
  players: [],
  priority: [
    "Rtd_Zidox",
    "Wezah",
    "RASHKA",
    "Spitfire",
    "Rekt @primalflick2024",
    "smile",
    "icewraith"
  ],
  clans: [
    "EU»NOTA","EU»PARK","EU»RDR","EU»ROTA","EU»RR","EU»RTD","EU»STS","EU»TCK",
    "EU»TV","EU»XI","EU»ZD","NA»ATK","NA»CSR/CDR","NA»DTA","NA»SH","NA»STN","NA»TSA"
  ],
  listData: {
    channelId: null // submission channel lock
  }
};

/* =========================
   LOAD + MIGRATE DATA
========================= */
function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  }

  // Normalize players
  if (!Array.isArray(data.players)) data.players = [];
  data.players = data.players.map(p => ({
    name: String(p.name || p).trim(),
    username: p.username ? String(p.username).trim() : null
  }));

  // Normalize priority
  if (!Array.isArray(data.priority)) data.priority = [];

  // Normalize clans
  if (!Array.isArray(data.clans)) data.clans = [];
  data.clans = [...new Set(
    data.clans
      .map(c => (typeof c === "string" ? c.trim() : null))
      .filter(Boolean)
  )];
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* =========================
   BUILD LIST
========================= */
function buildList() {
  const out = [];

  out.push("–––––– PLAYERS ––––––");
  if (!data.players.length) out.push("None");
  else {
    data.players
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(p => {
        out.push(p.username ? `${p.name} : ${p.username}` : `${p.name} : N/A`);
      });
  }

  out.push("–––––– PRIORITY ––––––");
  if (!data.priority.length) out.push("None");
  else data.priority.sort().forEach(p => out.push(p));

  out.push("–––––– CLANS ––––––");
  if (!data.clans.length) out.push("None");
  else data.clans.sort().forEach(c => out.push(c));

  return "```" + out.join("\n") + "```";
}

/* =========================
   PREFIX COMMAND HANDLER
========================= */
client.on("messageCreate", async msg => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith("^")) return;

  const args = msg.content.slice(1).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();
  const kosCommands = ["ka","kr","p","pa","pr","kca","kcr"];
  let changed = false;

  // ✅ Submission channel check first
  if (data.listData.channelId && kosCommands.includes(cmd) && msg.channel.id !== data.listData.channelId) {
    try {
      const botMsg = await msg.channel.send(`Use KOS commands in <#${data.listData.channelId}>.`);
      setTimeout(() => { botMsg.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 3000);
    } catch {}
    return; // stop processing entirely if wrong channel
  }

  /* ---- PLAYER ADD ---- */
  if (cmd === "ka") {
    const name = args.shift();
    const username = args.shift() || null;
    if (!name || !username) return;
    if (!data.players.some(p => p.name === name && p.username === username)) {
      data.players.push({ name, username });
      changed = true;
    }
  }

  /* ---- PLAYER REMOVE ---- */
  if (cmd === "kr") {
    const name = args.shift();
    const username = args.shift() || null;
    if (!name) return;
    const before = data.players.length;
    data.players = data.players.filter(p => !(p.name === name && (username ? p.username === username : true)));
    if (before !== data.players.length) changed = true;
    data.priority = data.priority.filter(p => p !== name);
  }

  /* ---- PRIORITY ADD ---- */
  if (cmd === "p" || cmd === "pa") {
    const name = args.join(" ");
    if (!name) return;
    if (!data.priority.includes(name)) {
      data.priority.push(name);
      changed = true;
    }
  }

  /* ---- PRIORITY REMOVE ---- */
  if (cmd === "pr") {
    const name = args.join(" ");
    if (!name) return;
    const before = data.priority.length;
    data.priority = data.priority.filter(p => p !== name);
    if (before !== data.priority.length) changed = true;
  }

  /* ---- CLAN ADD ---- */
  if (cmd === "kca") {
    const clan = args.join(" ");
    if (!clan) return;
    if (!data.clans.includes(clan)) { data.clans.push(clan); changed = true; }
  }

  /* ---- CLAN REMOVE ---- */
  if (cmd === "kcr") {
    const clan = args.join(" ");
    if (!clan) return;
    const before = data.clans.length;
    data.clans = data.clans.filter(c => c !== clan);
    if (before !== data.clans.length) changed = true;
  }

  if (!changed) return; // nothing changed

  saveData();
  // ❌ Removed KOS list update message
});

/* =========================
   SLASH COMMANDS: PANEL, LIST, SUBMISSION
========================= */
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, channel } = interaction;

  if (commandName === "panel") {
    await interaction.reply({
      content: "This bot organizes LBG players and clans onto the KOS list for YX members.\n\nPlayers\nTo add players, use the command ^kos add or ^ka\nWhen adding players, place the name before the username\nExample:\n^kos add poison poisonrebuild\n^ka poison poisonrebuild\nTo remove players, use ^kos remove or ^kr\nRemoving players follows the same format as adding them\nExample:\n^kos remove poison poisonrebuild\n^kr poison poisonrebuild\n\nClans\nTo add clans, use the command ^kos clan add or ^kca\nWhen adding clans, place the name before the region and use the short region code\nExample:\n^kos clan add yx eu\n^kca yx eu\nTo remove clans, use the command ^kos clan remove or ^kcr\nRemoving clans follows the same format as adding them\nExample:\n^kos clan remove yx eu\n^kcr yx eu\n\nThank you for being a part of YX!",
      ephemeral: true
    });
  }

  if (commandName === "list") {
    await interaction.reply({ content: buildList(), ephemeral: true });
  }

  if (commandName === "submission") {
    data.listData.channelId = channel.id;
    saveData();
    await interaction.reply({ content: "Submission channel set! Prefix commands will only work here.", ephemeral: true });
  }
});

/* =========================
   STARTUP
========================= */
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  loadData();
});

client.login(process.env.TOKEN);
