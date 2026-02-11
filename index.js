require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  PermissionsBitField,
  EmbedBuilder,
  ChannelType,
  InteractionResponseFlags
} = require("discord.js");
const fs = require("fs");

const OWNER_ID = "1283217337084018749";
const DATA_PATH = "./data.json";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const save = () => fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

/* ---------- HELPERS ---------- */

function isOwner(userId) {
  return userId === OWNER_ID;
}

function inSubmissionChannel(message) {
  return message.channel.id === data.submissionChannelId;
}

function sortPlayers() {
  data.players.sort((a, b) => a.name.localeCompare(b.name));
}

function sortClans() {
  const eu = data.clans.filter(c => c.region === "EU").sort((a,b)=>a.name.localeCompare(b.name));
  const na = data.clans.filter(c => c.region === "NA").sort((a,b)=>a.name.localeCompare(b.name));
  data.clans = [...eu, ...na];
}

function buildListText() {
  let text = `Kos :\n\nName : Username\n\n`;

  for (const p of data.players) {
    text += `${p.name} : ${p.username}\n`;
  }

  text += `\n–––––– CLANS ––––––\n\n`;
  for (const c of data.clans) {
    text += `${c.region}»${c.name}\n`;
  }

  text += `\n\nThank you for being apart of YX!`;
  return text;
}

async function updateListMessage(guild) {
  if (!data.listChannelId) return;
  const channel = await guild.channels.fetch(data.listChannelId).catch(()=>null);
  if (!channel) return;

  const content = buildListText();

  if (!data.listMessageId) {
    const msg = await channel.send(content);
    data.listMessageId = msg.id;
    save();
  } else {
    const msg = await channel.messages.fetch(data.listMessageId).catch(()=>null);
    if (msg) await msg.edit(content);
  }
}

/* ---------- SLASH COMMANDS ---------- */

client.once("ready", async () => {
  await client.application.commands.set([
    new SlashCommandBuilder()
      .setName("submissions")
      .setDescription("Set the submission channel")
      .addChannelOption(o =>
        o.setName("channel")
          .setDescription("Submission channel")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("list")
      .setDescription("Set the KOS list channel")
      .addChannelOption(o =>
        o.setName("channel")
          .setDescription("List channel")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("panel")
      .setDescription("Post the KOS submission panel")
  ]);
  console.log(`Logged in as ${client.user.tag}`);
});

/* ---------- INTERACTIONS ---------- */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (!isOwner(interaction.user.id)) {
    return interaction.reply({
      content: "You cannot use this command.",
      flags: InteractionResponseFlags.Ephemeral
    });
  }

  if (interaction.commandName === "submissions") {
    const ch = interaction.options.getChannel("channel");
    data.submissionChannelId = ch.id;
    save();
    return interaction.reply({
      content: `✅ Submission channel set to **${ch.name}**`,
      flags: InteractionResponseFlags.Ephemeral
    });
  }

  if (interaction.commandName === "list") {
    const ch = interaction.options.getChannel("channel");
    data.listChannelId = ch.id;
    data.listMessageId = null;
    save();
    await updateListMessage(interaction.guild);
    return interaction.reply({
      content: `✅ List channel set to **${ch.name}**`,
      flags: InteractionResponseFlags.Ephemeral
    });
  }

  if (interaction.commandName === "panel") {
    const embed = new EmbedBuilder()
      .setColor(0x1abc9c)
      .setTitle("KOS Submission System")
      .setDescription("This bot organizes submissions for YX players and clans onto the KOS list.")
      .addFields(
        {
          name: "Players",
          value:
`• Add: ^kos add / ^ka
• Remove: ^kos remove / ^kr
Example:
^ka poison poisonrebuild`
        },
        {
          name: "Clans",
          value:
`• Add: ^kos clan add / ^kca
• Remove: ^kos clan remove / ^kcr
Example:
^kca yx eu`
        }
      )
      .setFooter({ text: "Thank you for being apart of YX!" });

    return interaction.reply({ embeds: [embed] });
  }
});

/* ---------- MESSAGE COMMANDS ---------- */

client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (!inSubmissionChannel(message)) return;

  const args = message.content.trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  const isAddPlayer = cmd === "^ka" || (cmd === "^kos" && args[0] === "add");
  const isRemovePlayer = cmd === "^kr" || (cmd === "^kos" && args[0] === "remove");
  const isAddClan = cmd === "^kca" || (cmd === "^kos" && args[0] === "clan" && args[1] === "add");
  const isRemoveClan = cmd === "^kcr" || (cmd === "^kos" && args[0] === "clan" && args[1] === "remove");

  if (!(isAddPlayer || isRemovePlayer || isAddClan || isRemoveClan)) return;

  const clean = args.filter(a => !["add","remove","clan"].includes(a));

  if (clean.length < 2) {
    return message.reply({ content: "You're missing a parameter." });
  }

  /* ---------- ADD PLAYER ---------- */
  if (isAddPlayer) {
    const [name, username] = clean;

    for (let i = 0; i < 3; i++) {
      if (data.players.some(p => p.name === name && p.username === username)) {
        await message.delete();
        return;
      }
      data.players.push({ name, username, addedBy: message.author.id });
      sortPlayers();
      save();
      await updateListMessage(message.guild);
      await message.delete();
      return;
    }

    return message.channel.send(
      `<@${message.author.id}> Unable to add the **player**. Please try again later.`
    );
  }

  /* ---------- REMOVE PLAYER ---------- */
  if (isRemovePlayer) {
    const [name, username] = clean;
    const before = data.players.length;
    data.players = data.players.filter(p => !(p.name === name && p.username === username));
    if (data.players.length === before) {
      return message.reply("This player is not on the KOS list.");
    }
    save();
    await updateListMessage(message.guild);
    return message.reply("✅ Player removed.");
  }

  /* ---------- ADD CLAN ---------- */
  if (isAddClan) {
    const [name, regionRaw] = clean;
    const region = regionRaw.toUpperCase();

    for (let i = 0; i < 3; i++) {
      if (data.clans.some(c => c.name === name && c.region === region)) {
        await message.delete();
        return;
      }
      data.clans.push({ name, region, addedBy: message.author.id });
      sortClans();
      save();
      await updateListMessage(message.guild);
      await message.delete();
      return;
    }

    return message.channel.send(
      `<@${message.author.id}> Unable to add the **clan**. Please try again later.`
    );
  }

  /* ---------- REMOVE CLAN ---------- */
  if (isRemoveClan) {
    const [name, regionRaw] = clean;
    const region = regionRaw.toUpperCase();
    const before = data.clans.length;
    data.clans = data.clans.filter(c => !(c.name === name && c.region === region));
    if (data.clans.length === before) {
      return message.reply("This clan is not on the KOS list.");
    }
    save();
    await updateListMessage(message.guild);
    return message.reply("✅ Clan removed.");
  }
});

client.login(process.env.BOT_TOKEN);
