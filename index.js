require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, StringSelectMenuBuilder, SlashCommandBuilder, TextInputBuilder, TextInputStyle, ModalBuilder, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data.json');
let data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

function saveData() {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
});

// ----------------------- HELPERS -----------------------
function isOwner(userId) {
    return userId === data.ownerId;
}

function channelCheck(channel, type) {
    if (type === 'submission') return channel.id === data.submissionChannel;
    return true;
}

function addPlayer(name, username) {
    const exists = data.players.find(p => p.name.toLowerCase() === name.toLowerCase() && p.username.toLowerCase() === username.toLowerCase());
    if (exists) return false;
    data.players.push({ name, username });
    data.players.sort((a, b) => a.name.localeCompare(b.name));
    saveData();
    return true;
}

function removePlayer(name, username) {
    const index = data.players.findIndex(p => p.name.toLowerCase() === name.toLowerCase() && p.username.toLowerCase() === username.toLowerCase());
    if (index === -1) return false;
    data.players.splice(index, 1);
    saveData();
    return true;
}

function addClan(name, region) {
    const exists = data.clans.find(c => c.name.toLowerCase() === name.toLowerCase() && c.region.toLowerCase() === region.toLowerCase());
    if (exists) return false;
    data.clans.push({ name, region });
    data.clans.sort((a, b) => a.name.localeCompare(b.name));
    saveData();
    return true;
}

function removeClan(name, region) {
    const index = data.clans.findIndex(c => c.name.toLowerCase() === name.toLowerCase() && c.region.toLowerCase() === region.toLowerCase());
    if (index === -1) return false;
    data.clans.splice(index, 1);
    saveData();
    return true;
}

async function updateListChannel() {
    if (!data.listChannel) return;
    const channel = await client.channels.fetch(data.listChannel).catch(() => null);
    if (!channel) return;

    const playersText = data.players.map(p => `${p.name} (${p.username})`).join('\n') || "No players yet.";
    const clansText = data.clans.map(c => `${c.name} (${c.region})`).join('\n') || "No clans yet.";

    const msgContent = `**KOS List**\n\n**Players:**\n${playersText}\n\n**Clans:**\n${clansText}`;
    // Delete old messages from bot
    const messages = await channel.messages.fetch({ limit: 50 });
    messages.filter(m => m.author.id === client.user.id).forEach(m => m.delete().catch(() => {}));
    channel.send(msgContent).catch(() => {});
}

// ----------------------- COMMAND HANDLERS -----------------------
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const prefixCommands = ['^kos add', '^ka', '^kos remove', '^kr', '^kos clan add', '^kca', '^kos clan remove', '^kcr'];
    const content = message.content.trim();
    if (!prefixCommands.some(cmd => content.toLowerCase().startsWith(cmd))) return;

    if (!data.submissionChannel || message.channel.id !== data.submissionChannel) {
        message.reply("You can only use this command in the submission channel.").catch(() => {});
        return;
    }

    const args = content.split(' ').slice(1);
    const cmd = content.split(' ')[0].toLowerCase();

    // ------------------- PLAYERS -------------------
    if (cmd === '^kos' && args[0]?.toLowerCase() === 'add' || cmd === '^ka') {
        if (args.length < (cmd === '^ka' ? 2 : 3)) {
            message.reply("Usage: ^kos add name username OR ^ka name username").catch(() => {});
            return;
        }
        const name = args[cmd === '^ka' ? 0 : 1];
        const username = args[cmd === '^ka' ? 1 : 2];

        let added = false;
        for (let i = 0; i < 3; i++) {
            if (addPlayer(name, username)) {
                added = true;
                break;
            }
        }

        if (added) {
            updateListChannel();
            message.delete().catch(() => {});
        } else {
            message.reply(`<@${message.author.id}>, unable to add player. Please try again later.`).catch(() => {});
        }
        return;
    }

    if (cmd === '^kos' && args[0]?.toLowerCase() === 'remove' || cmd === '^kr') {
        if (args.length < (cmd === '^kr' ? 2 : 3)) {
            message.reply("Usage: ^kos remove name username OR ^kr name username").catch(() => {});
            return;
        }
        const name = args[cmd === '^kr' ? 0 : 1];
        const username = args[cmd === '^kr' ? 1 : 2];
        if (removePlayer(name, username)) {
            message.reply(`Player ${name} (${username}) removed.`).catch(() => {});
            updateListChannel();
        } else {
            message.reply("This player is not on the KOS list.").catch(() => {});
        }
        return;
    }

    // ------------------- CLANS -------------------
    if (cmd === '^kos' && args[0]?.toLowerCase() === 'clan' && args[1]?.toLowerCase() === 'add' || cmd === '^kca') {
        const idx = cmd === '^kca' ? 0 : 2;
        if (args.length < (cmd === '^kca' ? 2 : 4)) {
            message.reply("Usage: ^kos clan add name region OR ^kca name region").catch(() => {});
            return;
        }
        const name = args[idx];
        const region = args[idx + 1];
        let added = false;
        for (let i = 0; i < 3; i++) {
            if (addClan(name, region)) {
                added = true;
                break;
            }
        }
        if (added) {
            updateListChannel();
            message.delete().catch(() => {});
        } else {
            message.reply(`<@${message.author.id}>, unable to add clan. Please try again later.`).catch(() => {});
        }
        return;
    }

    if (cmd === '^kos' && args[0]?.toLowerCase() === 'clan' && args[1]?.toLowerCase() === 'remove' || cmd === '^kcr') {
        const idx = cmd === '^kcr' ? 0 : 2;
        if (args.length < (cmd === '^kcr' ? 2 : 4)) {
            message.reply("Usage: ^kos clan remove name region OR ^kcr name region").catch(() => {});
            return;
        }
        const name = args[idx];
        const region = args[idx + 1];
        if (removeClan(name, region)) {
            message.reply(`Clan ${name} (${region}) removed.`).catch(() => {});
            updateListChannel();
        } else {
            message.reply("This clan is not on the KOS list.").catch(() => {});
        }
        return;
    }
});

// ----------------------- SLASH COMMANDS -----------------------
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (!isOwner(interaction.user.id)) {
        interaction.reply({ content: "Owner only.", ephemeral: true }).catch(() => {});
        return;
    }

    if (interaction.commandName === 'channelsubmission') {
        const channel = interaction.options.getChannel('channel');
        data.submissionChannel = channel.id;
        saveData();
        interaction.reply({ content: `Submission channel set to ${channel.name}`, ephemeral: true }).catch(() => {});
        return;
    }

    if (interaction.commandName === 'channellist') {
        const channel = interaction.options.getChannel('channel');
        data.listChannel = channel.id;
        saveData();
        await updateListChannel();
        interaction.reply({ content: `List channel set to ${channel.name}`, ephemeral: true }).catch(() => {});
        return;
    }

    if (interaction.commandName === 'panel') {
        const embed = {
            color: 1752220,
            title: 'KOS Submission System',
            description: 'This bot organizes submissions for YX players and clans onto the KOS list.',
            fields: [
                { name: 'Players', value: '* To add players, use the command ^kos add or ^ka\n* When adding players, place the name before the username\nExample:\n^kos add poison poisonrebuild\n^ka poison poisonrebuild\n* To remove players, use the command ^kos remove or ^kr\n* Removing players follows the same format as adding them\nExample:\n^kos remove poison poisonrebuild\n^kr poison poisonrebuild' },
                { name: 'Clans', value: '* To add clans, use the command ^kos clan add or ^kca\n* When adding clans, place the name before the region and use the short region code\nExample:\n^kos clan add yx eu\n^kca yx eu\n* To remove clans, use the command ^kos clan remove or ^kcr\n* Removing clans follows the same format as adding them\nExample:\n^kos clan remove yx eu\n^kcr yx eu' }
            ],
            footer: { text: 'Thank you for being apart of YX!' }
        };
        interaction.reply({ embeds: [embed] }).catch(() => {});
        return;
    }
});

// ----------------------- REGISTER SLASH COMMANDS -----------------------
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('channelsubmission')
            .setDescription('Set the submission channel')
            .addChannelOption(option => option.setName('channel').setDescription('Select the submission channel').setRequired(true)),
        new SlashCommandBuilder()
            .setName('channellist')
            .setDescription('Set the KOS list channel')
            .addChannelOption(option => option.setName('channel').setDescription('Select the list channel').setRequired(true)),
        new SlashCommandBuilder()
            .setName('panel')
            .setDescription('Show the submission system panel')
    ].map(cmd => cmd.toJSON());

    const rest = new (require('@discordjs/rest').REST)({ version: '10' }).setToken(process.env.BOT_TOKEN);
    await rest.put(require('discord.js').Routes.applicationCommands(client.user.id), { body: commands }).catch(console.error);
});

client.login(process.env.BOT_TOKEN);
