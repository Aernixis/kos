require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

const OWNER_ID = '1283217337084018749';
const DATA_FILE = './data.json';

/* ===================== LOAD DATA WITH SAFE DEFAULTS ===================== */
let data = {
    players: [],
    priority: [],
    clans: [],
    panel: { gif: null, tutorial: null },
    list: { channelId: null, players: null, priority: null, clans: null }
};

if (fs.existsSync(DATA_FILE)) {
    try {
        const loaded = JSON.parse(fs.readFileSync(DATA_FILE));
        data.players = loaded.players || [];
        data.priority = loaded.priority || [];
        data.clans = loaded.clans || [];
        data.panel = loaded.panel || { gif: null, tutorial: null };
        data.list = loaded.list || { channelId: null, players: null, priority: null, clans: null };
    } catch(e) {
        console.error('Failed to load data.json, using defaults', e);
    }
}

const save = () => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
const norm = s => s.toLowerCase();

/* ===================== FORMAT ===================== */
const fmt = p => p.username ? `${p.name} : ${p.username}` : p.name;

const playersText = () =>
    data.players
        .filter(p => !data.priority.includes(norm(p.name)))
        .sort((a,b)=>a.name.localeCompare(b.name))
        .map(fmt).join('\n') || 'None';

const priorityText = () =>
    data.priority
        .map(n => data.players.find(p=>norm(p.name)===n))
        .filter(Boolean)
        .map(fmt)
        .sort().join('\n') || 'None';

const clansText = () =>
    data.clans.map(c=>`${c.clan} ${c.region || ''}`.trim()).sort().join('\n') || 'None';

/* ===================== MESSAGE CONTROL ===================== */
async function editOrCreate(channel, id, payload) {
    if (id) {
        const msg = await channel.messages.fetch(id).catch(()=>null);
        if (msg) {
            await msg.edit(payload);
            return msg.id;
        }
    }
    const msg = await channel.send(payload);
    return msg.id;
}

async function updateList(channel) {
    if (!channel) return;

    data.list.channelId = channel.id;

    data.list.players = await editOrCreate(
        channel,
        data.list.players,
        { content: `\`\`\`\n–––––– PLAYERS ––––––\n${playersText()}\n\`\`\`` }
    );

    data.list.priority = await editOrCreate(
        channel,
        data.list.priority,
        { content: `\`\`\`\n–––––– PRIORITY ––––––\n${priorityText()}\n\`\`\`` }
    );

    data.list.clans = await editOrCreate(
        channel,
        data.list.clans,
        { content: `\`\`\`\n–––––– CLANS ––––––\n${clansText()}\n\`\`\`` }
    );

    save();
}

/* ===================== PANEL ===================== */
async function updatePanel(channel) {
    if (!channel) return;

    const gif = new EmbedBuilder()
        .setColor(0xFF0000)
        .setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExc2FoODRjMmVtNmhncjkyZzY0ZGVwa2l3dzV0M3UyYmZ4bjVsZ2pnOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/iuttaLUMRLWEgJKRHx/giphy.gif');

    const tutorial = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('KOS Submission System')
        .setDescription(`
This bot organizes LBG players and clans onto the KOS list for YX members.

Players
To add players, use the command ^kos add or ^ka
When adding players, place the name before the username
Example:
^kos add poison poisonrebuild
^ka poison poisonrebuild
To remove players, use the command ^kos remove or ^kr
Removing players follows the same format as adding them
Example:
^kos remove poison poisonrebuild
^kr poison poisonrebuild

Clans
To add clans, use the command ^kos clan add or ^kca
When adding clans, place the name before the region and use the short region code
Example:
^kos clan add yx eu
^kca yx eu
To remove clans, use the command ^kos clan remove or ^kcr
Removing clans follows the same format as adding them
Example:
^kos clan remove yx eu
^kcr yx eu

Thank you for being apart of YX!
        `);

    data.panel.gif = await editOrCreate(channel, data.panel.gif, { embeds:[gif] });
    data.panel.tutorial = await editOrCreate(channel, data.panel.tutorial, { embeds:[tutorial] });

    save();
}

/* ===================== PREFIX COMMANDS ===================== */
client.on('messageCreate', async msg => {
    if (msg.author.bot || !msg.content.startsWith('^')) return;

    const args = msg.content.split(/\s+/);
    const cmd = args[0].toLowerCase();

    const respond = async text => {
        const m = await msg.channel.send(`<@${msg.author.id}> ${text}`);
        setTimeout(()=>{ m.delete().catch(()=>{}); msg.delete().catch(()=>{}); },3000);
    };

    if (cmd === '^ka') {
        const [_, name, username] = args;
        if (!name || !username) return respond('Name and username required.');

        if (data.players.some(p=>norm(p.name)===norm(name) && p.username===username))
            return respond('That player already exists.');

        data.players.push({ name, username });
        save();

        if (data.list.channelId) {
            const ch = await client.channels.fetch(data.list.channelId);
            await updateList(ch);
        }
        return respond(`Added ${name}`);
    }

    if (cmd === '^kr') {
        const name = args[1];
        if (!name) return respond('Name required.');

        data.players = data.players.filter(p=>norm(p.name)!==norm(name));
        data.priority = data.priority.filter(n=>n!==norm(name));
        save();

        if (data.list.channelId) {
            const ch = await client.channels.fetch(data.list.channelId);
            await updateList(ch);
        }
        return respond(`Removed ${name}`);
    }
});

/* ===================== SLASH COMMANDS ===================== */
client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand() || i.user.id !== OWNER_ID) return;

    await i.deferReply({ ephemeral:true });

    if (i.commandName === 'panel') {
        await updatePanel(i.channel);
        return i.editReply('Panel updated.');
    }

    if (i.commandName === 'list') {
        await updateList(i.channel);
        return i.editReply('KOS list updated.');
    }

    if (i.commandName === 'submission') {
        data.list.channelId = i.channelId;
        save();
        return i.editReply('Submission channel set.');
    }
});

/* ===================== READY ===================== */
client.once('ready', () =>
    console.log(`Logged in as ${client.user.tag}`)
);

client.login(process.env.TOKEN);
