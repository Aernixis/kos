require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const CLIENT_ID = '1470922510496436378';
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
    .setDescription('Post or update the KOS list from the latest backup'),
  new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Delete old backup and push a fresh one to the backup channel'),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete all non-bot messages in this channel'),
  new SlashCommandBuilder()
    .setName('enable')
    .setDescription('Enable prefix (^) commands'),
  new SlashCommandBuilder()
    .setName('disable')
    .setDescription('Disable prefix (^) commands'),
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot send a message in this channel')
    .addStringOption(option =>
      option
        .setName('text')
        .setDescription('The message to send')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('setrole')
    .setDescription('Set a role that can use owner slash commands')
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('The role to grant owner permissions')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from using KOS commands')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to ban')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user from using KOS commands')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to unban')
        .setRequired(true)
    )
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
