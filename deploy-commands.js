// deploy-commands.js
const { REST, Routes } = require('discord.js');
require('dotenv').config();

const commands = [
  {
    name: 'panel',
    description: 'Post or update the KOS panel',
  },
  {
    name: 'list',
    description: 'Post or update the KOS list',
  },
  {
    name: 'submission',
    description: 'Set the submission channel',
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Registering commands for new server...');

    await rest.put(
      Routes.applicationGuildCommands(process.env.1470922510496436378, process.env.1412818267910705225),
      { body: commands }
    );

    console.log('Commands registered successfully!');
  } catch (err) {
    console.error(err);
  }
})();
