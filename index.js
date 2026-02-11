require('dotenv').config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data.json');
let data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

function saveData() {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const BOT_OWNER = process.env.BOT_OWNER_ID;

// Helper: sort lists alphabetically
function sortList(list) {
    return list.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

// Update KOS list channel
async function updateListChannel() {
    if (!data.listChannel) return;
    const channel = await client.channels.fetch(data.listChannel).catch(() => null);
    if (!channel) return;

    const playersList = data.players.map(p => `${p.name} (${p.username})`).join('\n') || 'No players yet.';
    const clansList = data.clans.map(c => `${c.name} (${c.region})`).join('\n') || 'No clans yet.';

    const embed = {
        color: 0x1AAD1F,
        title: 'KOS List',
        fields: [
            { name: 'Players', value: playersList },
            { name: 'Clans', value: clansList },
        ]
    };

    await channel.send({ embeds: [embed] });
}

// Retry adding function
async function tryAdd(type, entry, message) {
    for (let i = 0; i < 3; i++) {
        let exists;
        if (type === 'player') {
            exists = data.players.find(p => p.name === entry.name && p.username === entry.username);
            if (!exists) {
                data.players.push(entry);
                data.players = sortList(data.players);
                saveData();
            }
        } else {
            exists = data.clans.find(c => c.name === entry.name && c.region === entry.region);
            if (!exists) {
                data.clans.push(entry);
                data.clans = sortList(data.clans);
                saveData();
            }
        }

        // verify addition
        let verify = type === 'player'
            ? data.players.find(p => p.name === entry.name && p.username === entry.username)
            : data.clans.find(c => c.name === entry.name && c.region === entry.region);

        if (verify) {
            await updateListChannel();
            return true;
        }
    }

    // failed after 3 attempts
    await message.reply({ content: `Unable to add ${type} "${entry.name}". Please try again later.`, ephemeral: true });
    return false;
}

// ================= MESSAGE COMMANDS =================
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const args = message.content.trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

    const isSubmissionChannel = data.submissionChannel && message.channel.id === data.submissionChannel;

    // ========== ADD PLAYER ==========
    if ((cmd === '^kos' && args[0]?.toLowerCase() === 'add') || cmd === '^ka') {
        if (!isSubmissionChannel) return;
        const [name, username] = cmd === '^ka' ? args : args.slice(1);
        if (!name || !username) return message.reply('Usage: ^kos add <name> <username> OR ^ka <name> <username>').then(msg => setTimeout(() => msg.delete(), 5000));

        const exists = data.players.find(p => p.name === name && p.username === username);
        if (exists) return message.reply('This player is on KOS.').then(msg => setTimeout(() => msg.delete(), 5000));

        const added = await tryAdd('player', { name, username, addedBy: message.author.tag }, message);
        if (added) message.delete().catch(() => {});
    }

    // ========== ADD CLAN ==========
    if ((cmd === '^kos' && args[0]?.toLowerCase() === 'clan' && args[1]?.toLowerCase() === 'add') || cmd === '^kca') {
        if (!isSubmissionChannel) return;
        const [name, region] = cmd === '^kca' ? args : args.slice(2);
        if (!name || !region) return message.reply('Usage: ^kos clan add <name> <region> OR ^kca <name> <region>').then(msg => setTimeout(() => msg.delete(), 5000));

        const exists = data.clans.find(c => c.name === name && c.region === region);
        if (exists) return message.reply('This clan is on KOS.').then(msg => setTimeout(() => msg.delete(), 5000));

        const added = await tryAdd('clan', { name, region, addedBy: message.author.tag }, message);
        if (added) message.delete().catch(() => {});
    }

    // ========== REMOVE PLAYER ==========
    if ((cmd === '^kos' && args[0]?.toLowerCase() === 'remove') || cmd === '^kr') {
        const [name, username] = cmd === '^kr' ? args : args.slice(1);
        if (!name || !username) return message.reply('Usage: ^kos remove <name> <username> OR ^kr <name> <username>').then(msg => setTimeout(() => msg.delete(), 5000));

        const index = data.players.findIndex(p => p.name === name && p.username === username);
        if (index === -1) return message.reply('This player is not on the KOS list.').then(msg => setTimeout(() => msg.delete(), 5000));

        data.players.splice(index, 1);
        saveData();
        await updateListChannel();
        message.reply(`Player ${name} removed from KOS.`).then(msg => setTimeout(() => msg.delete(), 5000));
    }

    // ========== REMOVE CLAN ==========
    if ((cmd === '^kos' && args[0]?.toLowerCase() === 'clan' && args[1]?.toLowerCase() === 'remove') || cmd === '^kcr') {
        const [name, region] = cmd === '^kcr' ? args : args.slice(2);
        if (!name || !region) return message.reply('Usage: ^kos clan remove <name> <region> OR ^kcr <name> <region>').then(msg => setTimeout(() => msg.delete(), 5000));

        const index = data.clans.findIndex(c => c.name === name && c.region === region);
        if (index === -1) return message.reply('This clan is not on the KOS list.').then(msg => setTimeout(() => msg.delete(), 5000));

        data.clans.splice(index, 1);
        saveData();
        await updateListChannel();
        message.reply(`Clan ${name} removed from KOS.`).then(msg => setTimeout(() => msg.delete(), 5000));
    }

    // ========== SUBMISSION CHANNEL SET (OWNER ONLY) ==========
    if (cmd === '^channelsubmission') {
        if (message.author.id !== BOT_OWNER) return;
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply('Please mention a channel.');
        data.submissionChannel = channel.id;
        saveData();
        message.reply(`Submission channel set to ${channel.name}`);
    }

    // ========== LIST CHANNEL SET (OWNER ONLY) ==========
    if (cmd === '^channellist') {
        if (message.author.id !== BOT_OWNER) return;
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply('Please mention a channel.');
        data.listChannel = channel.id;
        saveData();
        message.reply(`List channel set to ${channel.name}`);
    }
});

// ================= SLASH COMMANDS =================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'panel') {
        if (interaction.user.id !== BOT_OWNER) return interaction.reply({ content: 'You cannot use this command.', ephemeral: true });

        const embed = {
            color: 0x1AAD1F,
            title: 'KOS Submission System',
            description: 'This bot organizes submissions for YX players and clans onto the KOS list.',
            fields: [
                {
                    name: 'Players',
                    value: `* To add players, use ^kos add or ^ka\n* To remove players, use ^kos remove or ^kr\n* When adding/removing, place name before username\nExample:\n^kos add poison poisonrebuild\n^ka poison poisonrebuild\n^kos remove poison poisonrebuild\n^kr poison poisonrebuild`
                },
                {
                    name: 'Clans',
                    value: `* To add clans, use ^kos clan add or ^kca\n* To remove clans, use ^kos clan remove or ^kcr\n* When adding/removing, place name before region and use short region code\nExample:\n^kos clan add yx eu\n^kca yx eu\n^kos clan remove yx eu\n^kcr yx eu`
                }
            ],
            footer: { text: 'Thank you for being apart of YX!' }
        };

        await interaction.reply({ embeds: [embed] });
    }
});

client.login(process.env.BOT_TOKEN);
