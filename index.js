require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
});

const OWNER_ID = '1283217337084018749';
const DATA_FILE = './data.json';

let submissionChannelId = null;
let listChannelId = null;

// ---------------- Load / Save ----------------
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(DATA_FILE));
            return {
                players: Array.isArray(data.players) ? data.players : [],
                topPriority: Array.isArray(data.topPriority) ? data.topPriority : [],
                clans: Array.isArray(data.clans) ? data.clans : [],
                submissionChannelId: data.submissionChannelId || null,
                listChannelId: data.listChannelId || null,
            };
        } catch(e) {
            console.error('Failed to parse data.json, starting fresh.', e);
        }
    }
    return { players: [], topPriority: [], clans: [], submissionChannelId: null, listChannelId: null };
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Load initial data
let kosData = loadData();
submissionChannelId = kosData.submissionChannelId;
listChannelId = kosData.listChannelId;

// ---------------- Helpers ----------------
function confirmPing(msg, text){
    msg.channel.send({ content:`<@${msg.author.id}> ${text}` })
        .then(reply=>setTimeout(()=>reply.delete().catch(()=>{}),3000));
}

function getKosSections() {
    const data = loadData();

    const players = data.players || [];
    const topPriority = data.topPriority || [];
    const clans = data.clans || [];

    const formatPlayers = players
        .sort((a,b)=>a.name.localeCompare(b.name))
        .map(p => `${p.name} : ${p.username || ''}`)
        .join('\n') || 'None';

    const formatPriority = topPriority
        .slice().sort((a,b)=>a.localeCompare(b))
        .join('\n') || 'None';

    const formatClans = clans
        .map(c => c.replace(/\s+/g,'')) // remove spaces
        .sort((a,b)=>a.localeCompare(b))
        .join('\n') || 'None';

    return {
        players: `–––––––– PLAYERS ––––––\n${formatPlayers}`,
        priority: `–––––––– PRIORITY ––––––\n${formatPriority}`,
        clans: `–––––––– CLANS ––––––\n${formatClans}`
    };
}

async function postKosList(channel){
    const sections = getKosSections();
    await channel.send(`\`\`\`\n${sections.players}\n\`\`\``);
    await channel.send(`\`\`\`\n${sections.priority}\n\`\`\``);
    await channel.send(`\`\`\`\n${sections.clans}\n\`\`\``);
}

// ---------------- Event: Ready ----------------
client.on('ready', ()=> console.log(`Logged in as ${client.user.tag}`));

// ---------------- Prefix Commands ----------------
client.on('messageCreate', async msg=>{
    if(msg.author.bot) return;

    const parts = msg.content.trim().split(/\s+/);
    const prefix = parts[0];

    // ---------- Add Player ----------
    if(['^ka','^kos'].includes(prefix) && (parts[1]?.toLowerCase() === 'add' || prefix==='^ka')){
        let name, username;
        if(prefix==='^ka'){ name=parts[1]; username=parts[2]; }
        else { name=parts[2]; username=parts[3]; }
        if(!name||!username) return confirmPing(msg,'Player unable to be added.');

        // Prevent duplicates
        if(kosData.players.some(p=>p.name.toLowerCase()===name.toLowerCase())) 
            return confirmPing(msg,'Player already exists.');

        kosData.players.push({ name, username, addedBy: msg.author.id });
        saveData(kosData);
        confirmPing(msg,'Player added!');
        if(listChannelId) postKosList(await client.channels.fetch(listChannelId));
    }

    // ---------- Remove Player (Owner Override) ----------
    if(['^kr','^kos'].includes(prefix) && (parts[1]?.toLowerCase() === 'remove' || prefix==='^kr')){
        let name;
        if(prefix==='^kr'){ name=parts[1]; }
        else { name=parts[2]; }
        if(!name) return confirmPing(msg,'Player unable to be removed.');

        const idx = kosData.players.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());
        if(idx === -1 && msg.author.id !== OWNER_ID) return confirmPing(msg,'Player not found.');

        if(idx !== -1) kosData.players.splice(idx,1);
        else if(msg.author.id === OWNER_ID){
            const overrideIdx = kosData.players.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());
            if(overrideIdx!==-1) kosData.players.splice(overrideIdx,1);
        }

        saveData(kosData);
        confirmPing(msg,'Player removed!');
        if(listChannelId) postKosList(await client.channels.fetch(listChannelId));
    }

    // ---------- Add Clan ----------
    if(['^kca','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='clan' && parts[2]?.toLowerCase()==='add' || prefix==='^kca')){
        let name, region;
        if(prefix==='^kca'){ name=parts[1]; region=parts[2]; }
        else { name=parts[3]; region=parts[4]; }
        if(!name||!region) return confirmPing(msg,'Clan unable to be added.');

        // Prevent duplicates
        if(kosData.clans.includes(`${name}»${region}`)) return confirmPing(msg,'Clan already exists.');

        kosData.clans.push(`${name}»${region}`);
        saveData(kosData);
        confirmPing(msg,'Clan added!');
        if(listChannelId) postKosList(await client.channels.fetch(listChannelId));
    }

    // ---------- Remove Clan (Owner Override) ----------
    if(['^kcr','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='clan' && parts[2]?.toLowerCase()==='remove' || prefix==='^kcr')){
        let name, region;
        if(prefix==='^kcr'){ name=parts[1]; region=parts[2]; }
        else { name=parts[3]; region=parts[4]; }
        if(!name||!region) return confirmPing(msg,'Clan unable to be removed.');

        const idx = kosData.clans.findIndex(c=>c.toLowerCase()===`${name}»${region}`.toLowerCase());
        if(idx === -1 && msg.author.id !== OWNER_ID) return confirmPing(msg,'Clan not found.');

        if(idx !== -1) kosData.clans.splice(idx,1);
        else if(msg.author.id === OWNER_ID){
            // Remove by name only if owner
            const overrideIdx = kosData.clans.findIndex(c=>c.toLowerCase().startsWith(name.toLowerCase()));
            if(overrideIdx !== -1) kosData.clans.splice(overrideIdx,1);
        }

        saveData(kosData);
        confirmPing(msg,'Clan removed!');
        if(listChannelId) postKosList(await client.channels.fetch(listChannelId));
    }
});

// ---------------- Slash Commands ----------------
client.on('interactionCreate', async interaction=>{
    if(!interaction.isChatInputCommand()) return;

    // ---------- Panel ----------
    if(interaction.commandName === 'panel'){
        if(interaction.user.id !== OWNER_ID) 
            return interaction.reply({ content:'You are not allowed to use this.', ephemeral:true });

        const gifEmbed = new EmbedBuilder()
            .setTitle('KOS Tutorial GIF')
            .setImage('https://i.imgur.com/aV9NbA7.png')
            .setColor(0xFF0000);

        const tutorialEmbed = new EmbedBuilder()
            .setTitle('KOS Submission System')
            .setDescription(`This bot organizes LBG players and clans onto the KOS list for YX members.\n\n**Players**\n* To add players, use ^kos add or ^ka\n* To remove players, use ^kos remove or ^kr\n**Clans**\n* To add clans, use ^kos clan add or ^kca\n* To remove clans, use ^kos clan remove or ^kcr\nThank you for being a part of YX!`)
            .setColor(0xFF0000);

        await interaction.channel.send({ embeds:[gifEmbed] });
        await interaction.channel.send({ embeds:[tutorialEmbed] });
        await interaction.reply({ content:'Panel posted!', ephemeral:true });
    }

    // ---------- List ----------
    if(interaction.commandName === 'list'){
        if(interaction.user.id !== OWNER_ID) 
            return interaction.reply({ content:'You are not allowed to use this.', ephemeral:true });

        // Automatically set list channel
        if(!listChannelId) listChannelId = interaction.channelId;
        kosData.listChannelId = listChannelId;
        saveData(kosData);

        const channel = await client.channels.fetch(listChannelId);
        await postKosList(channel);
        await interaction.reply({ content:`KOS list posted in <#${listChannelId}>`, ephemeral:true });
    }

    // ---------- Submission ----------
    if(interaction.commandName==='submission'){
        if(interaction.user.id !== OWNER_ID) return interaction.reply({ content:'You are not allowed to use this.', ephemeral:true });
        submissionChannelId = interaction.channelId;
        kosData.submissionChannelId = submissionChannelId;
        saveData(kosData);
        await interaction.reply({ content:`Submission channel set to <#${submissionChannelId}>`, ephemeral:true });
    }
});

// ---------------- Login ----------------
client.login(process.env.TOKEN);
