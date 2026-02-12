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
        .setImage('https://i.imgur.com/aV9NbA7.png')
        .setColor(0xFF0000);
    const tutorialEmbed = new EmbedBuilder()
        .setTitle('KOS Submission System')
        .setDescription(`KOS Submission System
This bot organizes LBG players and clans onto the KOS list for YX members.

Players
* To add players, use the command ^kos add or ^ka
* When adding players, place the name before the username
Example:
^kos add poison poisonrebuild
^ka poison poisonrebuild
* To remove players, use the command ^kos remove or ^kr
* Removing players follows the same format as adding them
Example:
^kos remove poison poisonrebuild
^kr poison poisonrebuild

Clans
* To add clans, use the command ^kos clan add or ^kca
* When adding clans, place the name before the region and use the short region code
Example:
^kos clan add yx eu
^kca yx eu
* To remove clans, use the command ^kos clan remove or ^kcr
* Removing clans follows the same format as adding them
Example:
^kos clan remove yx eu
^kcr yx eu

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
            await msg.edit(playersText);
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
            await msg.edit(priorityText);
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
            await msg.edit(clansText);
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

    // Add player
    if(['^ka','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='add' || prefix==='^ka')){
        let name = prefix==='^ka'? parts[1] : parts[2];
        let username = prefix==='^ka'? parts[2] : parts[3];
        if(!name||!username) return confirmPing(msg,'Player unable to be added.');
        if(kosData.players.some(p=>p.name.toLowerCase()===name.toLowerCase())) return confirmPing(msg,'Player already exists.');
        kosData.players.push({ name, username, addedBy: msg.author.id });
        confirmPing(msg,'Player added!');
        if(kosData.listData.channelId) updateKosList(await client.channels.fetch(kosData.listData.channelId));
    }

    // Remove player
    if(['^kr','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='remove' || prefix==='^kr')){
        let name = prefix==='^kr'? parts[1] : parts[2];
        if(!name) return confirmPing(msg,'Player unable to be removed.');
        const idx = kosData.players.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());
        if(idx!==-1) kosData.players.splice(idx,1);
        confirmPing(msg,'Player removed!');
        if(kosData.listData.channelId) updateKosList(await client.channels.fetch(kosData.listData.channelId));
    }

    // Add/Remove clan
    if(['^kca','^kcr','^kos'].includes(prefix)){
        let action = parts[1]?.toLowerCase() || '';
        let name = prefix==='^kca'||prefix==='^kcr'? parts[2] : parts[3];
        if(!name) return confirmPing(msg,'Clan name required.');
        if(['^kca'].includes(prefix) || action==='clan' && parts[2]?.toLowerCase()==='add'){
            if(kosData.clans.some(c=>c.toLowerCase()===name.toLowerCase())) return confirmPing(msg,'Clan already exists.');
            kosData.clans.push(name);
            confirmPing(msg,'Clan added!');
        } else if(['^kcr'].includes(prefix) || action==='clan' && parts[2]?.toLowerCase()==='remove'){
            kosData.clans = kosData.clans.filter(c=>c.toLowerCase()!==name.toLowerCase());
            confirmPing(msg,'Clan removed!');
        }
        if(kosData.listData.channelId) updateKosList(await client.channels.fetch(kosData.listData.channelId));
    }
});

// ---------------- Slash Commands ----------------
client.on('interactionCreate', async interaction => {
    if(!interaction.isChatInputCommand()) return;

    // Panel
    if(interaction.commandName==='panel'){
        if(interaction.user.id!==OWNER_ID) return interaction.reply({ content:'Not allowed.', ephemeral:true });
        await updatePanel(interaction.channel);
        await interaction.reply({ content:'Panel posted/updated!', ephemeral:true });
    }

    // List
    if(interaction.commandName==='list'){
        if(interaction.user.id!==OWNER_ID) return interaction.reply({ content:'Not allowed.', ephemeral:true });
        await updateKosList(interaction.channel);
        await interaction.reply({ content:`KOS list posted/updated in <#${interaction.channel.id}>`, ephemeral:true });
    }

    // Submission
    if(interaction.commandName==='submission'){
        if(interaction.user.id!==OWNER_ID) return interaction.reply({ content:'Not allowed.', ephemeral:true });
        kosData.listData.channelId = interaction.channelId;
        await interaction.reply({ content:`Submission channel set to <#${interaction.channelId}>`, ephemeral:true });
    }
});

// ---------------- Periodic Save ----------------
setInterval(saveData, 60_000);

// ---------------- Login ----------------
client.login(process.env.TOKEN);

