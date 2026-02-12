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
        .setDescription(`This bot organizes LBG players and clans onto the KOS list for YX members.

Players
* Add: ^kos add NAME USERNAME or ^ka NAME USERNAME
* Remove: ^kos remove NAME or ^kr NAME

Clans
* Add: ^kos clan add NAME REGION or ^kca NAME REGION
* Remove: ^kos clan remove NAME REGION or ^kcr NAME REGION

Thank you for being a part of YX!`)
        .setColor(0xFF0000);

    async function fetchOrSend(embed, msgId) {
        if(msgId){
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

    kosData.panelMessages.gif = await fetchOrSend(gifEmbed, kosData.panelMessages.gif);
    kosData.panelMessages.tutorial = await fetchOrSend(tutorialEmbed, kosData.panelMessages.tutorial);

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
        let name, region;

        if(prefix==='^kca' || prefix==='^kcr'){
            action = prefix==='^kca' ? 'add' : 'remove';
            name = parts[2]; 
            region = parts[3];
        } else if(action==='clan'){
            action = parts[2]?.toLowerCase();
            name = parts[3];
            region = parts[4];
        }

        if(!name || !region) return confirmPing(msg,'Clan name and region required.');
        const formattedClan = `${region.toUpperCase()}»${name.toUpperCase()}`;

        if(action==='add'){
            if(kosData.clans.includes(formattedClan)) return confirmPing(msg,'Clan already exists.');
            kosData.clans.push(formattedClan);
            confirmPing(msg,'Clan added!');
        } else if(action==='remove'){
            kosData.clans = kosData.clans.filter(c=>c!==formattedClan);
            confirmPing(msg,'Clan removed!');
        }

        if(kosData.listData.channelId) updateKosList(await client.channels.fetch(kosData.listData.channelId));
    }
});

// ---------------- Slash Commands ----------------
client.on('interactionCreate', async interaction => {
    if(!interaction.isChatInputCommand()) return;

    if(interaction.user.id!==OWNER_ID) 
        return interaction.reply({ content:'Not allowed.', ephemeral:true });

    if(interaction.commandName==='panel'){
        await updatePanel(interaction.channel);
        return interaction.reply({ content:'Panel posted/updated!', ephemeral:true });
    }

    if(interaction.commandName==='list'){
        await updateKosList(interaction.channel);
        return interaction.reply({ content:`KOS list posted/updated in <#${interaction.channel.id}>`, ephemeral:true });
    }

    if(interaction.commandName==='submission'){
        kosData.listData.channelId = interaction.channelId;
        return interaction.reply({ content:`Submission channel set to <#${interaction.channelId}>`, ephemeral:true });
    }
});

// ---------------- Periodic Save ----------------
setInterval(saveData, 60_000);

// ---------------- Login ----------------
client.login(process.env.TOKEN);
