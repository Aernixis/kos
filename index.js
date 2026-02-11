const { Client, GatewayIntentBits, Partials, ChannelType, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const OWNER_ID = "1283217337084018749";
const OVERRIDE_ROLE = "1412837397607092405"; // role that can remove anything
const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// --- Client ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

// --- Data ---
const dataPath = path.join(__dirname, "data.json");
let data = {
  submissionChannelId: null,
  listChannelId: null,
  playerMessageId: null,
  priorityMessageId: null,
  clanMessageId: null,
  players: [],
  clans: [],
  topPriority: [],
};
if (fs.existsSync(dataPath)) {
  try { data = JSON.parse(fs.readFileSync(dataPath, "utf8")); }
  catch { console.error("Failed to load data.json, using empty data"); }
}
function saveData() { fs.writeFileSync(dataPath, JSON.stringify(data, null, 2)); }
function isOwner(id) { return id === OWNER_ID; }

// --- Message generators ---
function generatePlayerMessage() {
  if (!data.players.length) return "No players in KOS.";
  const sorted = [...data.players].sort((a,b)=>a.name.localeCompare(b.name));
  return "KOS Players:\n\n" + sorted.map(p => p.username ? `${p.name} : ${p.username}` : `${p.name}`).join("\n");
}

function generatePriorityMessage() {
  if (!data.topPriority.length) return "No top priority entries.";
  return "Top Priority:\n\n" + data.topPriority.join("\n");
}

function generateClanMessage() {
  if (!data.clans.length) return "No clans in KOS.";
  const euClans = data.clans.filter(c => c.region.toLowerCase() === "eu").sort((a,b)=>a.name.localeCompare(b.name));
  const naClans = data.clans.filter(c => c.region.toLowerCase() === "na").sort((a,b)=>a.name.localeCompare(b.name));
  let msg = "Clans:\n\n";
  for (const c of euClans) msg += `EU » ${c.name}\n`;
  for (const c of naClans) msg += `NA » ${c.name}\n`;
  return msg;
}

// --- Update List Messages ---
async function updateListMessages() {
  if (!data.listChannelId) return;
  const channel = await client.channels.fetch(data.listChannelId).catch(()=>null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  await updateMessage(channel, generatePlayerMessage(), "playerMessageId");
  await updateMessage(channel, generatePriorityMessage(), "priorityMessageId");
  await updateMessage(channel, generateClanMessage(), "clanMessageId");
}

async function updateMessage(channel, content, messageIdKey) {
  let msg;
  if (data[messageIdKey]) {
    try { msg = await channel.messages.fetch(data[messageIdKey]); }
    catch { data[messageIdKey] = null; }
  }
  if (msg) await msg.edit(content);
  else {
    msg = await channel.send(content);
    data[messageIdKey] = msg.id;
  }
  saveData();
}

// --- Command Helpers ---
function addPlayer(name, username, authorId) {
  if (data.players.find(p => p.name.toLowerCase() === name.toLowerCase())) return false;
  data.players.push({ name, username, addedBy: authorId });
  data.players.sort((a,b)=>a.name.localeCompare(b.name));
  saveData();
  updateListMessages();
  return true;
}

function removePlayer(name, member) {
  const player = data.players.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (!player) return false;
  if (player.addedBy !== member.id && !member.roles.cache.has(OVERRIDE_ROLE)) return "nopermission";
  data.players = data.players.filter(p => p.name.toLowerCase() !== name.toLowerCase());
  saveData();
  updateListMessages();
  return true;
}

function addClan(name, region, authorId) {
  if (data.clans.find(c => c.name.toLowerCase() === name.toLowerCase() && c.region.toLowerCase() === region.toLowerCase())) return false;
  data.clans.push({ name, region, addedBy: authorId });
  data.clans.sort((a,b)=>a.name.localeCompare(b.name));
  saveData();
  updateListMessages();
  return true;
}

function removeClan(name, region, member) {
  const clan = data.clans.find(c => c.name.toLowerCase() === name.toLowerCase() && c.region.toLowerCase() === region.toLowerCase());
  if (!clan) return false;
  if (clan.addedBy !== member.id && !member.roles.cache.has(OVERRIDE_ROLE)) return "nopermission";
  data.clans = data.clans.filter(c => !(c.name.toLowerCase()===name.toLowerCase() && c.region.toLowerCase()===region.toLowerCase()));
  saveData();
  updateListMessages();
  return true;
}

// --- Register Commands ---
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder().setName("panel").setDescription("Shows the KOS panel"),
    new SlashCommandBuilder()
      .setName("submission")
      .setDescription("Sets the submission channel")
      .addChannelOption(o=>o.setName("channel").setDescription("Text channel for submissions").setRequired(true)),
    new SlashCommandBuilder()
      .setName("list")
      .setDescription("Sets the KOS list channel")
      .addChannelOption(o=>o.setName("channel").setDescription("Text channel for KOS list").setRequired(true))
  ].map(c=>c.toJSON());

  const rest = new REST({ version:"10" }).setToken(TOKEN);
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("Slash commands registered!");
  } catch(err) { console.error(err); }
}

// --- Interaction Handler ---
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!isOwner(interaction.user.id)) return interaction.reply({ content:"You cannot use this command.", ephemeral:true });

  const { commandName } = interaction;

  try {
    if (commandName === "panel") {
      const embed = new EmbedBuilder()
        .setTitle("KOS Submission System")
        .setDescription("This bot organizes submissions for YX players and clans onto the KOS list.")
        .addFields(
          {
            name: "Players",
            value: `To add players, use the command ^kos add or ^ka
When adding players, place the name before the username
Example:
^kos add poison poisonrebuild
^ka poison poisonrebuild

To remove players, use the command ^kos remove or ^kr
Removing players follows the same format
Example:
^kos remove poison poisonrebuild
^kr poison poisonrebuild`
          },
          {
            name: "Clans",
            value: `To add clans, use the command ^kos clan add or ^kca
Place the name before the region code
Example:
^kos clan add yx eu
^kca yx eu

To remove clans, use the command ^kos clan remove or ^kcr
Example:
^kos clan remove yx eu
^kcr yx eu`
          },
          { name: "Thanks", value: "Thank you for being a part of YX!" }
        )
        .setColor(0xff0000)
        .setFooter({ text:"KOS System by shadd/aren" });

      return interaction.reply({ embeds:[embed], ephemeral:true });
    }

    if (commandName === "submission") {
      const channel = interaction.options.getChannel("channel");
      if (!channel || channel.type !== ChannelType.GuildText) return interaction.reply({ content:"Invalid channel.", ephemeral:true });
      data.submissionChannelId = channel.id;
      saveData();
      return interaction.reply({ content:`✅ Submission channel set to ${channel.name}`, ephemeral:true });
    }

    if (commandName === "list") {
      const channel = interaction.options.getChannel("channel");
      if (!channel || channel.type !== ChannelType.GuildText) return interaction.reply({ content:"Invalid channel.", ephemeral:true });
      data.listChannelId = channel.id;
      saveData();

      await interaction.deferReply({ ephemeral:true });
      try {
        await updateListMessages();
        await interaction.editReply({ content:`✅ List channel set to ${channel.name} and KOS list posted!` });
      } catch(err) {
        console.error(err);
        if (interaction.deferred) await interaction.editReply({ content:"❌ Failed to post KOS list." });
      }
    }

  } catch(err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) interaction.reply({ content:"❌ An error occurred.", ephemeral:true });
  }
});

// --- Message Commands ---
client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (!data.submissionChannelId || message.channel.id !== data.submissionChannelId) return;

  const [cmd, ...args] = message.content.trim().split(/\s+/);

  const member = message.member;

  // Players
  if (cmd === "^kos" || cmd === "^ka") {
    const subcmd = args[0]?.toLowerCase();
    if (subcmd === "add") {
      const name = args[1];
      const username = args[2] || "";
      if (!name) return message.reply("Provide a player name.");
      if (addPlayer(name, username, message.author.id)) message.reply(`✅ Added player ${name}`);
      else message.reply("Player already exists.");
    }
    if (subcmd === "remove") {
      const name = args[1];
      if (!name) return message.reply("Provide a player name.");
      const res = removePlayer(name, member);
      if (res === true) message.reply(`✅ Removed player ${name}`);
      else if (res === "nopermission") message.reply("❌ You cannot remove this player.");
      else message.reply("Player not found.");
    }
  }

  // Clans
  if (cmd === "^kca" || cmd === "^kcr" || (cmd === "^kos" && args[0]?.toLowerCase() === "clan")) {
    const subcmd = args[1]?.toLowerCase() || args[0]?.toLowerCase(); 
    const name = args[2] || args[1];
    const region = args[3] || args[2];
    if (!name || !region) return message.reply("Provide clan name and region.");
    if (subcmd === "add" || cmd === "^kca") {
      if (addClan(name, region, message.author.id)) message.reply(`✅ Added clan ${name} (${region})`);
      else message.reply("Clan already exists.");
    }
    if (subcmd === "remove" || cmd === "^kcr") {
      const res = removeClan(name, region, member);
      if (res === true) message.reply(`✅ Removed clan ${name} (${region})`);
      else if (res === "nopermission") message.reply("❌ You cannot remove this clan.");
      else message.reply("Clan not found.");
    }
  }
});

// --- Ready ---
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  updateListMessages();
});

// --- Start ---
(async () => {
  await registerCommands();
  client.login(TOKEN);
})();
