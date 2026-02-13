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
const PRIORITY_ROLE_ID = '1412837397607092405';
const DATA_FILE = './data.json';

let kosData = {
    players: [],
    priority: [],
    clans: [],
    panel: { gif: null, tutorial: null },
    list: { channelId: null, players: null, priority: null, clans: null }
};

if (fs.existsSync(DATA_FILE)) {
    kosData = JSON.parse(fs.readFileSync(DATA_FILE));
}

const save = () => fs.writeFileSync(DATA_FILE, JSON.stringify(kosData, null, 2));
const norm = s => s.toLowerCase();

const replyLock = new Set();

/* ===================== FORMAT ===================== */

const fmtPlayer = p => p.username ? `${p.name} : ${p.username}` : p.name;

const formatPlayers = () =>
    kosData.players
        .filter(p => !kosData.priority.includes(norm(p.name)))
        .sort((a,b)=>a.name.localeCompare(b.name))
        .map(fmtPlayer).join('\n') || 'None';

const formatPriority = () =>
    kosData.priority
        .map(n => kosData.players.find(p=>norm(p.name)===n))
        .filter(Boolean)
        .map(fmtPlayer)
        .sort().join('\n') || 'None';

const formatClans = () =>
    kosData.clans.map(c=>c.clan).sort().join('\n') || 'None';

/* ===================== HARD MESSAGE CONTROL ===================== */

async function ensureSingleMessage(channel, storedId, content) {
    const messages = await channel.messages.fetch({ limit: 50 });
    const matches = messages.filter(m => m.content === content);

    for (const m of matches.values()) {
        if (m.id !== storedId) await m.delete().catch(()=>{});
    }

    if (storedId) {
        const msg = await channel.messages.fetch(storedId).catch(()=>null);
        if (msg) {
            await msg.edit(content);
            return msg.id;
        }
    }

    const msg = await channel.send(content);
    return msg.id;
}

async function updateList(channel) {
    kosData.list.channelId = channel.id;

    kosData.list.players = await ensureSingleMessage(
        channel,
        kosData.list.players,
        `\`\`\`\n–––––––– PLAYERS ––––––\n${formatPlayers()}\n\`\`\``
    );

    kosData.list.priority = await ensureSingleMessage(
        channel,
        kosData.list.priority,
        `\`\`\`\n–––––––– PRIORITY ––––––\n${formatPriority()}\n\`\`\``
    );

    kosData.list.clans = await ensureSingleMessage(
        channel,
        kosData.list.clans,
        `\`\`\`\n–––––––– CLANS ––––––\n${formatClans()}\n\`\`\``
    );

    save();
}

async function updatePanel(channel) {
    const gif = new EmbedBuilder()
        .setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExc2FoODRjMmVtNmhncjkyZzY0ZGVwa2l3dzV0M3UyYmZ4bjVsZ2pnOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/iuttaLUMRLWEgJKRHx/giphy.gif')
        .setColor(0xFF0000);

    const tutorial = new EmbedBuilder()
        .setTitle('KOS Submission System')
        .setColor(0xFF0000)
        .setDescription(`
This bot organizes LBG players and clans onto the KOS list for YX members.

Players
To add players, use ^kos add or ^ka
^ka poison poisonrebuild
To remove players, use ^kos remove or ^kr

Clans
To add clans, use ^kos clan add or ^kca
^kca yx eu
To remove clans, use ^kos clan remove or ^kcr

Thank you for being a part of YX!
        `);

    async function embedOnce(id, embed) {
        if (id) {
            const msg = await channel.messages.fetch(id).catch(()=>null);
            if (msg) {
                await msg.edit({ embeds:[embed] });
                return msg.id;
            }
        }
        const msg = await channel.send({ embeds:[embed] });
        return msg.id;
    }

    kosData.panel.gif = await embedOnce(kosData.panel.gif, gif);
    kosData.panel.tutorial = await embedOnce(kosData.panel.tutorial, tutorial);
    save();
}

/* ===================== PREFIX COMMANDS ===================== */

client.on('messageCreate', async msg => {
    if (msg.author.bot || !msg.content.startsWith('^')) return;
    if (replyLock.has(msg.id)) return;
    replyLock.add(msg.id);

    const p = msg.content.split(/\s+/);
    const cmd = p[0].toLowerCase();

    const reply = async t => {
        const m = await msg.channel.send(`<@${msg.author.id}> ${t}`);
        setTimeout(()=>{ m.delete().catch(()=>{}); msg.delete().catch(()=>{}); },3000);
    };

    if (cmd === '^ka') {
        const [_, name, user] = p;
        if (!name || !user) return reply('Name and username required.');
        kosData.players.push({ name, username:user, by:msg.author.id });
        save();
        if (kosData.list.channelId) {
            const ch = await client.channels.fetch(kosData.list.channelId);
            await updateList(ch);
        }
        return reply(`Added ${name}`);
    }

    if (cmd === '^kr') {
        const name = p[1];
        if (!name) return reply('Name required.');
        kosData.players = kosData.players.filter(p=>norm(p.name)!==norm(name));
        kosData.priority = kosData.priority.filter(n=>n!==norm(name));
        save();
        const ch = await client.channels.fetch(kosData.list.channelId);
        await updateList(ch);
        return reply(`Removed ${name}`);
    }
});

/* ===================== SLASH ===================== */

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
        kosData.list.channelId = i.channelId;
        save();
        return i.editReply(`Submission channel set.`);
    }
});

client.once('ready',()=>console.log(`Logged in as ${client.user.tag}`));
client.login(process.env.TOKEN);
