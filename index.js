const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const OWNER_ID = process.env.OWNER_ID; // Your Discord ID
let listChannelId = null; // Channel to post KOS list

// Path to your data.json file
const dataPath = path.join(__dirname, 'data.json');

// Read data.json
function readData() {
    if (!fs.existsSync(dataPath)) return { kosList: [] };
    const raw = fs.readFileSync(dataPath);
    return JSON.parse(raw);
}

// Save data.json (not really used here but good to have for future)
function saveData(data) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 4));
}

// Post the KOS list in a channel
async function postKosList(channel) {
    const data = readData();
    const kosList = data.kosList || [];

    if (kosList.length === 0) {
        await channel.send('KOS list is empty.');
        return;
    }

    let message = 'Current KOS List:\n\n';
    kosList.forEach((entry, index) => {
        message += `${index + 1}. ${entry.name} - Priority: ${entry.priority} - Clan: ${entry.clan}\n`;
    });

    await channel.send('```' + message + '```');
}

// Ready event
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Interaction create event
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'list') {
        // Owner check
        if (interaction.user.id !== OWNER_ID) 
            return interaction.reply({ content: 'You are not allowed to use this.', ephemeral: true });

        // Set channel if not set
        if (!listChannelId) listChannelId = interaction.channelId;

        try {
            const channel = await client.channels.fetch(listChannelId);
            await postKosList(channel);
            await interaction.reply({ content: `KOS list posted in <#${listChannelId}>`, ephemeral: true });
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: 'Failed to post KOS list.', ephemeral: true });
        }
    }

    // Submission command stays as is
    if (interaction.commandName === 'submission') {
        // Your existing submission logic here
    }
});

// Log in
client.login(process.env.BOT_TOKEN);
