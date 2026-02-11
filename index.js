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
let kosData = { regular: [], priority: [], clans: [] };
if(fs.existsSync(DATA_FILE)){
    try{ kosData = JSON.parse(fs.readFileSync(DATA_FILE)); }
    catch(e){ console.error('Failed to load data.json, starting fresh.', e); }
}

function saveData(){ fs.writeFileSync(DATA_FILE, JSON.stringify(kosData,null,2)); }
function loadData(){ 
    if(fs.existsSync(DATA_FILE)){
        try{ return JSON.parse(fs.readFileSync(DATA_FILE)); }
        catch(e){ return { regular: [], priority: [], clans: [] }; }
    }
    return { regular: [], priority: [], clans: [] };
}

// ---------------- Helper Functions ----------------
function confirmPing(msg,text){
    msg.channel.send({ content:`<@${msg.author.id}> ${text}` })
       .then(reply=>setTimeout(()=>reply.delete().catch(()=>{}),3000));
}

function getKosSections(){
    const data = loadData();
    const regular = data.regular.sort((a,b)=>a.name.localeCompare(b.name));
    const priority = data.priority.sort((a,b)=>a.name.localeCompare(b.name));
    const clans = data.clans.sort((a,b)=>a.name.localeCompare(b.name));

    const formatEntries = arr => arr.map(e=>`${e.name} : ${e.username || e.region}`).join('\n') || 'None';
    const formatClans = arr => arr.map(e=>`${e.name.replace(/\s+/g,'')}:${e.region.replace(/\s+/g,'')}`).join('\n') || 'None';

    return {
        players: `–––––––– PLAYERS ––––––\n${formatEntries(regular)}`,
        priority: `–––––––– PRIORITY ––––––\n${formatEntries(priority)}`,
        clans: `–––––––– CLANS ––––––\n${formatClans(clans)}`
    };
}

async function postKosList(channel){
    const sections = getKosSections();
    await channel.send(`\`\`\`\n${sections.players}\n\`\`\``);
    await channel.send(`\`\`\`\n${sections.priority}\n\`\`\``);
    await channel.send(`\`\`\`\n${sections.clans}\n\`\`\``);
}

// ---------------- Event: Ready ----------------
client.on('ready',()=>console.log(`Logged in as ${client.user.tag}`));

// ---------------- Prefix Commands ----------------
client.on('messageCreate', async msg=>{
    if(msg.author.bot) return;

    const parts = msg.content.trim().split(/\s+/);
    const prefix = parts[0];

    // ---------- Add Player ----------
    if(['^ka','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='add' || prefix==='^ka')){
        let name, username;
        if(prefix==='^ka'){ name=parts[1]?.trim(); username=parts[2]?.trim(); }
        else { name=parts[2]?.trim(); username=parts[3]?.trim(); }
        if(!name||!username) return confirmPing(msg,'Player unable to be added.');
        if(kosData.regular.some(p=>p.name.toLowerCase()===name.toLowerCase())) return confirmPing(msg,'Player already exists.');
        kosData.regular.push({ name, username });
        saveData();
        confirmPing(msg,'Player added!');
        if(listChannelId) postKosList(await client.channels.fetch(listChannelId));
    }

    // ---------- Remove Player (Owner Override) ----------
    if(['^kr','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='remove' || prefix==='^kr')){
        let name;
        if(prefix==='^kr'){ name=parts[1]?.trim(); }
        else { name=parts[2]?.trim(); }
        if(!name) return confirmPing(msg,'Player unable to be removed.');
        const idx = kosData.regular.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());
        if(idx===-1 && msg.author.id!==OWNER_ID) return confirmPing(msg,'Player not found.');
        if(idx!==-1) kosData.regular.splice(idx,1);
        else if(msg.author.id===OWNER_ID){
            const overrideIdx = kosData.regular.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());
            if(overrideIdx!==-1) kosData.regular.splice(overrideIdx,1);
        }
        saveData();
        confirmPing(msg,'Player removed!');
        if(listChannelId) postKosList(await client.channels.fetch(listChannelId));
    }

    // ---------- Add Clan ----------
    if(['^kca','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='clan' && parts[2]?.toLowerCase()==='add' || prefix==='^kca')){
        let name, region;
        if(prefix==='^kca'){ name=parts[1]?.trim(); region=parts[2]?.trim(); }
        else { name=parts[3]?.trim(); region=parts[4]?.trim(); }
        if(!name||!region) return confirmPing(msg,'Clan unable to be added.');
        if(kosData.clans.some(c=>c.name.toLowerCase()===name.toLowerCase() && c.region.toLowerCase()===region.toLowerCase())) return confirmPing(msg,'Clan already exists.');
        kosData.clans.push({ name, region });
        saveData();
        confirmPing(msg,'Clan added!');
        if(listChannelId) postKosList(await client.channels.fetch(listChannelId));
    }

    // ---------- Remove Clan (Owner Override) ----------
    if(['^kcr','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='clan' && parts[2]?.toLowerCase()==='remove' || prefix==='^kcr')){
        let name, region;
        if(prefix==='^kcr'){ name=parts[1]?.trim(); region=parts[2]?.trim(); }
        else { name=parts[3]?.trim(); region=parts[4]?.trim(); }
        if(!name||!region) return confirmPing(msg,'Clan unable to be removed.');
        let idx = kosData.clans.findIndex(c=>c.name.toLowerCase()===name.toLowerCase() && c.region.toLowerCase()===region.toLowerCase());
        if(idx===-1 && msg.author.id!==OWNER_ID) return confirmPing(msg,'Clan not found.');
        if(idx!==-1) kosData.clans.splice(idx,1);
        else if(msg.author.id===OWNER_ID){
            const overrideIdx = kosData.clans.findIndex(c=>c.name.toLowerCase()===name.toLowerCase());
            if(overrideIdx!==-1) kosData.clans.splice(overrideIdx,1);
        }
        saveData();
        confirmPing(msg,'Clan removed!');
        if(listChannelId) postKosList(await client.channels.fetch(listChannelId));
    }
});

// ---------------- Slash Commands ----------------
client.on('interactionCreate', async interaction=>{
    if(!interaction.isChatInputCommand()) return;

    // ---------- Panel ----------
    if(interaction.commandName==='panel'){
        if(interaction.user.id!==OWNER_ID) return interaction.reply({ content:'You are not allowed to use this.', ephemeral:true });
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

// ---------------- Login ----------------
client.login(process.env.TOKEN);
