require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
});

const OWNER_ID = '1283217337084018749';
let submissionChannelId = null;
let listChannelId = null;

const DATA_FILE = './data.json';

// ---------------- Load / Save Data ----------------
let kosData = { players: [], topPriority: [], clans: [] };
if(fs.existsSync(DATA_FILE)) {
    try { kosData = JSON.parse(fs.readFileSync(DATA_FILE)); }
    catch(e){ console.error('Failed to load data.json, starting fresh.', e); }
}

function saveData() { 
    fs.writeFile(DATA_FILE, JSON.stringify(kosData, null, 2), err => {
        if(err) console.error('Failed to save data.json:', err);
    });
}

// ---------------- Helper Functions ----------------
function confirmPing(msg, text){
    msg.channel.send({ content: `<@${msg.author.id}> ${text}` })
       .then(reply=>setTimeout(()=>reply.delete().catch(()=>{}),3000));
}

function formatKosList(){
    const players = kosData.players.sort((a,b)=>a.name.localeCompare(b.name));
    const priority = kosData.topPriority.slice().sort((a,b)=>a.localeCompare(b));
    const clans = kosData.clans.slice().sort((a,b)=>a.localeCompare(b));

    const formatPlayers = arr => arr.map(e=>`${e.name} : ${e.username || 'N/A'}`).join('\n') || 'None';
    const formatPriority = arr => arr.join('\n') || 'None';
    const formatClans = arr => arr.join('\n') || 'None';

    return `–––––––– PLAYERS ––––––
${formatPlayers(players)}

–––––––– PRIORITY ––––––
${formatPriority(priority)}

–––––––– CLANS ––––––
${formatClans(clans)}`;
}

async function postKosList(channel){
    const text = formatKosList();
    await channel.send(`\`\`\`\n${text}\n\`\`\``);
}

// ---------------- Event: Ready ----------------
client.on('ready', () => console.log(`Logged in as ${client.user.tag}`));

// ---------------- Prefix Commands ----------------
client.on('messageCreate', async msg => {
    if(msg.author.bot) return;

    const parts = msg.content.trim().split(/\s+/);
    const prefix = parts[0].toLowerCase();

    // ---------- Add Player ----------
    if(['^ka','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='add' || prefix==='^ka')){
        let name, username;
        if(prefix==='^ka'){ name=parts[1]?.trim(); username=parts[2]?.trim(); }
        else { name=parts[2]?.trim(); username=parts[3]?.trim(); }

        if(!name||!username) return confirmPing(msg,'Player unable to be added.');
        if(kosData.players.some(p=>p.name.toLowerCase()===name.toLowerCase())) return confirmPing(msg,'Player already exists.');

        kosData.players.push({ name, username, addedBy: msg.author.id });
        confirmPing(msg,'Player added!');

        if(listChannelId) postKosList(await client.channels.fetch(listChannelId));
    }

    // ---------- Remove Player ----------
    if(['^kr','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='remove' || prefix==='^kr')){
        let name;
        if(prefix==='^kr'){ name=parts[1]?.trim(); }
        else { name=parts[2]?.trim(); }

        if(!name) return confirmPing(msg,'Player unable to be removed.');

        const idx = kosData.players.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());

        if(idx===-1 && msg.author.id!==OWNER_ID) return confirmPing(msg,'Player not found.');

        if(idx!==-1) kosData.players.splice(idx,1);
        else if(msg.author.id===OWNER_ID){
            const overrideIdx = kosData.players.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());
            if(overrideIdx!==-1) kosData.players.splice(overrideIdx,1);
        }

        confirmPing(msg,'Player removed!');
        if(listChannelId) postKosList(await client.channels.fetch(listChannelId));
    }

    // ---------- Add Clan ----------
    if(['^kca','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='clan' && parts[2]?.toLowerCase()==='add' || prefix==='^kca')){
        let name;
        if(prefix==='^kca'){ name=parts[1]?.trim(); }
        else { name=parts[3]?.trim(); }

        if(!name) return confirmPing(msg,'Clan unable to be added.');
        if(kosData.clans.some(c=>c.toLowerCase()===name.toLowerCase())) return confirmPing(msg,'Clan already exists.');

        kosData.clans.push(name);
        confirmPing(msg,'Clan added!');
        if(listChannelId) postKosList(await client.channels.fetch(listChannelId));
    }

    // ---------- Remove Clan ----------
    if(['^kcr','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='clan' && parts[2]?.toLowerCase()==='remove' || prefix==='^kcr')){
        let name;
        if(prefix==='^kcr'){ name=parts[1]?.trim(); }
        else { name=parts[3]?.trim(); }

        if(!name) return confirmPing(msg,'Clan unable to be removed.');

        const idx = kosData.clans.findIndex(c=>c.toLowerCase()===name.toLowerCase());

        if(idx===-1 && msg.author.id!==OWNER_ID) return confirmPing(msg,'Clan not found.');

        if(idx!==-1) kosData.clans.splice(idx,1);

        confirmPing(msg,'Clan removed!');
        if(listChannelId) postKosList(await client.channels.fetch(listChannelId));
    }
});

// ---------------- Slash Commands ----------------
client.on('interactionCreate', async interaction => {
    if(!interaction.isChatInputCommand()) return;

    // ---------- Panel ----------
    if(interaction.commandName==='panel'){
        if(interaction.user.id!==OWNER_ID) return interaction.reply({ content:'You are not allowed to use this.', ephemeral:true });

        const gifEmbed = new EmbedBuilder()
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
    if(interaction.commandName==='list'){
        if(interaction.user.id!==OWNER_ID) return interaction.reply({ content:'You are not allowed to use this.', ephemeral:true });

        if(!listChannelId) listChannelId = interaction.channelId;
        const channel = await client.channels.fetch(listChannelId);
        await postKosList(channel);
        await interaction.reply({ content:`KOS list posted in <#${listChannelId}>`, ephemeral:true });
    }

    // ---------- Submission ----------
    if(interaction.commandName==='submission'){
        if(interaction.user.id!==OWNER_ID) return interaction.reply({ content:'You are not allowed to use this.', ephemeral:true });

        submissionChannelId = interaction.channelId;
        await interaction.reply({ content:`Submission channel set to <#${submissionChannelId}>`, ephemeral:true });
    }
});

// ---------------- Periodic Save ----------------
setInterval(() => saveData(), 60_000); // save memory -> file every 60s

// ---------------- Login ----------------
client.login(process.env.TOKEN);

