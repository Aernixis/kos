require('dotenv').config();
const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

const OWNER_ID = '1283217337084018749';
const MOD_ROLE_ID = '1412837397607092405';
const DATA_FILE = path.join(__dirname, 'data.json');

let data = {
    submissionChannelId: null,
    listChannelId: null,
    listMessageIds: { regular: null, priority: null, clans: null },
    players: [],
    priority: [],
    clans: []
};

// Load data
if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE));
}

// Save data
function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Sort helpers
function sortPlayers(list) {
    return list.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

function sortClans(list) {
    return list.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

// Format KOS for text block
function formatKOS(list) {
    return '```\n' + list.map(p => p.username ? `${p.name} : ${p.username}` : p.name).join('\n') + '\n```';
}

function formatPriority(list) {
    return '```\n' + list.map(p => p.username ? `${p.name} : ${p.username}` : p.name).join('\n') + '\n```';
}

function formatClans(list) {
    return '```\n' + list.join('\n') + '\n```';
}

// Update list messages
async function updateListMessages(client) {
    if (!data.listChannelId) return;
    const channel = await client.channels.fetch(data.listChannelId).catch(()=>null);
    if (!channel) return;

    // Regular players
    if (data.listMessageIds.regular) {
        try {
            const msg = await channel.messages.fetch(data.listMessageIds.regular);
            await msg.edit({ content: formatKOS(sortPlayers(data.players)) });
        } catch (err) { data.listMessageIds.regular = null; }
    } else {
        const msg = await channel.send({ content: formatKOS(sortPlayers(data.players)) });
        data.listMessageIds.regular = msg.id;
    }

    // Priority
    if (data.listMessageIds.priority) {
        try {
            const msg = await channel.messages.fetch(data.listMessageIds.priority);
            await msg.edit({ content: formatPriority(sortPlayers(data.priority)) });
        } catch (err) { data.listMessageIds.priority = null; }
    } else {
        const msg = await channel.send({ content: formatPriority(sortPlayers(data.priority)) });
        data.listMessageIds.priority = msg.id;
    }

    // Clans
    if (data.listMessageIds.clans) {
        try {
            const msg = await channel.messages.fetch(data.listMessageIds.clans);
            await msg.edit({ content: formatClans(sortClans(data.clans)) });
        } catch (err) { data.listMessageIds.clans = null; }
    } else {
        const msg = await channel.send({ content: formatClans(sortClans(data.clans)) });
        data.listMessageIds.clans = msg.id;
    }

    saveData();
}

// Create client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Commands handling
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (message.author.id !== OWNER_ID) return; // Owner lock
    const prefix = '^';
    if (!message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();

    // Submission channel lock
    if (['kos', 'ka', 'kr', 'kca', 'kcr'].includes(command)) {
        if (data.submissionChannelId && message.channel.id !== data.submissionChannelId) {
            return message.reply('❌ You can only submit in the submission channel.');
        }
    }

    // Panel command
    if (command === 'panel') {
        return message.channel.send(
`KOS Submission System
This bot organizes submissions for YX players and clans onto the KOS list.
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
Thank you for being apart of YX!`
        );
    }

    // Set submission channel
    if (command === 'submission') {
        data.submissionChannelId = message.channel.id;
        saveData();
        return message.channel.send(`✅ Submission channel set to ${message.channel}`);
    }

    // Set list channel
    if (command === 'list') {
        data.listChannelId = message.channel.id;
        saveData();
        await updateListMessages(client);
        return message.channel.send(`✅ List channel set to ${message.channel} and KOS list posted!`);
    }

    // Player add
    if ((command === 'kos' && args[0] === 'add') || command === 'ka') {
        if (command === 'kos') args.shift(); // remove 'add' for ^kos add
        const [name, username] = args;
        if (!name) return message.reply('❌ Invalid syntax.');
        data.players.push({ name, username: username || '' });
        saveData();
        await updateListMessages(client);
        return message.channel.send(`✅ Player ${name} added.`);
    }

    // Player remove
    if ((command === 'kos' && args[0] === 'remove') || command === 'kr') {
        if (command === 'kos') args.shift(); // remove 'remove'
        const [name, username] = args;
        if (!name) return message.reply('❌ Invalid syntax.');
        const entry = data.players.find(p => p.name === name && p.username === (username || ''));
        if (!entry) return message.channel.send('❌ Player not found.');
        if (message.author.id !== OWNER_ID && message.author.id !== entry.submitter && !message.member.roles.cache.has(MOD_ROLE_ID)) {
            return message.channel.send('❌ You cannot remove this player.');
        }
        data.players = data.players.filter(p => p !== entry);
        saveData();
        await updateListMessages(client);
        return message.channel.send(`✅ Player ${name} removed.`);
    }

    // Clan add
    if ((command === 'kos' && args[0] === 'clan' && args[1] === 'add') || command === 'kca') {
        if (command === 'kos') args.shift(); args.shift(); // remove 'clan add'
        const [name, region] = args;
        if (!name || !region) return message.reply('❌ Invalid syntax.');
        data.clans.push(`${name} » ${region}`);
        saveData();
        await updateListMessages(client);
        return message.channel.send(`✅ Clan ${name} added.`);
    }

    // Clan remove
    if ((command === 'kos' && args[0] === 'clan' && args[1] === 'remove') || command === 'kcr') {
        if (command === 'kos') args.shift(); args.shift(); // remove 'clan remove'
        const [name, region] = args;
        if (!name || !region) return message.reply('❌ Invalid syntax.');
        const clanName = `${name} » ${region}`;
        const entry = data.clans.find(c => c === clanName);
        if (!entry) return message.channel.send('❌ Clan not found.');
        if (message.author.id !== OWNER_ID && !message.member.roles.cache.has(MOD_ROLE_ID)) {
            return message.channel.send('❌ You cannot remove this clan.');
        }
        data.clans = data.clans.filter(c => c !== clanName);
        saveData();
        await updateListMessages(client);
        return message.channel.send(`✅ Clan ${name} removed.`);
    }
});

client.login(process.env.TOKEN);
