const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  InteractionType,
} = require("discord.js");
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const PREFIX = "^";
const OWNER_IDS = ["1283217337084018749"];

const dataFile = "./data.json";

if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(
    dataFile,
    JSON.stringify(
      {
        submissionChannel: null,
        listChannel: null,
        players: [],
        clans: [],
        audit: [],
      },
      null,
      2
    )
  );
}

const load = () => JSON.parse(fs.readFileSync(dataFile));
const save = (d) => fs.writeFileSync(dataFile, JSON.stringify(d, null, 2));

const isOwner = (id) => OWNER_IDS.includes(id);

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

/* ---------------- MESSAGE COMMANDS ---------------- */

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const data = load();
  const args = message.content.slice(1).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  /* OWNER COMMANDS */

  if (cmd === "submissions") {
    if (!isOwner(message.author.id)) return;
    data.submissionChannel = message.channel.id;
    save(data);
    return message.reply({
      content: `✅ Submission channel set to **${message.channel.name}**`,
      ephemeral: true,
    });
  }

  if (cmd === "list") {
    if (!isOwner(message.author.id)) return;
    data.listChannel = message.channel.id;
    save(data);
    await updateList(message.guild);
    return message.reply(
      `✅ List channel set to **${message.channel.name}**`
    );
  }

  /* LOCK SUBMISSION CHANNEL */

  if (data.submissionChannel && message.channel.id !== data.submissionChannel)
    return;

  /* -------- KOS COMMANDS -------- */

  if (cmd !== "kos" && !["ka", "kr", "kca", "kcr"].includes(cmd)) return;

  const isClan =
    args[0] === "clan" || ["kca", "kcr"].includes(cmd) ? true : false;

  const action =
    cmd === "kr" || cmd === "kcr" || args[1] === "remove" ? "remove" : "add";

  const name = args.slice(isClan ? 2 : 1).join(" ").toLowerCase();
  if (!name) return;

  const list = isClan ? data.clans : data.players;

  /* REMOVE */

  if (action === "remove") {
    if (!list.includes(name))
      return message.reply("This player is not on the KOS list.");

    list.splice(list.indexOf(name), 1);
    data.audit.push({
      action: "remove",
      type: isClan ? "clan" : "player",
      name,
      by: message.author.tag,
      time: Date.now(),
    });

    save(data);
    await updateList(message.guild);
    return message.reply(
      `✅ Removed **${name}** from the KOS list.`
    );
  }

  /* ADD WITH RETRY */

  let added = false;

  for (let i = 0; i < 3; i++) {
    if (!list.includes(name)) {
      list.push(name);
      list.sort();
      save(data);
    }

    if (list.includes(name)) {
      added = true;
      break;
    }
  }

  if (!added) {
    return message.reply(
      `<@${message.author.id}> Unable to add the ${
        isClan ? "clan" : "player"
      }. Please try again later.`
    );
  }

  data.audit.push({
    action: "add",
    type: isClan ? "clan" : "player",
    name,
    by: message.author.tag,
    time: Date.now(),
  });

  save(data);
  await updateList(message.guild);
  await message.delete();
});

/* ---------------- LIST UPDATE ---------------- */

async function updateList(guild) {
  const data = load();
  if (!data.listChannel) return;

  const channel = guild.channels.cache.get(data.listChannel);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle("KOS List")
    .setDescription(
      `**Players**\n${
        data.players.length ? data.players.join("\n") : "None"
      }\n\n**Clans**\n${
        data.clans.length ? data.clans.join("\n") : "None"
      }`
    );

  const msgs = await channel.messages.fetch({ limit: 5 });
  await channel.bulkDelete(msgs);

  await channel.send({ embeds: [embed] });
}

client.login(process.env.TOKEN);
