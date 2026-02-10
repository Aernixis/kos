const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "data.json");
let data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

function saveData() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function renderList() {
  let output = [];

  // HEADER
  output.push("Kos :\n");
  output.push("Name : Username\n");

  // PLAYERS
  const players = [...data.players].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  for (const p of players) {
    if (p.username && p.username.trim() !== "") {
      output.push(`${p.name} : ${p.username}`);
    } else {
      output.push(p.name);
    }
  }

  // CLANS
  output.push("\n–––––– CLANS ––––––\n");

  const eu = [...data.clans.EU].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
  const na = [...data.clans.NA].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  for (const c of eu) output.push(`EU»${c}`);
  for (const c of na) output.push(`NA»${c}`);

  return output.join("\n");
}

async function updateListMessage(client) {
  if (!data.listChannelId || !data.listMessageId) return;

  const channel = await client.channels.fetch(data.listChannelId);
  const message = await channel.messages.fetch(data.listMessageId);

  await message.edit(renderList());
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("panel")
      .setDescription("Open the submission panel"),

    new SlashCommandBuilder()
      .setName("setlistchannel")
      .setDescription("Set the channel for the list")
      .addChannelOption(opt =>
        opt
          .setName("channel")
          .setDescription("Channel to post the list in")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  ];

  await client.application.commands.set(commands);
});

client.on("interactionCreate", async interaction => {
  // SET LIST CHANNEL
  if (interaction.isChatInputCommand() && interaction.commandName === "setlistchannel") {
    const channel = interaction.options.getChannel("channel");

    const msg = await channel.send("Initializing list...");
    data.listChannelId = channel.id;
    data.listMessageId = msg.id;
    saveData();

    await msg.edit(renderList());

    return interaction.reply({ content: "✅ List channel set.", ephemeral: true });
  }

  // PANEL
  if (interaction.isChatInputCommand() && interaction.commandName === "panel") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("submission_menu")
      .setPlaceholder("Choose submission type")
      .addOptions(
        { label: "Player", value: "player" },
        { label: "Clans", value: "clans" }
      );

    return interaction.reply({
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });
  }

  // MENU SELECTION
  if (interaction.isStringSelectMenu() && interaction.customId === "submission_menu") {
    if (interaction.values[0] === "player") {
      const modal = new ModalBuilder()
        .setCustomId("player_modal")
        .setTitle("Player Submission");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("name")
            .setLabel("Name")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("username")
            .setLabel("Username (optional)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        )
      );

      return interaction.showModal(modal);
    }

    if (interaction.values[0] === "clans") {
      const modal = new ModalBuilder()
        .setCustomId("clan_modal")
        .setTitle("Clan Submission");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("region")
            .setLabel("Region (EU or NA)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("clan")
            .setLabel("Clan Name")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      return interaction.showModal(modal);
    }
  }

  // PLAYER MODAL
  if (interaction.isModalSubmit() && interaction.customId === "player_modal") {
    const name = interaction.fields.getTextInputValue("name").trim();
    const username = interaction.fields.getTextInputValue("username").trim();

    data.players.push({ name, username });
    saveData();
    await updateListMessage(client);

    return interaction.reply({ content: "✅ Player added.", ephemeral: true });
  }

  // CLAN MODAL
  if (interaction.isModalSubmit() && interaction.customId === "clan_modal") {
    const regionRaw = interaction.fields.getTextInputValue("region").trim().toUpperCase();
    const clan = interaction.fields.getTextInputValue("clan").trim();

    if (!["EU", "NA"].includes(regionRaw)) {
      return interaction.reply({ content: "❌ Region must be EU or NA.", ephemeral: true });
    }

    data.clans[regionRaw].push(clan);
    saveData();
    await updateListMessage(client);

    return interaction.reply({ content: "✅ Clan added.", ephemeral: true });
  }
});

client.login(process.env.BOT_TOKEN);

