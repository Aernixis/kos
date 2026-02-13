// ---------------- SLASH COMMANDS ----------------
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;

  try {
    // ---------------- PANEL ----------------
    if (i.commandName === 'panel') {
      await updatePanel(i.channel);
      await i.reply({ content: 'Panel updated.', ephemeral: true });
      return;
    }

    // ---------------- LIST ----------------
    if (i.commandName === 'list') {
      await updateKosList(i.channel);
      await i.reply({ content: 'KOS list updated.', ephemeral: true });
      return;
    }

    // ---------------- SUBMISSION ----------------
    if (i.commandName === 'submission') {
      // Check if submission channel is set
      if (!data.listData.channelId) {
        await i.reply({ content: 'Submission channel not set.', ephemeral: true });
        return;
      }

      // Check if used in the correct channel
      if (i.channel.id !== data.listData.channelId) {
        await i.reply({
          content: `KOS commands must be used in <#${data.listData.channelId}>.`
        });
        return;
      }

      // If used in the correct channel, just confirm (public)
      await i.reply({
        content: 'You are in the correct submission channel.'
      });
    }
  } catch (e) {
    console.error('Slash command error', e);
    if (!i.replied) await i.reply({ content: 'An error occurred.', ephemeral: true });
  }
});
