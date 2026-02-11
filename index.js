client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!isOwner(interaction.user.id)) return interaction.reply({ content: "Unauthorized.", ephemeral: true });

  if (interaction.commandName === "panel") {
    const embed = new EmbedBuilder()
      .setTitle("KOS Submission System")
      .setColor(0xFF0000) // red sidebar
      .setDescription(
`This bot organizes LBG players and clans onto the KOS list for YX members.

**Players**
* To add players, use the command ^kos add or ^ka
* When adding players, place the name before the username
Example:
^kos add poison poisonrebuild
^ka poison poisonrebuild
* To remove players, use the command ^kos remove or ^kr
* Removing players follows the same format as adding them
Example:
^kos remove poison poisonrebuild
^kr poison poisonrebuild

**Clans**
* To add clans, use the command ^kos clan add or ^kca
* When adding clans, place the name before the region and use the short region code
Example:
^kos clan add yx eu
^kca yx eu
* To remove clans, use the command ^kos clan remove or ^kcr
* Removing clans follows the same format as adding them
Example:
^kos clan remove yx eu
^kcr yx eu

Thank you for being a part of YX!`
      );

    await interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "submission") {
    await interaction.deferReply({ ephemeral: false });
    data.submissionChannelId = interaction.channelId;
    saveData();
    await interaction.editReply({ content: `Submission channel set to <#${interaction.channelId}>` });
  }

  if (interaction.commandName === "list") {
    await interaction.deferReply({ ephemeral: false });
    data.listChannelId = interaction.channelId;
    saveData();
    await updateListMessages(interaction.channel);
    await interaction.editReply({ content: `KOS list posted in <#${interaction.channelId}>` });
  }
});
