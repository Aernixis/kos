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

/* =========================
   LOAD + NORMALIZE DATA
========================= */

let data = {
    players: [],
    priority: [],
    clans: []
};

function load() {
    if (fs.existsSync(DATA_FILE)) {
        data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }

    if (!Array.isArray(data.players)) data.players = [];
    if (!Array.isArray(data.priority)) data.priority = [];
    if (!Array.isArray(data.clans)) data.clans = [];

    // ---- NORMALIZE PLAYERS ----
    data.players = data.players
        .filter(Boolean)
        .map(p => ({
            name: String(p.name || p).trim(),
            username: p.username ? String(p.username).trim() : null
        }));

    // ---- NORMALIZE PRIORITY ----
    data.priority = [...new Set(
        data.priority
            .filter(Boolean)
            .map(p => String(p).trim())
    )];

    // ---- NORMALIZE CLANS ----
    data.clans = [...new Set(
        data.clans
            .filter(Boolean)
            .map(c => typeof c === "string" ? c.trim() : c.name?.trim())
            .filter(Boolean)
    )];

    save();
}

function save() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* =========================
   LIST BUILDER
========================= */

function buildList() {
    const out = [];

    out.push("–––––– PLAYERS ––––––");
    if (data.players.length === 0) {
        out.push("None");
    } else {
        data.players
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(p => {
                if (p.username) out.push(`${p.name} : ${p.username}`);
                else out.push(p.name);
            });
    }

    out.push("–––––– PRIORITY ––––––");
    if (data.priority.length === 0) {
        out.push("None");
    } else {
        data.priority
            .sort((a, b) => a.localeCompare(b))
            .forEach(p => out.push(p));
    }

    out.push("–––––– CLANS ––––––");
    if (data.clans.length === 0) {
        out.push("None");
    } else {
        data.clans
            .sort((a, b) => a.localeCompare(b))
            .forEach(c => out.push(c));
    }

    return "```" + out.join("\n") + "```";
}

/* =========================
   COMMAND HANDLER
========================= */

client.on("messageCreate", async msg => {
    if (msg.author.bot) return;
    if (!msg.content.startsWith("^")) return;

    const args = msg.content.slice(1).trim().split(/\s+/);
    const cmd = args.shift()?.toLowerCase();

    let changed = false;

    // ---- ADD PLAYER ----
    if (cmd === "ka") {
        const name = args.shift();
        const username = args.shift() || null;
        if (!name) return;

        if (!data.players.some(p => p.name === name && p.username === username)) {
            data.players.push({ name, username });
            changed = true;
        }
    }

    // ---- REMOVE PLAYER ----
    if (cmd === "kr") {
        const name = args.shift();
        const username = args.shift() || null;

        const before = data.players.length;
        data.players = data.players.filter(
            p => !(p.name === name && p.username === username)
        );
        if (data.players.length !== before) changed = true;
    }

    // ---- PRIORITY ADD ----
    if (cmd === "pa" || cmd === "p") {
        const name = args.join(" ");
        if (name && !data.priority.includes(name)) {
            data.priority.push(name);
            changed = true;
        }
    }

    // ---- PRIORITY REMOVE ----
    if (cmd === "pr") {
        const name = args.join(" ");
        const before = data.priority.length;
        data.priority = data.priority.filter(p => p !== name);
        if (before !== data.priority.length) changed = true;
    }

    // ---- CLAN ADD ----
    if (cmd === "kca") {
        const clan = args.join(" ");
        if (clan && !data.clans.includes(clan)) {
            data.clans.push(clan);
            changed = true;
        }
    }

    // ---- CLAN REMOVE ----
    if (cmd === "kcr") {
        const clan = args.join(" ");
        const before = data.clans.length;
        data.clans = data.clans.filter(c => c !== clan);
        if (before !== data.clans.length) changed = true;
    }

    if (!changed) return;

    save();

    await msg.reply({
        content: "KOS list updated.\n" + buildList()
    });
});

/* =========================
   STARTUP
========================= */

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
    load();
});

client.login(process.env.TOKEN);
