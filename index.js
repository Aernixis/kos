const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require("discord.js");
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// /panel command
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "panel") {
        const embed = new EmbedBuilder()
            .setColor(0x1ABC9C)
            .setTitle("KOS Submission System")
            .setDescription("This bot allows YX players to submit others to the KOS list safely and efficiently.")
            .addFields(
                {
                    name: "Players",
                    value: `* To add players, use the command \`^kos add\` or \`^ka\`\n* When adding players, place the **name before the username**\nExample:\n\`^kos add poison poisonrebuild\`\n\`^ka poison poisonrebuild\``
                }
            )
            .setFooter({ text: "Make sure to follow the instructions carefully." });

        await interaction.reply({ embeds: [embed] });
    }
});

// Register the slash command (run once)
client.on('ready', async () => {
    const data = new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Displays the KOS submission instructions');
    
    await client.application.commands.create(data);
});

client.login(process.env.BOT_TOKEN);
