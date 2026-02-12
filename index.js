require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

// ---------------- CLIENT ----------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// ---------------- CONSTANTS ----------------
const OWNER_ID = '1283217337084018749';
const PRIORITY_ROLE_ID = '1412837397607092405';
const DATA_FILE = './data.json';

// ---------------- DATA ----------------
let kosData = {
    players: [],
    topPriority: [],
    clans: [],
    panel: {
        channelId: null,
        gifId: null,
        infoId: null
    },
    list: {
        channelId: null,
        playersId: null,
        priorityId: null,
        clansId: null
    }
};

if (fs.existsSync(DATA_FILE)) {
    try {
        kosData = JSON.parse(fs.readFileSync(DATA_FILE));
    } catch {
        console.error('Failed to load data.json');
    }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(kosData, null, 2));
}

const norm = s => s.toLowerCase();

// ---------------- LOCKS ----------------
let listUpdating = false;
let panelUpdating = false;

// ---------------- HELPERS ----------------
function confirmPing(msg, text) {
    msg.channel.send(`<@${msg.author.id}> ${text}`)
        .then(m => setTimeout(() => m.delete().catch(() => {}), 3000))
        .catch(() => {});
}

function canUsePriority(msg) {
    if (msg.author.id === OWNER_ID) return true;
    return msg.member?.roles.cache.has(PRIORITY_ROLE_ID);
}

// ---------------- FORMAT ----------------
function formatPriority() {
    return kosData.topPriority
        .map(n => kosData.players.find(p => norm(p.name) === n)?.name || n)
        .sort()
        .join('\n') || 'None';
}

function formatPlayers() {
    return kosData.players
        .filter(p => !kosData.topPriority.includes(norm(p.name)))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(p => `${p.name} : ${p.username || 'N/A'}`)
        .join('\n') || 'None';
}

function formatClans() {
    return kosData.clans.sort().join('\n') || 'None';
}

// ---------------- LIST UPDATE ----------------
async function updateKosList(channel) {
    if (!channel || listUpdating) return;
    listUpdating = true;

    if (kosData.list.channelId !== channel.id) {
        kosData.list = { channelId: channel.id, playersId: null, priorityId: null, clansId: null };
    }

    async function editOrSend(id, content) {
        if (id) {
            try {
                const msg = await channel.messages.fetch(id);
                await msg.edit({ content });
                return msg.id;
            } catch {}
        }
        const msg = await channel.send({ content });
        return msg.id;
    }

    kosData.list.playersId = await editOrSend(
        kosData.list.playersId,
        `\`\`\`–––––––– PLAYERS ––––––\n${formatPlayers()}\n\`\`\``
    );

    kosData.list.priorityId = await editOrSend(
        kosData.list.priorityId,
        `\`\`\`–––––––– PRIORITY ––––––\n${formatPriority()}\n\`\`\``
    );

    kosData.list.clansId = await editOrSend(
        kosData.list.clansId,
        `\`\`\`–––––––– CLANS ––––––\n${formatClans()}\n\`\`\``
    );

    saveData();
    listUpdating = false;
}

// ---------------- PANEL ----------------
async function updatePanel(channel) {
    if (!channel || panelUpdating) return;
    panelUpdating = true;

    if (kosData.panel.channelId !== channel.id) {
        kosData.panel = { channelId: channel.id, gifId: null, infoId: null };
    }

    const gifEmbed = new EmbedBuilder()
        .setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExc2FoODRjMmVtNmhncjkyZzY0ZGVwa2l3dzV0M3UyYmZ4bjVsZ2pnOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/iuttaLUMRLWEgJKRHx/giphy.gif')
        .setColor(0xFF0000);

    const infoEmbed = new EmbedBuilder()
        .setTitle('KOS Submission System')
        .setColor(0xFF0000)
        .setDescription('Use ^ka, ^kr, ^kca, ^kcr to manage the KOS list.');

    async function editOrSend(id, embed) {
        if (id) {
            try {
                const msg = await channel.messages.fetch(id);
                await msg.edit({ embeds: [embed] });
                return msg.id;
            } catch {}
        }
        const msg = await channel.send({ embeds: [embed] });
        return msg.id;
    }

    kosData.panel.gifId = await editOrSend(kosData.panel.gifId, gifEmbed);
    kosData.panel.infoId = await editOrSend(kosData.panel.infoId, infoEmbed);

    saveData();
    panelUpdating = false;
}

// ---------------- PREFIX COMMANDS ----------------
client.on('messageCreate', async msg => {
    if (msg.author.bot) return;

    const args = msg.content.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    let changed = false;

    if (cmd === '^ka') {
        const [name, username] = args.slice(1);
        if (!name || !username) return confirmPing(msg, 'Name and username required.');
        if (kosData.players.some(p => norm(p.name) === norm(name)))
            return confirmPing(msg, 'Player already exists.');
        kosData.players.push({ name, username });
        changed = true;
        confirmPing(msg, `Added ${name}`);
    }

    if (changed && kosData.list.channelId) {
        const ch = await client.channels.fetch(kosData.list.channelId).catch(() => null);
        if (ch) updateKosList(ch);
    }
});

// ---------------- SLASH COMMANDS ----------------
client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    if (i.user.id !== OWNER_ID)
        return i.reply({ content: 'Not allowed.', ephemeral: true });

    if (i.commandName === 'panel') {
        await i.deferReply({ ephemeral: true });
        await updatePanel(i.channel);
        return i.editReply('Panel updated.');
    }

    if (i.commandName === 'list') {
        await i.deferReply({ ephemeral: true });
        await updateKosList(i.channel);
        return i.editReply('KOS list updated.');
    }
});

// ---------------- LOGIN ----------------
client.login(process.env.TOKEN);
