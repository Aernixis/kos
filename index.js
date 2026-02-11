require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    EmbedBuilder 
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const DATA_PATH = path.join(__dirname, "data.json");

// Load or initialize data
let data = {};
if (fs.existsSync(DATA_PATH)) {
    data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
} else {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function saveData() {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Ready event
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Slash commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "panel") {
        const embed = new EmbedBuilder()
            .setColor(0x1ABC9C)
            .setTitle("KOS Submission System")
            .setDescription("This bot organizes submissions for YX players and clans onto the KOS list, keeping everything tracked efficiently.")
            .addFields(
                {
                    name: "Players",
                    value: `* To add players, use the command \`^kos add\` or \`^ka\`\n* When adding players, place the **name before the username**\nExample:\n\`^kos add poison poisonrebuild\`\n\`^ka poison poisonrebuild\``
                },
                {
                    name: "Clans",
                    value: `* To add clans, use the command \`^kos clan add\` or \`^kca\`\n* When adding clans, place the **name before the region** and use the short region code\nExample:\n\`^kos clan add yx eu\`\n\`^kca yx eu\``
                }
            )
            .setFooter({ text: "Follow the instructions carefully to avoid duplicates." });

        await interaction.reply({ embeds: [embed] });
    }
});

// Message commands
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim().split(/\s+/);
    const cmd = content[0].toLowerCase();

    // ----- Players -----
    if (cmd === "^kos" && content[1] === "add") {
        if (!content[2] || !content[3]) {
            return message.reply("Usage: `^kos add <name> <username>`\nExample: `^kos add poison poisonrebuild`");
        }

        const name = content[2];
        const username = content[3];

        // Prevent duplicates
        data.players = data.players || [];
        if (data.players.find(p => p.name === name && p.username === username)) {
            return message.reply("This player is already on KOS.");
        }

        data.players.push({ name, username });
        saveData();
        return message.reply(`Player **${name}** with username **${username}** added to KOS.`).then(msg => {
            setTimeout(() => msg.delete().catch(() => {}), 5000);
        });
    }

    if (cmd === "^ka") {
        if (!content[1] || !content[2]) {
            return message.reply("Usage: `^ka <name> <username>`\nExample: `^ka poison poisonrebuild`");
        }

        const name = content[1];
        const username = content[2];

        data.players = data.players || [];
        if (data.players.find(p => p.name === name && p.username === username)) {
            return message.reply("This player is already on KOS.");
        }

        data.players.push({ name, username });
        saveData();
        return message.reply(`Player **${name}** with username **${username}** added to KOS.`).then(msg => {
            setTimeout(() => msg.delete().catch(() => {}), 5000);
        });
    }

    // ----- Clans -----
    if ((cmd === "^kos" && content[1] === "clan" && content[2] === "add") || cmd === "^kca") {
        const args = cmd === "^kca" ? content.slice(1) : content.slice(3);

        if (!args[0] || !args[1]) {
            return message.reply("Usage: `^kos clan add <name> <region>` or `^kca <name> <region>`\nExample: `^kos clan add yx eu`");
        }

        const name = args[0];
        const region = args[1].toUpperCase();

        data.clans = data.clans || [];
        if (data.clans.find(c => c.name === name && c.region === region)) {
            return message.reply("This clan is already on KOS.");
        }

        data.clans.push({ name, region });
        saveData();
        return message.reply(`Clan **${name}** in region **${region}** added to KOS.`).then(msg => {
            setTimeout(() => msg.delete().catch(() => {}), 5000);
        });
    }
});

// Register the slash command (run once)
client.on('ready', async () => {
    const commandData = new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Displays the KOS submission instructions');
    
    await client.application.commands.create(commandData);
});

client.login(process.env.BOT_TOKEN);
