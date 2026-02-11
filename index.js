client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!isOwner(interaction.user.id))
    return interaction.reply({ content:"You cannot use this command.", flags:64 });

  const { commandName } = interaction;

  try {
    if (commandName === "list") {
      const channel = interaction.options.getChannel("channel");
      if (!channel || channel.type !== ChannelType.GuildText)
        return interaction.reply({ content:"Invalid channel", flags:64 });

      data.listChannelId = channel.id;
      saveData();

      // Defer reply because posting list may take time
      await interaction.deferReply({ ephemeral: true });

      // Immediately post KOS list, split if too long
      const msgContent = generateKosMessage();
      const messages = [];
      const chunkSize = 1990; // safe under Discord limit
      for (let i = 0; i < msgContent.length; i += chunkSize) {
        messages.push(msgContent.slice(i, i + chunkSize));
      }

      const targetChannel = await client.channels.fetch(data.listChannelId);
      if (!targetChannel || targetChannel.type !== ChannelType.GuildText)
        return interaction.editReply({ content: "Failed to fetch the list channel." });

      for (const msg of messages) {
        const sent = await targetChannel.send(msg);
        if (!data.listMessageId) data.listMessageId = sent.id; // first message
      }
      saveData();

      await interaction.editReply({ content: `✅ List channel set to ${channel.name} and KOS list posted!` });

    } else if (commandName === "submission") {
      const channel = interaction.options.getChannel("channel");
      if (!channel || channel.type !== ChannelType.GuildText)
        return interaction.reply({ content:"Invalid channel", flags:64 });

      data.submissionChannelId = channel.id;
      saveData();

      // Immediate reply to prevent timeout
      interaction.reply({ content:`✅ Submission channel set to ${channel.name}`, flags:64 });

    } else if (commandName === "panel") {
      const embed = new EmbedBuilder()
        .setTitle("KOS Submission System")
        .setDescription("This bot organizes submissions for YX players and clans onto the KOS list, keeping everything tracked efficiently.")
        .addFields(
          { name: "Players", value: "• To add players, use `^kos add` or `^ka`\n• Place the name before the username\nExample:\n^kos add poison poisonrebuild\n^ka poison poisonrebuild" },
          { name: "Clans", value: "• To add clans, use `^kos clan add` or `^kca`\n• Place the name before the region using the short region code\nExample:\n^kos clan add yx eu\n^kca yx eu" },
          { name: "Notes", value: "Follow the instructions carefully to avoid duplicates." }
        )
        .setColor(0xff0000)
        .setFooter({ text: "KOS System by shadd/aren" });

      interaction.reply({ embeds:[embed], flags:64 });
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({ content:"❌ An error occurred", flags:64 });
    }
  }
});
