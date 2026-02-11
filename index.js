const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  REST,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");
const fs = require("fs");

require("dotenv").config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const DATA_FILE = "./data.json";
const STAFF_ROLE_ID = "1412837397607092405";

/* -------------------- DATA -------------------- */

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* -------------------- EMBEDS -------------------- */

function panelEmbed() {
  return new EmbedBuilder()
    .setTitle("KOS Submission System")
    .setColor(0xff0000)
    .setDescription(
`This bot organizes submissions for YX players and clans onto the KOS list.

**Players**
• To add players, use \`^kos add\` or \`^ka\`
• When adding players, place the name before the username

Example:
\`^kos add poison poisonrebuild\`
\`^ka poison poisonrebuild\`

• To remove players, use \`^kos remove\` or \`^kr\`

**Clans**
• To add clans, use \`^kos clan add\` or \`^kca\`
• Place the name before the region (short code)

Example:
\`^kos clan add yx eu\`
\`^kca yx eu\`

• To remove clans, use \`^kos clan remove\` or \`^kcr\`

Thank you for being apart of YX!`
    );
}

function listEmbed(title, items, formatter) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(0xff0000)
    .setDescription(
      items.length
        ? items.map(formatter).join("\n")
        : "*No entries*"
    );
}

/* -------------------- LIST UPDATES -------------------- */

async function updateLists(guild) {
  const data = loadData();
  if (!data.listChannel) return;

  const channel = await guild.channels.fetch(data.listChannel);

  async function upsertMessage(key, embed) {
    if (data.messages[key]) {
      const msg = await channel.messages.fetch(data.messages[key]);
      await msg.edit({ embeds: [embed] });
    } else {
      const msg = await channel.send({ embeds: [embed] });
      data.messages[key] = msg.id;
    }
  }

  data.players.sort((a, b) => a.name.localeCompare(b.name));
  data.clans.sort((a, b) => a.name.localeCompare(b.name));

  await upsertMessage(
    "players",
    listEmbed(
      "KOS List – Players",
      data.players,
      p => `• **${p.name}** (${p.username})`
    )
  );

  await upsertMessage(
    "priority",
    listEmbed(
      "KOS List – Priority",
      data.priority,
      p => `• **${p.name}** (${p.username})`
    )
  );

  await upsertMessage(
    "clans",
    listEmbed(
      "KOS List – Clans",
      data.clans,
      c => `• **${c.name.toUpperCase()}** [${c.region.toUpperCase()}]`
    )
  );

  saveData(data);
}

/* -------------------- COMMANDS -------------------- */

const commands = [
  new SlashCommandBuilder()
    .setName("submission")
    .setDescription("Set the submission channel")
    .addChannelOption(o =>
      o.setName("channel").setDescription("Channel").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("list")
    .setDescription("Set the list channel and post the KOS list")
    .addChannelOption(o =>
      o.setName("channel").setDescription("Channel").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Post the KOS submission panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

/* -------------------- READY -------------------- */

client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands.map(c => c.toJSON()) }
  );

  console.log(`Logged in as ${client.user.tag}`);
});

/* -------------------- INTERACTIONS -------------------- */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await interaction.deferReply({ ephemeral: true });

    const data = loadData();

    if (interaction.commandName === "submission") {
      data.submissionChannel = interaction.options.getChannel("channel").id;
      saveData(data);
      return interaction.editReply("✅ Submission channel set.");
    }

    if (interaction.commandName === "list") {
      data.listChannel = interaction.options.getChannel("channel").id;
      data.messages = { players: null, priority: null, clans: null };
      saveData(data);
      await updateLists(interaction.guild);
      return interaction.editReply("✅ List channel set and lists posted.");
    }

    if (interaction.commandName === "panel") {
      await interaction.channel.send({ embeds: [panelEmbed()] });
      return interaction.editReply("✅ Panel posted.");
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied)
      await interaction.editReply("❌ An error occurred.");
  }
});

client.login(process.env.TOKEN);
