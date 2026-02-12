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
    catch(e){ console.error('Failed to load data.json, starting fresh.', e); }
}

// ---------------- Save Data ----------------
function saveData() {
    fs.writeFile(DATA_FILE, JSON.stringify(kosData, null, 2), err => {
        if(err) console.error('Failed to save data.json:', err);
    });
}

// ---------------- Helper ----------------
function confirmPing(msg, text){
    msg.channel.send({ content: `<@${msg.author.id}> ${text}` })
       .then(reply => setTimeout(() => reply.delete().catch(()=>{}), 3000));
}

function formatPlayers() {
    return kosData.players.slice().sort((a,b) => a.name.localeCompare(b.name))
        .map(p => `${p.name} : ${p.username || 'N/A'}`).join('\n') || 'None';
}

function formatPriority() {
    return kosData.topPriority.slice().sort((a,b)=>a.localeCompare(b)).join('\n') || 'None';
}

function formatClans() {
    return kosData.clans.slice().sort((a,b)=>a.localeCompare(b)).join('\n') || 'None';
}

// ---------------- Panel ----------------
async function updatePanel(channel) {
    if (!channel) return;

    const gifEmbed = new EmbedBuilder()
        .setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExc2FoODRjMmVtNmhncjkyZzY0ZGVwa2l3dzV0M3UyYmZ4bjVsZ2pnOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/iuttaLUMRLWEgJKRHx/giphy.gif')
        .setColor(0xFF0000);

    const tutorialEmbed = new EmbedBuilder()
        .setTitle('KOS Submission System')
        .setDescription(`This bot organizes LBG players and clans onto the KOS list for YX members.

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

Thank you for being a part of YX!`)
        .setColor(0xFF0000);

    async function fetchOrSendEmbed(msgId, embed) {
        if (msgId) {
            try {
                const msg = await channel.messages.fetch(msgId);
                await msg.edit({ embeds: [embed] });
                return msg.id;
            } catch {
                const msg = await channel.send({ embeds: [embed] });
                return msg.id;
            }
        } else {
            const msg = await channel.send({ embeds: [embed] });
            return msg.id;
        }
    }

    kosData.panelMessages.gif = await fetchOrSendEmbed(kosData.panelMessages.gif, gifEmbed);
    kosData.panelMessages.tutorial = await fetchOrSendEmbed(kosData.panelMessages.tutorial, tutorialEmbed);

    saveData();
}

// ---------------- KOS List ----------------
async function updateKosList(channel) {
    if (!channel) return;
    kosData.listData.channelId = channel.id;

    const playersText = '```–––––––– PLAYERS ––––––\n' + formatPlayers() + '\n```';
    const priorityText = '```–––––––– PRIORITY ––––––\n' + formatPriority() + '\n```';
    const clansText = '```–––––––– CLANS ––––––\n' + formatClans() + '\n```';

    async function fetchOrSend(msgId, content) {
        if (msgId) {
            try {
                const msg = await channel.messages.fetch(msgId);
                await msg.edit({ content });
                return msg.id;
            } catch {
                const msg = await channel.send({ content });
                return msg.id;
            }
        } else {
            const msg = await channel.send({ content });
            return msg.id;
        }
    }

    kosData.listData.playersMessageId = await fetchOrSend(kosData.listData.playersMessageId, playersText);
    kosData.listData.priorityMessageId = await fetchOrSend(kosData.listData.priorityMessageId, priorityText);
    kosData.listData.clansMessageId = await fetchOrSend(kosData.listData.clansMessageId, clansText);

    saveData();
}

// ---------------- Prefix Commands ----------------
client.on('messageCreate', async msg => {
    if (msg.author.bot) return;

    const parts = msg.content.trim().split(/\s+/);
    const prefix = parts[0].toLowerCase();

    // Player Add/Remove
    if (['^ka','^kr','^kos'].includes(prefix)) {
        let action, name, username;
        if (prefix === '^ka') { action = 'add'; name = parts[1]; username = parts[2]; }
        else if (prefix === '^kr') { action = 'remove'; name = parts[1]; }
        else if (prefix === '^kos') { action = parts[1]?.toLowerCase(); name = parts[2]; username = parts[3]; }
        else return;

        if (action === 'add') {
            if(!name && !username) return confirmPing(msg, 'Player name and username required.');
            if(!name) return confirmPing(msg, 'Player name required.');
            if(!username) return confirmPing(msg, 'Username required.');
            if(kosData.players.some(p => p.name.toLowerCase() === name.toLowerCase()))
                return confirmPing(msg, `Player "${name}" already exists.`);
            kosData.players.push({ name, username, addedBy: msg.author.id });
            saveData();
            confirmPing(msg, `Player added: ${name} (${username})`);
        } else if (action === 'remove') {
            if(!name) return confirmPing(msg, 'Player name required.');
            const idx = kosData.players.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
            if(idx === -1) return confirmPing(msg, `Player "${name}" not found.`);
            kosData.players.splice(idx, 1);
            saveData();
            confirmPing(msg, `Player removed: ${name}`);
        }

        if(kosData.listData.channelId) {
            const ch = await client.channels.fetch(kosData.listData.channelId).catch(()=>null);
            if(ch) updateKosList(ch);
        }
    }

    // Clan Add/Remove
    if (['^kca','^kcr','^kos'].includes(prefix)) {
        let action, name, region;
        if (prefix === '^kca') { action = 'add'; name = parts[1]; region = parts[2]; }
        else if (prefix === '^kcr') { action = 'remove'; name = parts[1]; region = parts[2]; }
        else if (prefix === '^kos' && parts[1]?.toLowerCase() === 'clan') {
            action = parts[2]?.toLowerCase(); name = parts[3]; region = parts[4];
        } else return;

        if(!name && !region) return confirmPing(msg, 'Clan name and region required.');
        if(!name) return confirmPing(msg, 'Clan name required.');
        if(!region) return confirmPing(msg, 'Region required.');

        const formattedClan = `${region.toUpperCase()}»${name.toUpperCase()}`;
        if (action === 'add') {
            if(kosData.clans.includes(formattedClan)) return confirmPing(msg, 'Clan already exists.');
            kosData.clans.push(formattedClan);
            saveData();
            confirmPing(msg, `Clan added: ${formattedClan}`);
        } else if (action === 'remove') {
            const index = kosData.clans.indexOf(formattedClan);
            if(index === -1) return confirmPing(msg, 'Clan not found.');
            kosData.clans.splice(index, 1);
            saveData();
            confirmPing(msg, `Clan removed: ${formattedClan}`);
        } else return confirmPing(msg, 'Invalid action. Use add or remove.');

        if(kosData.listData.channelId) {
            const ch = await client.channels.fetch(kosData.listData.channelId).catch(()=>null);
            if(ch) updateKosList(ch);
        }
    }
});

// ---------------- Slash Commands ----------------
client.on('interactionCreate', async interaction => {
    if(!interaction.isChatInputCommand()) return;

    if(interaction.user.id !== OWNER_ID) 
        return interaction.reply({ content: 'Not allowed.', ephemeral: true });

    if(interaction.commandName === 'panel') {
        await interaction.deferReply({ ephemeral: true });
        await updatePanel(interaction.channel);
        return interaction.editReply({ content: 'Panel posted/updated!' });
    }

    if(interaction.commandName === 'list') {
        await interaction.deferReply({ ephemeral: true });
        await updateKosList(interaction.channel);
        return interaction.editReply({ content: `KOS list posted/updated in <#${interaction.channel.id}>` });
    }

    if(interaction.commandName === 'submission') {
        kosData.listData.channelId = interaction.channelId;
        saveData();
        return interaction.reply({ content: `Submission channel set to <#${interaction.channelId}>`, ephemeral: true });
    }
});

// ---------------- Periodic Save ----------------
setInterval(saveData, 60_000);

// ---------------- Login ----------------
client.login(process.env.TOKEN);

