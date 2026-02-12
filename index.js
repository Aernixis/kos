require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

const OWNER_ID = '1283217337084018749';
const DATA_FILE = './data.json';

let kosData = {
    players: [],
    topPriority: [],
    clans: [],
    panelMessages: { gif: null, tutorial: null },
    listData: {
        channelId: null,
        playersMessageId: null,
        priorityMessageId: null,
        clansMessageId: null
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

function confirmPing(msg, text) {
    msg.channel.send(`<@${msg.author.id}> ${text}`)
        .then(m => setTimeout(() => m.delete().catch(()=>{}), 3000));
}

// ---------- FORMAT ----------
function formatPriority() {
    return kosData.topPriority
        .map(n => kosData.players.find(p => norm(p.name) === n)?.name || n)
        .sort()
        .join('\n') || 'None';
}

function formatPlayers() {
    return kosData.players
        .filter(p => !kosData.topPriority.includes(norm(p.name)))
        .sort((a,b)=>a.name.localeCompare(b.name))
        .map(p => `${p.name} : ${p.username}`)
        .join('\n') || 'None';
}

function formatClans() {
    return kosData.clans.sort().join('\n') || 'None';
}

// ---------- LIST UPDATE ----------
async function updateKosList(channel) {
    if (!channel) return;

    async function send(id, content) {
        try {
            if (id) {
                const m = await channel.messages.fetch(id);
                await m.edit(content);
                return m.id;
            }
        } catch {}
        const m = await channel.send(content);
        return m.id;
    }

    kosData.listData.playersMessageId = await send(
        kosData.listData.playersMessageId,
        `\`\`\`–––––––– PLAYERS ––––––\n${formatPlayers()}\n\`\`\``
    );

    kosData.listData.priorityMessageId = await send(
        kosData.listData.priorityMessageId,
        `\`\`\`–––––––– PRIORITY ––––––\n${formatPriority()}\n\`\`\``
    );

    kosData.listData.clansMessageId = await send(
        kosData.listData.clansMessageId,
        `\`\`\`–––––––– CLANS ––––––\n${formatClans()}\n\`\`\``
    );

    saveData();
}

// ---------- PANEL ----------
async function updatePanel(channel) {
    const gif = new EmbedBuilder()
        .setImage('https://media4.giphy.com/media/iuttaLUMRLWEgJKRHx/giphy.gif')
        .setColor(0xFF0000);

    const info = new EmbedBuilder()
        .setTitle('KOS Submission System')
        .setColor(0xFF0000)
        .setDescription('Use prefix commands to submit players and clans.');

    async function send(id, embed) {
        try {
            if (id) {
                const m = await channel.messages.fetch(id);
                await m.edit({ embeds:[embed] });
                return m.id;
            }
        } catch {}
        const m = await channel.send({ embeds:[embed] });
        return m.id;
    }

    kosData.panelMessages.gif = await send(kosData.panelMessages.gif, gif);
    kosData.panelMessages.tutorial = await send(kosData.panelMessages.tutorial, info);
    saveData();
}

// ---------- PREFIX COMMANDS ----------
client.on('messageCreate', async msg => {
    if (msg.author.bot) return;
    const p = msg.content.trim().split(/\s+/);
    const cmd = p[0].toLowerCase();

    // ---- ADD PLAYER ----
    if (cmd === '^ka') {
        const name = p[1], user = p[2];
        if (!name || !user) return confirmPing(msg,'Name and username required.');
        if (kosData.players.some(x => norm(x.name) === norm(name)))
            return confirmPing(msg,'Player already exists.');
        kosData.players.push({ name, username:user });
        saveData();
        confirmPing(msg,`Added ${name}`);
        return;
    }

    // ---- REMOVE PLAYER ----
    if (cmd === '^kr') {
        const name = p[1];
        if (!name) return confirmPing(msg,'Name required.');
        kosData.players = kosData.players.filter(x => norm(x.name) !== norm(name));
        kosData.topPriority = kosData.topPriority.filter(x => x !== norm(name));
        saveData();
        confirmPing(msg,`Removed ${name}`);
        return;
    }

    // ---- PRIORITY ADD ----
    if (cmd === '^pa') {
        const name = p[1], user = p[2];
        if (!name) return confirmPing(msg,'Name required.');
        let player = kosData.players.find(x => norm(x.name) === norm(name));
        if (!player) {
            if (!user) return confirmPing(msg,'Username required.');
            kosData.players.push({ name, username:user });
        }
        if (!kosData.topPriority.includes(norm(name)))
            kosData.topPriority.push(norm(name));
        saveData();
        confirmPing(msg,`Priority added: ${name}`);
        return;
    }

    // ---- PROMOTE ----
    if (cmd === '^p') {
        const name = p[1];
        if (!kosData.players.some(x => norm(x.name) === norm(name)))
            return confirmPing(msg,'Player must exist.');
        if (!kosData.topPriority.includes(norm(name)))
            kosData.topPriority.push(norm(name));
        saveData();
        confirmPing(msg,`Promoted ${name}`);
        return;
    }

    // ---- DEMOTE ----
    if (cmd === '^pr') {
        const name = p[1];
        kosData.topPriority = kosData.topPriority.filter(x => x !== norm(name));
        saveData();
        confirmPing(msg,`Demoted ${name}`);
        return;
    }

    if (kosData.listData.channelId) {
        const ch = await client.channels.fetch(kosData.listData.channelId).catch(()=>null);
        if (ch) updateKosList(ch);
    }
});

// ---------- SLASH ----------
client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    if (i.user.id !== OWNER_ID)
        return i.reply({content:'Not allowed',ephemeral:true});

    try {
        if (i.commandName === 'panel') {
            await i.deferReply({ ephemeral:true });
            await updatePanel(i.channel);
            return i.editReply('Panel updated.');
        }

        if (i.commandName === 'list') {
            await i.deferReply({ ephemeral:true });
            await updateKosList(i.channel);
            return i.editReply('KOS list updated.');
        }
    } catch (e) {
        console.error(e);
        if (!i.replied) i.reply({content:'Error occurred.',ephemeral:true});
    }
});

client.login(process.env.TOKEN);
