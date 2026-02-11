const { Client, GatewayIntentBits, Partials, ChannelType, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const OWNER_ID = "1283217337084018749";

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

// --- Generate messages ---
function generatePlayerMessage() {
  const playersSorted = [...data.players].sort((a,b)=>a.name.localeCompare(b.name));
  let msg = "KOS Players:\n\nName : Username\n\n";
  for(const p of playersSorted) msg += p.username ? `${p.name} : ${p.username}\n` : `${p.name}\n`;
  return msg || "No players in KOS.";
}

function generatePriorityMessage() {
  let msg = "Top Priority:\n\n";
  for(const p of data.topPriority) msg += `${p}\n`;
  return msg || "No top priority entries.";
}

function generateClanMessage() {
  let msg = "Clans:\n\n";
  const euClans = data.clans.filter(c=>c.region.toLowerCase()==="eu").sort((a,b)=>a.name.localeCompare(b.name));
  const naClans = data.clans.filter(c=>c.region.toLowerCase()==="na").sort((a,b)=>a.name.localeCompare(b.name));
  for(const c of euClans) msg += `EU » ${c.name}\n`;
  for(const c of naClans) msg += `NA » ${c.name}\n`;
  return msg || "No clans in KOS.";
}

// --- Update messages in list channel ---
async function updateListMessages() {
  if(!data.listChannelId) return;
  const channel = await client.channels.fetch(data.listChannelId).catch(()=>null);
  if(!channel || channel.type !== ChannelType.GuildText) return;

  await updateMessage(channel, generatePlayerMessage(), "playerMessageId");
  await updateMessage(channel, generatePriorityMessage(), "priorityMessageId");
  await updateMessage(channel, generateClanMessage(), "clanMessageId");
}

// --- Helper to edit or send message ---
async function updateMessage(channel, content, messageIdKey) {
  if(!channel) return;
  let message;
  if(data[messageIdKey]){
    try { message = await channel.messages.fetch(data[messageIdKey]); }
    catch { data[messageIdKey] = null; }
  }
  if(message) await message.edit(content);
  else {
    message = await channel.send(content);
    data[messageIdKey] = message.id;
  }
  saveData();
}

// --- Register commands ---
async function registerCommands(){
  const commands = [
    new SlashCommandBuilder().setName("panel").setDescription("Shows the KOS panel"),
    new SlashCommandBuilder()
      .setName("submission")
      .setDescription("Sets the submission channel")
      .addChannelOption(o=>o.setName("channel").setDescription("Text channel for submissions").setRequired(true)),
    new SlashCommandBuilder()
      .setName("list")
      .setDescription("Sets the list channel for KOS")
      .addChannelOption(o=>o.setName("channel").setDescription("Text channel for KOS list").setRequired(true))
  ].map(c=>c.toJSON());

  const rest = new REST({ version:"10" }).setToken(TOKEN);
  try{
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("Slash commands registered!");
  } catch(err){ console.error(err); }
}

// --- Interaction handler ---
client.on("interactionCreate", async interaction => {
  if(!interaction.isChatInputCommand()) return;
  if(!isOwner(interaction.user.id)) return interaction.reply({ content:"You cannot use this command.", ephemeral:true });

  const { commandName } = interaction;

  try {
    if(commandName === "panel"){
      const embed = new EmbedBuilder()
        .setTitle("KOS Submission System")
        .setDescription("This bot organizes submissions for YX players and clans onto the KOS list.")
        .addFields(
          {
            name: "Players",
            value: "• To add players, use the command `^kos add` or `^ka`\n• When adding players, place the name before the username\nExample:\n^kos add poison poisonrebuild\n^ka poison poisonrebuild\n\n• To remove players, use the command `^kos remove` or `^kr`\n• Removing players follows the same format as adding them\nExample:\n^kos remove poison poisonrebuild\n^kr poison poisonrebuild"
          },
          {
            name: "Clans",
            value: "• To add clans, use the command `^kos clan add` or `^kca`\n• When adding clans, place the name before the region and use the short region code\nExample:\n^kos clan add yx eu\n^kca yx eu\n\n• To remove clans, use the command `^kos clan remove` or `^kcr`\n• Removing clans follows the same format as adding them\nExample:\n^kos clan remove yx eu\n^kcr yx eu"
          },
          { name: "Thanks", value: "Thank you for being a part of YX!" }
        )
        .setColor(0xff0000)
        .setFooter({ text: "KOS System by shadd/aren" });

      return interaction.reply({ embeds:[embed], ephemeral:true });
    }

    if(commandName === "submission"){
      const channel = interaction.options.getChannel("channel");
      if(!channel || channel.type!==ChannelType.GuildText)
        return interaction.reply({ content:"Invalid channel.", ephemeral:true });

      data.submissionChannelId = channel.id;
      saveData();
      return interaction.reply({ content:`✅ Submission channel set to ${channel.name}`, ephemeral:true });
    }

    if(commandName === "list"){
      const channel = interaction.options.getChannel("channel");
      if(!channel || channel.type!==ChannelType.GuildText)
        return interaction.reply({ content:"Invalid channel.", ephemeral:true });

      data.listChannelId = channel.id;
      saveData();
      await updateListMessages();
      return interaction.reply({ content:`✅ List channel set to ${channel.name} and KOS list posted!`, ephemeral:true });
    }

  } catch(err){
    console.error(err);
    if(!interaction.replied && !interaction.deferred) interaction.reply({ content:"❌ An error occurred.", ephemeral:true });
  }
});

// --- Ready ---
client.once("ready", () => console.log(`Logged in as ${client.user.tag}`));

// --- Start bot ---
(async () => {
  await registerCommands();
  client.login(TOKEN);
})();
