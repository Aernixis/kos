require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
});

const OWNER_ID = '1283217337084018749';
const DATA_FILE = './data.json';

// ---------------- Memory ----------------
let kosData = { players: [], topPriority: [], clans: [] };
let panelMessages = { gif: null, tutorial: null };
let listData = { channelId: null, playersMessageId: null, priorityMessageId: null, clansMessageId: null };

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
    const arr = kosData.players.slice().sort((a,b) => a.name.localeCompare(b.name));
    return arr.map(p => `${p.name} : ${p.username || 'N/A'}`).join('\n') || 'None';
}

function formatPriority() {
    const arr = kosData.topPriority.slice().sort((a,b)=>a.localeCompare(b));
    return arr.join('\n') || 'None';
}

function formatClans() {
    const arr = kosData.clans.slice().sort((a,b)=>a.localeCompare(b));
    return arr.join('\n') || 'None';
}

// ---------------- List Update ----------------
async function updateKosList(channel) {
    listData.channelId = channel.id;

    // Players
    const playersText = '```–––––––– PLAYERS ––––––\n' + formatPlayers() + '\n```';
    let playersMsg;
    if(listData.playersMessageId){
        try { 
            playersMsg = await channel.messages.fetch(listData.playersMessageId);
            await playersMsg.edit(playersText);
        } catch { 
            playersMsg = await channel.send(playersText);
            listData.playersMessageId = playersMsg.id;
        }
    } else {
        playersMsg = await channel.send(playersText);
        listData.playersMessageId = playersMsg.id;
    }

    // Priority
    const priorityText = '```–––––––– PRIORITY ––––––\n' + formatPriority() + '\n```';
    let priorityMsg;
    if(listData.priorityMessageId){
        try { 
            priorityMsg = await channel.messages.fetch(listData.priorityMessageId);
            await priorityMsg.edit(priorityText);
        } catch { 
            priorityMsg = await channel.send(priorityText);
            listData.priorityMessageId = priorityMsg.id;
        }
    } else {
        priorityMsg = await channel.send(priorityText);
        listData.priorityMessageId = priorityMsg.id;
    }

    // Clans
    const clansText = '```–––––––– CLANS ––––––\n' + formatClans() + '\n```';
    let clansMsg;
    if(listData.clansMessageId){
        try { 
            clansMsg = await channel.messages.fetch(listData.clansMessageId);
            await clansMsg.edit(clansText);
        } catch { 
            clansMsg = await channel.send(clansText);
            listData.clansMessageId = clansMsg.id;
        }
    } else {
        clansMsg = await channel.send(clansText);
        listData.clansMessageId = clansMsg.id;
    }
}

// ---------------- Ready ----------------
client.on('ready', () => console.log(`Logged in as ${client.user.tag}`));

// ---------------- Prefix Commands ----------------
client.on('messageCreate', async msg => {
    if(msg.author.bot) return;
    const parts = msg.content.trim().split(/\s+/);
    const prefix = parts[0].toLowerCase();

    // Add Player
    if(['^ka','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='add' || prefix==='^ka')){
        let name = prefix==='^ka' ? parts[1] : parts[2];
        let username = prefix==='^ka' ? parts[2] : parts[3];
        if(!name || !username) return confirmPing(msg,'Player unable to be added.');
        if(kosData.players.some(p=>p.name.toLowerCase()===name.toLowerCase())) return confirmPing(msg,'Player already exists.');

        kosData.players.push({ name, username, addedBy: msg.author.id });
        confirmPing(msg,'Player added!');
        if(listData.channelId) updateKosList(await client.channels.fetch(listData.channelId));
    }

    // Remove Player
    if(['^kr','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='remove' || prefix==='^kr')){
        let name = prefix==='^kr' ? parts[1] : parts[2];
        if(!name) return confirmPing(msg,'Player unable to be removed.');

        const idx = kosData.players.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());
        if(idx===-1 && msg.author.id!==OWNER_ID) return confirmPing(msg,'Player not found.');
        if(idx!==-1) kosData.players.splice(idx,1);
        confirmPing(msg,'Player removed!');
        if(listData.channelId) updateKosList(await client.channels.fetch(listData.channelId));
    }

    // Add Clan
    if(['^kca','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='clan' && parts[2]?.toLowerCase()==='add' || prefix==='^kca')){
        let name = prefix==='^kca' ? parts[1] : parts[3];
        if(!name) return confirmPing(msg,'Clan unable to be added.');
        if(kosData.clans.some(c=>c.toLowerCase()===name.toLowerCase())) return confirmPing(msg,'Clan already exists.');

        kosData.clans.push(name);
        confirmPing(msg,'Clan added!');
        if(listData.channelId) updateKosList(await client.channels.fetch(listData.channelId));
    }

    // Remove Clan
    if(['^kcr','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='clan' && parts[2]?.toLowerCase()==='remove' || prefix==='^kcr')){
        let name = prefix==='^kcr' ? parts[1] : parts[3];
        if(!name) return confirmPing(msg,'Clan unable to be removed.');

        const idx = kosData.clans.findIndex(c=>c.toLowerCase()===name.toLowerCase());
        if(idx===-1 && msg.author.id!==OWNER_ID) return confirmPing(msg,'Clan not found.');
        if(idx!==-1) kosData.clans.splice(idx,1);
        confirmPing(msg,'Clan removed!');
        if(listData.channelId) updateKosList(await client.channels.fetch(listData.channelId));
    }
});

// ---------------- Slash Commands ----------------
client.on('interactionCreate', async interaction => {
    if(!interaction.isChatInputCommand()) return;

    // PANEL
    if(interaction.commandName==='panel'){
        if(interaction.user.id!==OWNER_ID) return interaction.reply({ content:'You are not allowed to use this.', ephemeral:true });

        const gifEmbed = new EmbedBuilder().setImage('https://i.imgur.com/aV9NbA7.png').setColor(0xFF0000);
        const tutorialEmbed = new EmbedBuilder()
            .setTitle('KOS Submission System')
            .setDescription(`This bot organizes LBG players and clans onto the KOS list for YX members.

**Players**
To add players, use ^kos add or ^ka
To remove players, use ^kos remove or ^kr

**Clans**
To add clans, use ^kos clan add or ^kca
To remove clans, use ^kos clan remove or ^kcr

Thank you for being a part of YX!`)
            .setColor(0xFF0000);

        // GIF Message
        if(panelMessages.gif){
            try {
                const msg = await interaction.channel.messages.fetch(panelMessages.gif);
                await msg.edit({ embeds: [gifEmbed] });
            } catch {
                const msg = await interaction.channel.send({ embeds: [gifEmbed] });
                panelMessages.gif = msg.id;
            }
        } else {
            const msg = await interaction.channel.send({ embeds: [gifEmbed] });
            panelMessages.gif = msg.id;
        }

        // Tutorial Message
        if(panelMessages.tutorial){
            try {
                const msg = await interaction.channel.messages.fetch(panelMessages.tutorial);
                await msg.edit({ embeds: [tutorialEmbed] });
            } catch {
                const msg = await interaction.channel.send({ embeds: [tutorialEmbed] });
                panelMessages.tutorial = msg.id;
            }
        } else {
            const msg = await interaction.channel.send({ embeds: [tutorialEmbed] });
            panelMessages.tutorial = msg.id;
        }

        await interaction.reply({ content:'Panel posted/updated!', ephemeral:true });
    }

    // LIST
    if(interaction.commandName==='list'){
        if(interaction.user.id!==OWNER_ID) return interaction.reply({ content:'You are not allowed to use this.', ephemeral:true });
        const channel = await client.channels.fetch(interaction.channelId);
        await updateKosList(channel);
        await interaction.reply({ content:`KOS list posted/updated in <#${channel.id}>`, ephemeral:true });
    }

    // SUBMISSION
    if(interaction.commandName==='submission'){
        if(interaction.user.id!==OWNER_ID) return interaction.reply({ content:'You are not allowed to use this.', ephemeral:true });
        submissionChannelId = interaction.channelId;
        await interaction.reply({ content:`Submission channel set to <#${submissionChannelId}>`, ephemeral:true });
    }
});

// ---------------- Periodic Save ----------------
setInterval(() => saveData(), 60_000);

// ---------------- Login ----------------
client.login(process.env.TOKEN);
