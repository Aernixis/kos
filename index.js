require('dotenv').config();
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
let submissionChannelId = null;
let listChannelId = null;

let kosData = {
    regular: [],
    priority: [],
    clans: []
};

// Utility functions
function sortAndFormat() {
    const regularSorted = kosData.regular.sort((a,b)=>a.name.localeCompare(b.name));
    const prioritySorted = kosData.priority.sort((a,b)=>a.name.localeCompare(b.name));
    const clansSorted = kosData.clans.sort((a,b)=>a.name.localeCompare(b.name));

    const formatEntries = arr => arr.map(e => `${e.name} : ${e.username || e.region}`).join('\n') || 'None';

    return {
        regular: `\`\`\`\n${formatEntries(regularSorted)}\n\`\`\``,
        priority: `\`\`\`\n${formatEntries(prioritySorted)}\n\`\`\``,
        clans: `\`\`\`\n${formatEntries(clansSorted)}\n\`\`\``
    };
}

async function updateListMessages(channel) {
    const formatted = sortAndFormat();
    await channel.send({ embeds: [
        new EmbedBuilder()
            .setTitle('KOS List - Players')
            .setDescription(formatted.regular)
            .setColor(0xFF0000)
    ]});
    await channel.send({ embeds: [
        new EmbedBuilder()
            .setTitle('KOS List - Priority Players')
            .setDescription(formatted.priority)
            .setColor(0xFF0000)
    ]});
    await channel.send({ embeds: [
        new EmbedBuilder()
            .setTitle('KOS List - Clans')
            .setDescription(formatted.clans)
            .setColor(0xFF0000)
    ]});
}

// Event: Ready
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Message Create (prefix commands)
client.on('messageCreate', async msg => {
    if (msg.author.bot) return;

    const content = msg.content.trim();
    const parts = content.split(/\s+/);
    const prefix = parts[0];

    // Helper for ping confirmation
    async function confirmPing(success, text) {
        const reply = await msg.channel.send({ content: `<@${msg.author.id}> ${text}` });
        setTimeout(() => reply.delete().catch(()=>{}), 3000);
    }

    // Add player
    if (['^ka','^kos'].includes(prefix) && (parts[1] === 'add' || prefix === '^ka')) {
        let [cmd, subcmd, name, username] = parts;
        if(prefix === '^ka') { name = parts[1]; username = parts[2]; }
        if(!name || !username) return confirmPing(false, 'Player unable to be added.');
        // Check duplicates
        if(kosData.regular.find(p=>p.name===name)) return confirmPing(false,'Player unable to be added.');
        kosData.regular.push({ name, username });
        confirmPing(true,'Player added!');
        if(listChannelId) {
            const channel = await client.channels.fetch(listChannelId);
            updateListMessages(channel);
        }
    }

    // Remove player
    if (['^kr','^kos'].includes(prefix) && (parts[1] === 'remove' || prefix === '^kr')) {
        let [cmd, subcmd, name, username] = parts;
        if(prefix === '^kr') { name = parts[1]; username = parts[2]; }
        if(!name) return confirmPing(false,'Player unable to be removed.');
        const idx = kosData.regular.findIndex(p=>p.name===name);
        if(idx===-1) return confirmPing(false,'Player unable to be removed.');
        kosData.regular.splice(idx,1);
        confirmPing(true,'Player removed!');
        if(listChannelId) {
            const channel = await client.channels.fetch(listChannelId);
            updateListMessages(channel);
        }
    }

    // Add clan
    if(['^kca','^kos'].includes(prefix) && (parts[1]==='clan' && parts[2]==='add' || prefix==='^kca')) {
        let name = prefix==='^kca'?parts[1]:parts[3];
        let region = prefix==='^kca'?parts[2]:parts[4];
        if(!name||!region) return confirmPing(false,'Clan unable to be added.');
        if(kosData.clans.find(c=>c.name===name)) return confirmPing(false,'Clan unable to be added.');
        kosData.clans.push({ name, region });
        confirmPing(true,'Clan added!');
        if(listChannelId) {
            const channel = await client.channels.fetch(listChannelId);
            updateListMessages(channel);
        }
    }

    // Remove clan
    if(['^kcr','^kos'].includes(prefix) && (parts[1]==='clan' && parts[2]==='remove' || prefix==='^kcr')) {
        let name = prefix==='^kcr'?parts[1]:parts[3];
        if(!name) return confirmPing(false,'Clan unable to be removed.');
        const idx = kosData.clans.findIndex(c=>c.name===name);
        if(idx===-1) return confirmPing(false,'Clan unable to be removed.');
        kosData.clans.splice(idx,1);
        confirmPing(true,'Clan removed!');
        if(listChannelId) {
            const channel = await client.channels.fetch(listChannelId);
            updateListMessages(channel);
        }
    }
});

// Slash commands
client.on('interactionCreate', async interaction => {
    if(!interaction.isChatInputCommand()) return;

    if(interaction.commandName === 'panel') {
        if(interaction.user.id !== OWNER_ID) return interaction.reply({ content:'You are not allowed to use this.', ephemeral:true });
        // Send GIF embed
        await interaction.channel.send({ embeds: [
            new EmbedBuilder()
                .setTitle('KOS Tutorial GIF')
                .setImage('https://i.imgur.com/aV9NbA7.png')
                .setColor(0xFF0000)
        ]});
        // Send panel embed
        await interaction.channel.send({ embeds: [
            new EmbedBuilder()
                .setTitle('KOS Submission System')
                .setDescription(`This bot organizes LBG players and clans onto the KOS list for YX members.\n\nPlayers\n* To add players, use the command ^kos add or ^ka\n* When adding players, place the name before the username\nExample:\n^kos add poison poisonrebuild\n^ka poison poisonrebuild\n* To remove players, use the command ^kos remove or ^kr\n* Removing players follows the same format as adding them\nExample:\n^kos remove poison poisonrebuild\n^kr poison poisonrebuild\nClans\n* To add clans, use the command ^kos clan add or ^kca\n* When adding clans, place the name before the region and use the short region code\nExample:\n^kos clan add yx eu\n^kca yx eu\n* To remove clans, use the command ^kos clan remove or ^kcr\n* Removing clans follows the same format as adding them\nExample:\n^kos clan remove yx eu\n^kcr yx eu\nThank you for being apart of YX!`)
                .setColor(0xFF0000)
        ]});
        await interaction.reply({ content: 'Panel posted!', ephemeral:true });
    }

    if(interaction.commandName === 'list') {
        if(interaction.user.id !== OWNER_ID) return interaction.reply({ content:'You are not allowed to use this.', ephemeral:true });
        if(!listChannelId) return interaction.reply({ content:'List channel not set.', ephemeral:true });
        const channel = await client.channels.fetch(listChannelId);
        updateListMessages(channel);
        await interaction.reply({ content:'KOS list updated!', ephemeral:true });
    }

    if(interaction.commandName === 'submission') {
        if(interaction.user.id !== OWNER_ID) return interaction.reply({ content:'You are not allowed to use this.', ephemeral:true });
        submissionChannelId = interaction.channelId;
        await interaction.reply({ content:`Submission channel set to <#${submissionChannelId}>`, ephemeral:true });
    }
});

// Login
client.login(process.env.TOKEN);
