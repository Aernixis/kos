const { 
  Client, GatewayIntentBits, Partials, 
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  StringSelectMenuBuilder, Routes
} = require('discord.js');
const fs = require('fs');
const { REST } = require('@discordjs/rest');
const express = require('express');

const allowedUserId = '1283217337084018749'; // only this ID can run panel and setlistchannel

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ---------- Load or create data.json ----------
let data = { listChannelId: null, players: [], clans: [] };
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
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Select a channel')
      .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post the submission panel')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
});

// ---------- EVENT HANDLER ----------
client.on('interactionCreate', async interaction => {

  // ---------- Slash Commands ----------
  if (interaction.isChatInputCommand()) {

    // --- SET LIST CHANNEL ---
    if (interaction.commandName === 'setlistchannel') {
      if (interaction.user.id !== allowedUserId) return interaction.reply({ content: '❌ You cannot run this command.', ephemeral: true });

      const channel = interaction.options.getChannel('channel');
      try {
        data.listChannelId = channel.id;
        fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));

        await interaction.reply({ content: `✅ List channel set to ${channel}`, ephemeral: true });

        // Update list immediately
        updateList();
      } catch (err) {
        console.error(err);
        if (!interaction.replied)
          await interaction.reply({ content: '❌ Error setting channel.', ephemeral: true });
      }
    }

    // --- PANEL ---
    if (interaction.commandName === 'panel') {
      if (interaction.user.id !== allowedUserId) return interaction.reply({ content: '❌ You cannot run this command.', ephemeral: true });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('submitType')
        .setPlaceholder('Select Player or Clan')
        .addOptions([
          { label: 'Player', value: 'player' },
          { label: 'Clan', value: 'clan' }
        ]);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.reply({
        content: '📋 Submission Panel - choose Player or Clan:',
        components: [row],
        ephemeral: false
      });
    }
  }

  // ---------- Dropdown Selections ----------
  if (interaction.isStringSelectMenu() && interaction.customId === 'submitType') {
    const choice = interaction.values[0];

    if (choice === 'player') {
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

    if (choice === 'clan') {
      const modal = new ModalBuilder()
        .setCustomId('clanModal')
        .setTitle('Submit Clan');

      const regionInput = new TextInputBuilder()
        .setCustomId('region')
        .setLabel('Region (EU or NA)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const nameInput = new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Clan Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(regionInput),
        new ActionRowBuilder().addComponents(nameInput)
      );

      await interaction.showModal(modal);
    }
  }

  // ---------- Modal Submissions ----------
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'playerModal') {
      const name = interaction.fields.getTextInputValue('name');
      const username = interaction.fields.getTextInputValue('username');

      data.players.push({ name, username });
      data.players.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

      fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));

      await interaction.reply({ content: `✅ Added ${name} : ${username} to the list!`, ephemeral: true });
      updateList();
    }

    if (interaction.customId === 'clanModal') {
      const region = interaction.fields.getTextInputValue('region').toUpperCase();
      const name = interaction.fields.getTextInputValue('name');

      data.clans.push({ region, name });

      // Sort: EU first, then NA, each alphabetically
      data.clans.sort((a, b) => {
        if (a.region !== b.region) return a.region === 'EU' ? -1 : 1;
        return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
      });

      fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));

      await interaction.reply({ content: `✅ Added clan ${name} (${region})!`, ephemeral: true });
      updateList();
    }
  }

});

// ---------- Function to update list ----------
async function updateList() {
  if (!data.listChannelId) return;

  const channel = await client.channels.fetch(data.listChannelId).catch(() => null);
  if (!channel) return;

  let listContent = '**Players:**\n';
  data.players.forEach(p => {
    listContent += `${p.name} : ${p.username}\n`;
  });

  listContent += '\n**Clans:**\n';
  data.clans.forEach(c => {
    listContent += `${c.region} » ${c.name}\n`;
  });

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

// ---------- Express server for uptime ----------
const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('Web server running on port 3000'));

// ---------- Login ----------
client.login(process.env.BOT_TOKEN);
