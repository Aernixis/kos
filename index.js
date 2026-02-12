require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
});

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

// ---------------- Format Lists ----------------
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
    const gifEmbed = new EmbedBuilder()
        .setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExc2FoODRjMmVtNmhncjkyZzY0ZGVwa2l3dzV0M3UyYmZ4bjVsZ2pnOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/iuttaLUMRLWEgJKRHx/giphy.gif')
        .setColor(0xFF0000);
    const tutorialEmbed = new EmbedBuilder()
        .setTitle('KOS Submission System')
        .setDescription(`KOS Submission System
This bot organizes LBG players and clans onto the KOS list for YX members.

Players
* To add players, use the command ^kos add or ^ka
* To remove players, use the command ^kos remove or ^kr

Clans
* To add clans, use the command ^kos clan add or ^kca
* To remove clans, use the command ^kos clan remove or ^kcr

Thank you for being a part of YX!`)
        .setColor(0xFF0000);

    // GIF
    if (kosData.panelMessages.gif) {
        try {
            const msg = await channel.messages.fetch(kosData.panelMessages.gif);
            await msg.edit({ embeds: [gifEmbed] });
        } catch {
            const msg = await channel.send({ embeds: [gifEmbed] });
            kosData.panelMessages.gif = msg.id;
        }
    } else {
        const msg = await channel.send({ embeds: [gifEmbed] });
        kosData.panelMessages.gif = msg.id;
    }

    // Tutorial
    if (kosData.panelMessages.tutorial) {
        try {
            const msg = await channel.messages.fetch(kosData.panelMessages.tutorial);
            await msg.edit({ embeds: [tutorialEmbed] });
        } catch {
            const msg = await channel.send({ embeds: [tutorialEmbed] });
            kosData.panelMessages.tutorial = msg.id;
        }
    } else {
        const msg = await channel.send({ embeds: [tutorialEmbed] });
        kosData.panelMessages.tutorial = msg.id;
    }

    saveData();
}

// ---------------- KOS List ----------------
async function updateKosList(channel) {
    kosData.listData.channelId = channel.id;

    const playersText = '```–––––––– PLAYERS ––––––\n' + formatPlayers() + '\n```';
    const priorityText = '```–––––––– PRIORITY ––––––\n' + formatPriority() + '\n```';
    const clansText = '```–––––––– CLANS ––––––\n' + formatClans() + '\n```';

    // Players
    if(kosData.listData.playersMessageId) {
        try {
            const msg = await channel.messages.fetch(kosData.listData.playersMessageId);
            await msg.edit({ content: playersText });
        } catch {
            const msg = await channel.send(playersText);
            kosData.listData.playersMessageId = msg.id;
        }
    } else {
        const msg = await channel.send(playersText);
        kosData.listData.playersMessageId = msg.id;
    }

    // Priority
    if(kosData.listData.priorityMessageId) {
        try {
            const msg = await channel.messages.fetch(kosData.listData.priorityMessageId);
            await msg.edit({ content: priorityText });
        } catch {
            const msg = await channel.send(priorityText);
            kosData.listData.priorityMessageId = msg.id;
        }
    } else {
        const msg = await channel.send(priorityText);
        kosData.listData.priorityMessageId = msg.id;
    }

    // Clans
    if(kosData.listData.clansMessageId) {
        try {
            const msg = await channel.messages.fetch(kosData.listData.clansMessageId);
            await msg.edit({ content: clansText });
        } catch {
            const msg = await channel.send(clansText);
            kosData.listData.clansMessageId = msg.id;
        }
    } else {
        const msg = await channel.send(clansText);
        kosData.listData.clansMessageId = msg.id;
    }

    saveData();
}

// ---------------- Prefix Commands ----------------
client.on('messageCreate', async msg => {
    if(msg.author.bot) return;
    const parts = msg.content.trim().split(/\s+/);
    const prefix = parts[0].toLowerCase();

    // ---------------- Add Player ----------------
    if(prefix === '^ka' || (prefix === '^kos' && parts[1]?.toLowerCase() === 'add')) {
        let name, username;
        if(prefix === '^ka') {
            name = parts[1];
            username = parts[2];
        } else { // ^kos add
            name = parts[2];
            username = parts[3];
        }
        if(!name || !username) return confirmPing(msg,'Player unable to be added.');
        if(kosData.players.some(p=>p.name.toLowerCase()===name.toLowerCase())) return confirmPing(msg,'Player already exists.');
        kosData.players.push({ name, username, addedBy: msg.author.id });
        confirmPing(msg,'Player added!');
        if(kosData.listData.channelId) updateKosList(await client.channels.fetch(kosData.listData.channelId));
    }

    // ---------------- Remove Player ----------------
    if(prefix === '^kr' || (prefix === '^kos' && parts[1]?.toLowerCase() === 'remove')) {
        let name = prefix === '^kr' ? parts[1] : parts[2];
        if(!name) return confirmPing(msg,'Player unable to be removed.');
        kosData.players = kosData.players.filter(p => p.name.toLowerCase() !== name.toLowerCase());
        confirmPing(msg,'Player removed!');
        if(kosData.listData.channelId) updateKosList(await client.channels.fetch(kosData.listData.channelId));
    }

    // ---------------- Add/Remove Clan ----------------
    if(prefix === '^kca' || prefix === '^kcr' || (prefix === '^kos' && parts[1]?.toLowerCase() === 'clan')) {
        let action = (prefix === '^kcr' || parts[2]?.toLowerCase() === 'remove') ? 'remove' : 'add';
        let name, region;

        if(prefix === '^kca' || prefix === '^kcr') {
            name = parts[1];
            region = parts[2];
        } else { // ^kos clan add/remove
            name = parts[3];
            region = parts[4];
        }

        if(!name || !region) return confirmPing(msg,'Clan name or region required.');

        const formatted = `${region.toUpperCase()}»${name.toUpperCase()}`;

        if(action === 'add') {
            if(kosData.clans.includes(formatted)) return confirmPing(msg,'Clan already exists.');
            kosData.clans.push(formatted);
            confirmPing(msg, `Clan added: ${formatted}`);
        } else {
            kosData.clans = kosData.clans.filter(c => c !== formatted);
            confirmPing(msg, `Clan removed: ${formatted}`);
        }

        if(kosData.listData.channelId) updateKosList(await client.channels.fetch(kosData.listData.channelId));
    }
});

// ---------------- Slash Commands ----------------
client.on('interactionCreate', async interaction => {
    if(!interaction.isChatInputCommand()) return;

    // Panel
    if(interaction.commandName==='panel') {
        if(interaction.user.id!==OWNER_ID) return interaction.reply({ content:'Not allowed.', ephemeral:true });
        await updatePanel(interaction.channel);
        await interaction.reply({ content:'Panel posted/updated!', ephemeral:true });
    }

    // List
    if(interaction.commandName==='list') {
        if(interaction.user.id!==OWNER_ID) return interaction.reply({ content:'Not allowed.', ephemeral:true });
        await updateKosList(interaction.channel);
        await interaction.reply({ content:`KOS list posted/updated in <#${interaction.channel.id}>`, ephemeral:true });
    }

    // Submission
    if(interaction.commandName==='submission') {
        if(interaction.user.id!==OWNER_ID) return interaction.reply({ content:'Not allowed.', ephemeral:true });
        kosData.listData.channelId = interaction.channelId;
        await interaction.reply({ content:`Submission channel set to <#${interaction.channelId}>`, ephemeral:true });
    }
});

// ---------------- Periodic Save ----------------
setInterval(saveData, 60_000);

// ---------------- Login ----------------
client.login(process.env.TOKEN);
