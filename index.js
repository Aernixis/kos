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
  priority: [],
  clans: []
};

// ---------------- ASYNC SAVE QUEUE ----------------
let saving = false;
let saveQueued = false;

async function save() {
  if (saving) {
    saveQueued = true;
    return;
  }
  saving = true;
  try {
    await fs.promises.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Failed to save data:", e);
  }
  saving = false;
  if (saveQueued) {
    saveQueued = false;
    save();
  }
}

// ---------------- LOAD + MIGRATION ----------------
async function load() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      data = JSON.parse(await fs.promises.readFile(DATA_FILE, "utf8"));
    } catch {
      console.error("Failed to load data.json");
    }
  }

  // Migrate topPriority if exists
  if (Array.isArray(data.topPriority) && data.topPriority.length > 0) {
    data.priority = [...new Set(data.topPriority.map(p => String(p).trim()))];
    delete data.topPriority;
  }

  if (!Array.isArray(data.priority)) data.priority = [];
  if (!Array.isArray(data.players)) data.players = [];
  if (!Array.isArray(data.clans)) data.clans = [];

  // Normalize players
  data.players = data.players.map(p => ({
    name: String(p.name || p).trim(),
    username: p.username ? String(p.username).trim() : null
  }));

  // Normalize clans
  data.clans = [...new Set(
    data.clans
      .map(c => {
        if (typeof c === "string") return c.trim();
        if (c?.name && c?.region) return `${c.region}»${c.name}`;
        if (c?.name) return c.name.trim();
        return null;
      })
      .filter(Boolean)
  )];

  await save();
}

// ---------------- LIST BUILDER ----------------
function buildList() {
  const out = [];

  out.push("–––––– PLAYERS ––––––");
  if (!data.players.length) out.push("None");
  else {
    data.players
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(p => out.push(p.username ? `${p.name} : ${p.username}` : p.name));
  }

  out.push("–––––– PRIORITY ––––––");
  if (!data.priority.length) out.push("None");
  else data.priority.sort().forEach(p => out.push(p));

  out.push("–––––– CLANS ––––––");
  if (!data.clans.length) out.push("None");
  else data.clans.sort().forEach(c => out.push(c));

  return "```" + out.join("\n") + "```";
}

// ---------------- COMMAND HANDLER ----------------
client.on("messageCreate", async msg => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith("^")) return;

  const args = msg.content.slice(1).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();
  let changed = false;

  if (cmd === "ka") {
    const name = args.shift();
    const username = args.shift() || null;
    if (name && !data.players.some(p => p.name === name && p.username === username)) {
      data.players.push({ name, username });
      changed = true;
    }
  }

  if (cmd === "kr") {
    const name = args.shift();
    const username = args.shift() || null;
    const before = data.players.length;
    data.players = data.players.filter(p => !(p.name === name && p.username === username));
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

  await save();
  await msg.reply("KOS list updated.\n" + buildList());
});

// ---------------- STARTUP ----------------
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await load();
});

client.login(process.env.TOKEN);
