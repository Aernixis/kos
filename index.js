require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
});

const OWNER_ID = '1283217337084018749';
let submissionChannelId = null;
let listChannelId = null;

let kosData = {
    regular: [],
    priority: [],
    clans: []
};

// ---------------- Utility functions ----------------
function sortAndFormat() {
    const regularSorted = kosData.regular.sort((a,b)=>a.name.localeCompare(b.name));
    const prioritySorted = kosData.priority.sort((a,b)=>a.name.localeCompare(b.name));
    const clansSorted = kosData.clans.sort((a,b)=>a.name.localeCompare(b.name));

    const formatEntries = arr => arr.map(e => `${e.name} : ${e.username || e.region}`).join('\n') || 'None';
    const formatClans = arr => arr.map(e => `${e.name.replace(/\s+/g,'')}:${e.region.replace(/\s+/g,'')}`).join('\n') || 'None';

    return `\`\`\`
–––––––– PLAYERS ––––––
${formatEntries(regularSorted)}

–––––––– PRIORITY ––––––
${formatEntries(prioritySorted)}

–––––––– CLANS ––––––
${formatClans(clansSorted)}
\`\`\``;
}

async function updateListMessages(channel) {
    const formatted = sortAndFormat();
    const listEmbed = new EmbedBuilder()
        .setTitle('KOS List')
        .setDescription(formatted)
        .setColor(0xFF0000);
    await channel.send({ embeds: [listEmbed] });
}

// Helper for prefix commands
async function confirmPing(msg, success, text) {
    const reply = await msg.channel.send({ content: `<@${msg.author.id}> ${text}` });
    setTimeout(() => reply.delete().catch(()=>{}), 3000);
}

// ---------------- Event: Ready ----------------
client.on('ready', () => console.log(`Logged in as ${client.user.tag}`));

// ---------------- Prefix Commands ----------------
client.on('messageCreate', async msg => {
    if(msg.author.bot) return;

    const parts = msg.content.trim().split(/\s+/);
    const prefix = parts[0];

    // Add player
    if (['^ka','^kos'].includes(prefix) && (parts[1]?.toLowerCase() === 'add' || prefix === '^ka')) {
        let name, username;
        if(prefix==='^ka'){ name=parts[1]?.trim(); username=parts[2]?.trim(); }
        else { name=parts[2]?.trim(); username=parts[3]?.trim(); }

        if(!name||!username) return confirmPing(msg,false,'Player unable to be added.');
        if(kosData.regular.some(p=>p.name.toLowerCase()===name.toLowerCase())) return confirmPing(msg,false,'Player unable to be added.');

        kosData.regular.push({ name, username });
        confirmPing(msg,true,'Player added!');
        if(listChannelId) updateListMessages(await client.channels.fetch(listChannelId));
    }

    // Remove player
    if (['^kr','^kos'].includes(prefix) && (parts[1]?.toLowerCase() === 'remove' || prefix === '^kr')) {
        let name;
        if(prefix==='^kr'){ name=parts[1]?.trim(); }
        else { name=parts[2]?.trim(); }

        if(!name) return confirmPing(msg,false,'Player unable to be removed.');
        const idx = kosData.regular.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());
        if(idx===-1) return confirmPing(msg,false,'Player unable to be removed.');

        kosData.regular.splice(idx,1);
        confirmPing(msg,true,'Player removed!');
        if(listChannelId) updateListMessages(await client.channels.fetch(listChannelId));
    }

    // Add clan
    if(['^kca','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='clan' && parts[2]?.toLowerCase()==='add' || prefix==='^kca')) {
        let name, region;
        if(prefix==='^kca'){ name=parts[1]?.trim(); region=parts[2]?.trim(); }
        else { name=parts[3]?.trim(); region=parts[4]?.trim(); }

        if(!name||!region) return confirmPing(msg,false,'Clan unable to be added.');
        if(kosData.clans.some(c=>c.name.toLowerCase()===name.toLowerCase() && c.region.toLowerCase()===region.toLowerCase())) return confirmPing(msg,false,'Clan unable to be added.');

        kosData.clans.push({ name, region });
        confirmPing(msg,true,'Clan added!');
        if(listChannelId) updateListMessages(await client.channels.fetch(listChannelId));
    }

    // Remove clan
    if(['^kcr','^kos'].includes(prefix) && (parts[1]?.toLowerCase()==='clan' && parts[2]?.toLowerCase()==='remove' || prefix==='^kcr')) {
        let name, region;
        if(prefix==='^kcr'){ name=parts[1]?.trim(); region=parts[2]?.trim(); }
        else { name=parts[3]?.trim(); region=parts[4]?.trim(); }

        if(!name||!region) return confirmPing(msg,false,'Clan unable to be removed.');
        const idx = kosData.clans.findIndex(c => c.name.toLowerCase() === name.toLowerCase() && c.region.toLowerCase() === region.toLowerCase());
        if(idx===-1) return confirmPing(msg,false,'Clan unable to be removed.');

        kosData.clans.splice(idx,1);
        confirmPing(msg,true,'Clan removed!');
        if(listChannelId) updateListMessages(await client.channels.fetch(listChannelId));
    }
});

// ---------------- Slash Commands ----------------
client.on('interactionCreate', async interaction => {
    if(!interaction.isChatInputCommand()) return;

    // ---------------- PANEL ----------------
    if(interaction.commandName === 'panel') {
        if(interaction.user.id !== OWNER_ID)
            return interaction.reply({ content:'You are not allowed to use this.', ephemeral:true });

        const gifEmbed = new EmbedBuilder()
            .setTitle('KOS Tutorial GIF')
            .setImage('https://i.imgur.com/aV9NbA7.png')
            .setColor(0xFF0000);

        const tutorialEmbed = new EmbedBuilder()
            .setTitle('KOS Submission System')
            .setDescription(`This bot organizes LBG players and clans onto the KOS list for YX members.\n\n**Players**\n* To add players, use the command ^kos add or ^ka\n* When adding players, place the name before the username\nExample:\n^kos add poison poisonrebuild\n^ka poison poisonrebuild\n* To remove players, use the command ^kos remove or ^kr\n* Removing players follows the same format as adding them\nExample:\n^kos remove poison poisonrebuild\n^kr poison poisonrebuild\n\n**Clans**\n* To add clans, use the command ^kos clan add or ^kca\n* When adding clans, place the name before the region and use the short region code\nExample:\n^kos clan add yx eu\n^kca yx eu\n* To remove clans, use the command ^kos clan remove or ^kcr\n* Removing clans follows the same format as adding them\nExample:\n^kos clan remove yx eu\n^kcr yx eu\n\nThank you for being a part of YX!`)
            .setColor(0xFF0000);

        // Send both embeds at once
        await interaction.reply({ embeds: [gifEmbed, tutorialEmbed] });
    }

    // ---------------- LIST ----------------
    if(interaction.commandName === 'list') {
        if(interaction.user.id !== OWNER_ID)
            return interaction.reply({ content:'You are not allowed to use this.', ephemeral:true });

        // Set the list channel to the current channel if not already set
        if(!listChannelId) listChannelId = interaction.channelId;

        const channel = await client.channels.fetch(listChannelId);
        await updateListMessages(channel);

        await interaction.reply({ content:`KOS list posted in <#${listChannelId}>`, ephemeral:true });
    }

    // ---------------- SUBMISSION ----------------
    if(interaction.commandName === 'submission') {
        if(interaction.user.id !== OWNER_ID) return interaction.reply({ content:'You are not allowed to use this.', ephemeral:true });
        submissionChannelId = interaction.channelId;
        await interaction.reply({ content:`Submission channel set to <#${submissionChannelId}>`, ephemeral:true });
    }
});

// ---------------- LOGIN ----------------
client.login(process.env.TOKEN);
