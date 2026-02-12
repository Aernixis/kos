require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

// ---------------- Client Initialization ----------------
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
});

// ---------------- Constants ----------------
const OWNER_ID = '1283217337084018749';
const DATA_FILE = './data.json';

// ---------------- Memory / Data ----------------
let kosData = { 
    players: [], 
    topPriority: [], 
    clans: [], 
    panelMessages: { gif: null, tutorial: null },
    listData: { channelId: null, playersMessageId: null, priorityMessageId: null, clansMessageId: null }
};

// ---------------- Load Data ----------------
if (fs.existsSync(DATA_FILE)) {
    try { kosData = JSON.parse(fs.readFileSync(DATA_FILE)); }
    catch { console.error('Failed to load data.json, starting fresh.'); }
}

// ---------------- Save Data ----------------
function saveData() {
    fs.writeFile(DATA_FILE, JSON.stringify(kosData, null, 2), () => {});
}

// ---------------- Helper ----------------
function confirmPing(msg, text){
    msg.channel.send({ content: `<@${msg.author.id}> ${text}` })
        .then(r => setTimeout(() => r.delete().catch(()=>{}), 3000));
}

function formatPlayers() {
    return kosData.players
        .filter(p => !kosData.topPriority.includes(p.name))
        .sort((a,b)=>a.name.localeCompare(b.name))
        .map(p => `${p.name} : ${p.username}`)
        .join('\n') || 'None';
}

function formatPriority() {
    return kosData.topPriority.slice().sort((a,b)=>a.localeCompare(b)).join('\n') || 'None';
}

function formatClans() {
    return kosData.clans.slice().sort((a,b)=>a.localeCompare(b)).join('\n') || 'None';
}

// ---------------- KOS List ----------------
async function updateKosList(channel) {
    if (!channel) return;
    kosData.listData.channelId = channel.id;

    async function fetchOrSend(id, content) {
        try {
            if (id) {
                const m = await channel.messages.fetch(id);
                await m.edit({ content });
                return m.id;
            }
        } catch {}
        const m = await channel.send({ content });
        return m.id;
    }

    kosData.listData.playersMessageId =
        await fetchOrSend(kosData.listData.playersMessageId, `\`\`\`–––––––– PLAYERS ––––––\n${formatPlayers()}\n\`\`\``);

    kosData.listData.priorityMessageId =
        await fetchOrSend(kosData.listData.priorityMessageId, `\`\`\`–––––––– PRIORITY ––––––\n${formatPriority()}\n\`\`\``);

    kosData.listData.clansMessageId =
        await fetchOrSend(kosData.listData.clansMessageId, `\`\`\`–––––––– CLANS ––––––\n${formatClans()}\n\`\`\``);

    saveData();
}

// ---------------- Prefix Commands ----------------
client.on('messageCreate', async msg => {
    if (msg.author.bot) return;

    const parts = msg.content.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    // -------- PLAYER ADD / REMOVE --------
    if (['^ka','^kr','^kos'].includes(cmd)) {
        let action, name, username;
        if (cmd === '^ka') { action='add'; name=parts[1]; username=parts[2]; }
        else if (cmd === '^kr') { action='remove'; name=parts[1]; }
        else if (cmd === '^kos') { action=parts[1]; name=parts[2]; username=parts[3]; }

        if (action === 'add') {
            if (!name || !username) return confirmPing(msg,'Player name and username required.');
            if (kosData.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))
                return confirmPing(msg,'Player already exists.');
            kosData.players.push({ name, username });
            saveData();
            confirmPing(msg,`Player added: ${name}`);
        }

        if (action === 'remove') {
            if (!name) return confirmPing(msg,'Player name required.');
            kosData.players = kosData.players.filter(p=>p.name.toLowerCase()!==name.toLowerCase());
            kosData.topPriority = kosData.topPriority.filter(p=>p.toLowerCase()!==name.toLowerCase());
            saveData();
            confirmPing(msg,`Player removed: ${name}`);
        }
    }

    // -------- PRIORITY SYSTEM --------
    if (['^pa','^pr','^p'].includes(cmd)) {
        const name = parts[1];
        const username = parts[2];

        if (!name) return confirmPing(msg,'Player name required.');

        const exists = kosData.players.find(p=>p.name.toLowerCase()===name.toLowerCase());

        // ^pa add priority (new OR existing)
        if (cmd === '^pa') {
            if (!username && !exists) return confirmPing(msg,'Username required.');
            if (!exists) kosData.players.push({ name, username });
            if (!kosData.topPriority.includes(name)) kosData.topPriority.push(name);
            saveData();
            return confirmPing(msg,`Added to priority: ${name}`);
        }

        // ^p promote existing
        if (cmd === '^p') {
            if (!exists) return confirmPing(msg,'Player must already be on KOS list.');
            if (!kosData.topPriority.includes(name)) kosData.topPriority.push(name);
            saveData();
            return confirmPing(msg,`Promoted to priority: ${name}`);
        }

        // ^pr demote
        if (cmd === '^pr') {
            if (!kosData.topPriority.includes(name))
                return confirmPing(msg,'Player is not priority.');
            kosData.topPriority = kosData.topPriority.filter(p=>p!==name);
            saveData();
            return confirmPing(msg,`Demoted from priority: ${name}`);
        }
    }

    // -------- CLANS --------
    if (['^kca','^kcr'].includes(cmd)) {
        const name = parts[1];
        const region = parts[2];
        if (!name || !region) return confirmPing(msg,'Clan name and region required.');
        const tag = `${region.toUpperCase()}»${name.toUpperCase()}`;

        if (cmd === '^kca') {
            if (kosData.clans.includes(tag)) return confirmPing(msg,'Clan already exists.');
            kosData.clans.push(tag);
            saveData();
            confirmPing(msg,`Clan added: ${tag}`);
        }

        if (cmd === '^kcr') {
            kosData.clans = kosData.clans.filter(c=>c!==tag);
            saveData();
            confirmPing(msg,`Clan removed: ${tag}`);
        }
    }

    if (kosData.listData.channelId) {
        const ch = await client.channels.fetch(kosData.listData.channelId).catch(()=>null);
        if (ch) updateKosList(ch);
    }
});

// ---------------- Slash Commands ----------------
client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    if (i.user.id !== OWNER_ID) return i.reply({content:'Not allowed',ephemeral:true});

    if (i.commandName === 'list') {
        await i.deferReply({ephemeral:true});
        await updateKosList(i.channel);
        return i.editReply('KOS list updated.');
    }
});

// ---------------- Login ----------------
client.login(process.env.TOKEN);
