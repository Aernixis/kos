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
  listMessageId: null,
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

// --- Generate KOS ---
function generateKosMessage() {
  const playersSorted = [...data.players].sort((a,b)=>a.name.localeCompare(b.name));
  let msg = "Kos :\n\nName : Username\n\n";
  for(const p of playersSorted) msg += p.username ? `${p.name} : ${p.username}\n` : `${p.name}\n`;
  msg += "\n------TOP PRIORITY------\n\n";
  for(const p of data.topPriority) msg += `${p}\n`;
  msg += "\n–––––– CLANS ––––––\n\n";
  const euClans = data.clans.filter(c=>c.region.toLowerCase()==="eu").sort((a,b)=>a.name.localeCompare(b.name));
  const naClans = data.clans.filter(c=>c.region.toLowerCase()==="na").sort((a,b)=>a.name.localeCompare(b.name));
  for(const c of euClans) msg += `EU»${c.name}\n`;
  for(const c of naClans) msg += `NA»${c.name}\n`;
  msg += "\n-# ontop all of these i expect every clan member to be treated the same kos way\n";
  msg += "-# creds (shadd/aren)";
  return msg;
}

// --- Update KOS list ---
async function updateListMessage() {
  if(!data.listChannelId) return;
  try {
    const channel = await client.channels.fetch(data.listChannelId);
    if(!channel || channel.type !== ChannelType.GuildText) return;
    const msgContent = generateKosMessage();
    const chunks = [];
    const chunkSize = 1990;
    for(let i=0;i<msgContent.length;i+=chunkSize) chunks.push(msgContent.slice(i,i+chunkSize));

    let firstMessage;
    if(data.listMessageId){
      try { firstMessage = await channel.messages.fetch(data.listMessageId); } catch {}
    }
    if(firstMessage){ await firstMessage.edit(chunks.shift()); }
    else { firstMessage = await channel.send(chunks.shift()); data.listMessageId = firstMessage.id; }

    for(const chunk of chunks) await channel.send(chunk);
    saveData();
  } catch(err){ console.error("Failed to update KOS list:", err); }
}

// --- Register commands ---
async function registerCommands(){
  const commands = [
    new SlashCommandBuilder().setName("panel").setDescription("Shows the KOS panel"),
    new SlashCommandBuilder()
      .setName("list")
      .setDescription("Sets the KOS list channel")
      .addChannelOption(o=>o.setName("channel").setDescription("Text channel for the list").setRequired(true)),
    new SlashCommandBuilder()
      .setName("submission")
      .setDescription("Sets the submission channel")
      .addChannelOption(o=>o.setName("channel").setDescription("Text channel for submissions").setRequired(true))
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
  if(!isOwner(interaction.user.id)) return interaction.reply({ content:"You cannot use this command.", flags:64 });

  const { commandName } = interaction;
  try {
    if(commandName==="panel"){
      const embed = new EmbedBuilder()
        .setTitle("KOS Submission System")
        .setDescription("This bot organizes submissions for YX players and clans onto the KOS list, keeping everything tracked efficiently.")
        .addFields(
          { name:"Players", value:"• To add players, use `^kos add` or `^ka`\n• Place the name before the username\nExample:\n^kos add poison poisonrebuild\n^ka poison poisonrebuild" },
          { name:"Clans", value:"• To add clans, use `^kos clan add` or `^kca`\n• Place the name before the region using the short region code\nExample:\n^kos clan add yx eu\n^kca yx eu" },
          { name:"Notes", value:"Follow the instructions carefully to avoid duplicates." }
        )
        .setColor(0xff0000)
        .setFooter({ text:"KOS System by shadd/aren" });
      return interaction.reply({ embeds:[embed], flags:64 });
    }

    if(commandName==="list"){
      const channel = interaction.options.getChannel("channel");
      if(!channel || channel.type!==ChannelType.GuildText) return interaction.reply({ content:"Invalid channel.", flags:64 });
      data.listChannelId = channel.id;
      saveData();
      await interaction.deferReply({ flags:64 });
      updateListMessage();
      return interaction.editReply({ content:`✅ List channel set to ${channel.name} and KOS list posted!` });
    }

    if(commandName==="submission"){
      const channel = interaction.options.getChannel("channel");
      if(!channel || channel.type!==ChannelType.GuildText) return interaction.reply({ content:"Invalid channel.", flags:64 });
      data.submissionChannelId = channel.id;
      saveData();
      return interaction.reply({ content:`✅ Submission channel set to ${channel.name}`, flags:64 });
    }
  } catch(err){
    console.error(err);
    if(!interaction.replied && !interaction.deferred) interaction.reply({ content:"❌ An error occurred.", flags:64 });
  }
});

// --- Ready ---
client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
  updateListMessage();
});

// --- Start bot ---
(async () => {
  await registerCommands();
  client.login(TOKEN);
})();
