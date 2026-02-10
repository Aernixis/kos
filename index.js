const { Client, GatewayIntentBits, Partials, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, Routes } = require('discord.js');
const fs = require('fs');
const { REST } = require('@discordjs/rest');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Load or create data.json
let data = { listChannelId: null, players: [] };
if (fs.existsSync('./data.json')) {
  data = JSON.parse(fs.readFileSync('./data.json'));
} else {
  fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));
}

// ---------- REGISTER SLASH COMMANDS ----------
const commands = [
  new SlashCommandBuilder()
    .setName('setlistchannel')
    .setDescription('Set the channel where the list will be posted')
    .addChannelOption(option => option.setName('channel').setDescription('Select a channel').setRequired(true)),
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Submit a player')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationCommands(client.user?.id || 'your-client-id-here'), // will auto-fill after login
      { body: commands }
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

// ---------- EVENT HANDLER ----------
client.on('interactionCreate', async interaction => {
  // Slash command
  if (interaction.isChatInputCommand()) {

    // --------- SET LIST CHANNEL ---------
    if (interaction.commandName === 'setlistchannel') {
      const channel = interaction.options.getChannel('channel');

      try {
        data.listChannelId = channel.id;
        fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));

        await interaction.reply({ content: `✅ List channel set to ${channel}`, ephemeral: true });

        // Optionally, update the list immediately
        updateList();
      } catch (err) {
        console.error(err);
        if (!interaction.replied)
          await interaction.reply({ content: '❌ Error setting channel.', ephemeral: true });
      }
    }

    // --------- PLAYER PANEL ---------
    if (interaction.commandName === 'panel') {
      const modal = new ModalBuilder()
        .setCustomId('playerModal')
        .setTitle('Submit Player');

      const nameInput = new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const usernameInput = new TextInputBuilder()
        .setCustomId('username')
        .setLabel('Username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(usernameInput)
      );

      await interaction.showModal(modal);
    }
  }

  // --------- MODAL SUBMISSION ----------
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'playerModal') {
      const name = interaction.fields.getTextInputValue('name');
      const username = interaction.fields.getTextInputValue('username');

      // Add to list
      data.players.push({ name, username });
      // Sort alphabetically by name
      data.players.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
      fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));

      await interaction.reply({ content: `✅ Added ${name} : ${username} to the list!`, ephemeral: true });

      // Update list message
      updateList();
    }
  }
});

// ---------- FUNCTION TO UPDATE LIST ----------
async function updateList() {
  if (!data.listChannelId) return;

  const channel = await client.channels.fetch(data.listChannelId).catch(() => null);
  if (!channel) return;

  // Build the list content
  let listContent = '**Players:**\n';
  data.players.forEach(p => {
    listContent += `${p.name} : ${p.username}\n`;
  });

  // Either send a new message or edit last bot message
  let lastMessage;
  try {
    const messages = await channel.messages.fetch({ limit: 10 });
    lastMessage = messages.find(m => m.author.id === client.user.id);
  } catch {}

  if (lastMessage) {
    lastMessage.edit(listContent).catch(() => {});
  } else {
    channel.send(listContent).catch(() => {});
  }
}

// ---------- OPTIONAL: Tiny web server for UptimeRobot ----------
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('Web server running on port 3000'));

// ---------- LOGIN ----------
client.login(process.env.BOT_TOKEN);
