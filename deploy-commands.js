require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const CLIENT_ID = '1470922510496436378'; // bot application ID
const TOKEN = process.env.TOKEN;

const GUILD_IDS = [
    '1412818267910705225',
    '1470930306596081699'
];

const commands = [
    new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Post or update the KOS panel'),

    new SlashCommandBuilder()
        .setName('list')
        .setDescription('Post or update the KOS list'),

    new SlashCommandBuilder()
        .setName('submission')
        .setDescription('Set the submission channel')
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        for (const guildId of GUILD_IDS) {
            console.log(`Registering commands for guild ${guildId}...`);

            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, guildId),
                { body: commands.map(cmd => cmd.toJSON()) }
            );

            console.log(`✅ Commands registered for ${guildId}`);
        }
    } catch (error) {
        console.error('❌ Failed to register guild commands:', error);
    }
})();
