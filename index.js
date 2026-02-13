require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

// ---------------- CLIENT ----------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// ---------------- CONSTANTS ----------------
const OWNER_ID = '1283217337084018749';
const PRIORITY_ROLE_ID = '1412837397607092405';
const DATA_FILE = './data.json';

// ---------------- DATA ----------------
let kosData = {
    players: [],
    topPriority: [],
    clans: [],
    panelMessages: { gif: null, tutorial: null },
    listData: {
        channelId: null,
        playersMessageId: null,
        priorityMessageId: null,
        clansMessageId: null
    }
};

// Load existing data
if (fs.existsSync(DATA_FILE)) {
    try { kosData = JSON.parse(fs.readFileSync(DATA_FILE)); }
    catch { console.error('Failed to load data.json'); }
}

// ---------------- DATA NORMALIZATION ----------------
if (kosData.clans.length > 0 && typeof kosData.clans[0] === 'string') {
    kosData.clans = kosData.clans.map(c => ({ clan: c, addedBy: null }));
}
kosData.players = kosData.players.map(p => ({ ...p, addedBy: p.addedBy || null }));

// ---------------- SAVE ----------------
function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(kosData, null, 2));
}

// ---------------- HELPERS ----------------
const norm = s => s.toLowerCase();
let listUpdating = false;
let panelUpdating = false;

// Queue promises for safe sequential updates
let listUpdatePromise = Promise.resolve();
let panelUpdatePromise = Promise.resolve();

// Track recent replies to prevent duplicates
const recentReplies = new Set();

function canUsePriority(msg) {
    if (msg.author.id === OWNER_ID) return true;
    return msg.member?.roles.cache.has(PRIORITY_ROLE_ID);
}

// ---------------- FORMAT ----------------
function formatPriority() {
    return kosData.topPriority
        .map(n => {
            const p = kosData.players.find(p => norm(p.name) === n);
            return p ? `${p.name} : ${p.username || 'N/A'}` : n;
        })
        .sort()
        .join('\n') || 'None';
}

function formatPlayers() {
    return kosData.players
        .filter(p => !kosData.topPriority.includes(norm(p.name)))
        .sort((a,b) => a.name.localeCompare(b.name))
        .map(p => `${p.name} : ${p.username || 'N/A'}`)
        .join('\n') || 'None';
}

function formatClans() {
    if (!kosData.clans || kosData.clans.length === 0) return 'None';
    return kosData.clans
        .map(c => c?.clan || 'N/A')
        .sort()
        .join('\n');
}

// ---------------- LIST UPDATE ----------------
async function updateKosList(channel) {
    if (!channel) return;

    listUpdatePromise = listUpdatePromise.then(async () => {
        if (listUpdating) return;
        listUpdating = true;

        kosData.listData.channelId = channel.id;

        async function fetchOrSend(id, content) {
            try {
                if (id) {
                    const msg = await channel.messages.fetch(id).catch(()=>null);
                    if (msg) return (await msg.edit({ content }))?.id;
                }
            } catch {}
            const msg = await channel.send({ content });
            return msg.id;
        }

        kosData.listData.playersMessageId = await fetchOrSend(
            kosData.listData.playersMessageId,
            `\`\`\`
–––––––– PLAYERS ––––––
${formatPlayers()}
\`\`\``
        );

        kosData.listData.priorityMessageId = await fetchOrSend(
            kosData.listData.priorityMessageId,
            `\`\`\`
–––––––– PRIORITY ––––––
${formatPriority()}
\`\`\``
        );

        kosData.listData.clansMessageId = await fetchOrSend(
            kosData.listData.clansMessageId,
            `\`\`\`
–––––––– CLANS ––––––
${formatClans()}
\`\`\``
        );

        saveData();
        listUpdating = false;
    }).catch(console.error);

    return listUpdatePromise;
}

// ---------------- PANEL UPDATE ----------------
async function updatePanel(channel) {
    if (!channel) return;

    panelUpdatePromise = panelUpdatePromise.then(async () => {
        if (panelUpdating) return;
        panelUpdating = true;

        const gifEmbed = new EmbedBuilder()
            .setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExc2FoODRjMmVtNmhncjkyZzY0ZGVwa2l3dzV0M3UyYmZ4bjVsZ2pnOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/iuttaLUMRLWEgJKRHx/giphy.gif')
            .setColor(0xFF0000);

        const infoEmbed = new EmbedBuilder()
            .setTitle('KOS Submission System')
            .setColor(0xFF0000)
            .setDescription(`
This bot organizes LBG players and clans onto the KOS list for YX members.

Players
Use ^ka to add, ^kr to remove.
Example: ^ka poison poisonrebuild

Clans
Use ^kca to add, ^kcr to remove.
Example: ^kca yx eu

Thank you for being part of YX!
        `);

        async function fetchOrSendEmbed(id, embed) {
            try {
                if (id) {
                    const msg = await channel.messages.fetch(id).catch(()=>null);
                    if (msg) return (await msg.edit({ embeds: [embed] }))?.id;
                }
            } catch {}
            const msg = await channel.send({ embeds: [embed] });
            return msg.id;
        }

        kosData.panelMessages.gif = await fetchOrSendEmbed(kosData.panelMessages.gif, gifEmbed);
        kosData.panelMessages.tutorial = await fetchOrSendEmbed(kosData.panelMessages.tutorial, infoEmbed);

        saveData();
        panelUpdating = false;
    }).catch(console.error);

    return panelUpdatePromise;
}

// ---------------- PREFIX COMMANDS ----------------
client.on('messageCreate', async msg => {
    if (msg.author.bot) return;
    if (!msg.content.startsWith('^')) return;

    const p = msg.content.trim().split(/\s+/);
    const cmd = p[0].toLowerCase();

    async function sendReplyOnce(text) {
        const key = `${msg.author.id}-${msg.channel.id}-${text}`;
        if (recentReplies.has(key)) return;
        recentReplies.add(key);

        try {
            const botMsg = await msg.channel.send(`<@${msg.author.id}> ${text}`);
            setTimeout(() => {
                botMsg.delete().catch(()=>{});
                msg.delete().catch(()=>{});
                recentReplies.delete(key);
            }, 3000);
        } catch {}
    }

    async function updateList() {
        if (kosData.listData.channelId) {
            const ch = await client.channels.fetch(kosData.listData.channelId).catch(()=>null);
            if (ch) await updateKosList(ch);
        }
    }

    // ---------------- ENFORCE KOS CHANNEL ----------------
    if (kosData.listData.channelId && msg.channel.id !== kosData.listData.channelId) {
        if (['^ka','^kr','^pa','^p','^pr','^kca','^kcr'].includes(cmd)) {
            const subChannelMention = `<#${kosData.listData.channelId}>`;
            return sendReplyOnce(`Use KOS commands in ${subChannelMention}.`);
        }
    }

    // ---------------- PLAYER COMMANDS ----------------
    if (cmd === '^ka') {
        const name = p[1], username = p[2];
        if (!name || !username) return sendReplyOnce('Name and username required.');
        if (kosData.players.some(x => norm(x.name) === norm(name) && x.username === username)) 
            return sendReplyOnce('This player+username already exists.');
        kosData.players.push({ name, username, addedBy: msg.author.id });
        saveData(); await updateList();
        return sendReplyOnce(`Added ${name} : ${username}`);
    }

    if (cmd === '^kr') {
        const name = p[1], username = p[2];
        if (!name) return sendReplyOnce('Name required.');
        const player = kosData.players.find(x => norm(x.name) === norm(name) && (!username || x.username === username));
        if (!player) return sendReplyOnce('Player not found.');
        if (msg.author.id !== OWNER_ID && !canUsePriority(msg) && player.addedBy !== msg.author.id)
            return sendReplyOnce('You cannot remove this player.');
        kosData.players = kosData.players.filter(x => x !== player);
        kosData.topPriority = kosData.topPriority.filter(x => x !== norm(player.name));
        saveData(); await updateList();
        return sendReplyOnce(`Removed ${player.name} : ${player.username}`);
    }

    // ---------------- PRIORITY COMMANDS ----------------
    if (['^pa','^p','^pr'].includes(cmd)) {
        if (!canUsePriority(msg)) return sendReplyOnce('You are not allowed to use priority commands.');
        const name = p[1];
        if (!name) return sendReplyOnce('Name required.');
        const key = norm(name);

        if (cmd === '^pa') {
            const username = p[2] || 'N/A';
            const exists = kosData.players.some(x => norm(x.name) === key && x.username === username);
            if (!exists) kosData.players.push({ name, username, addedBy: msg.author.id });
            if (!kosData.topPriority.includes(key)) kosData.topPriority.push(key);
            saveData(); await updateList();
            return sendReplyOnce(`${name} added to priority`);
        }

        if (cmd === '^p') {
            if (!kosData.players.some(x => norm(x.name) === key)) return sendReplyOnce('Player must already be on the KOS list.');
            if (!kosData.topPriority.includes(key)) kosData.topPriority.push(key);
            saveData(); await updateList();
            return sendReplyOnce(`Prioritized ${name}`);
        }

        if (cmd === '^pr') {
            kosData.topPriority = kosData.topPriority.filter(x => x !== key);
            saveData(); await updateList();
            return sendReplyOnce(`Demoted ${name}`);
        }
    }

    // ---------------- CLAN COMMANDS ----------------
    if (cmd === '^kca') {
        const name = p[1], region = p[2];
        if (!name || !region) return sendReplyOnce('Clan name and region required.');
        const clanStr = `${region.toUpperCase()}»${name.toUpperCase()}`;
        if (kosData.clans.some(c => c.clan === clanStr)) return sendReplyOnce('Clan already exists.');
        kosData.clans.push({ clan: clanStr, addedBy: msg.author.id });
        saveData(); await updateList();
        return sendReplyOnce(`Added clan ${clanStr}`);
    }

    if (cmd === '^kcr') {
        const name = p[1], region = p[2];
        if (!name || !region) return sendReplyOnce('Clan name and region required.');
        const clanStr = `${region.toUpperCase()}»${name.toUpperCase()}`;
        const clan = kosData.clans.find(c => c.clan === clanStr);
        if (!clan) return sendReplyOnce('Clan not found.');
        if (msg.author.id !== OWNER_ID && !canUsePriority(msg) && clan.addedBy !== msg.author.id)
            return sendReplyOnce('You cannot remove this clan.');
        kosData.clans = kosData.clans.filter(c => c !== clan);
        saveData(); await updateList();
        return sendReplyOnce(`Removed clan ${clanStr}`);
    }
});

// ---------------- SLASH COMMANDS ----------------
client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    if (i.user.id !== OWNER_ID) return i.reply({ content: 'Not allowed.', ephemeral: true }).catch(()=>{});

    try {
        if (i.commandName === 'panel') {
            await updatePanel(i.channel);
            if (!i.replied && !i.deferred) await i.reply({ content: 'Panel updated.', ephemeral: true });
        }
        if (i.commandName === 'list') {
            await updateKosList(i.channel);
            if (!i.replied && !i.deferred) await i.reply({ content: 'KOS list updated.', ephemeral: true });
        }
        if (i.commandName === 'submission') {
            kosData.listData.channelId = i.channelId;
            saveData();
            if (!i.replied && !i.deferred) await i.reply({ content: `Submission channel set to <#${i.channelId}>`, ephemeral: true });
        }
    } catch (e) {
        console.error('Slash command error:', e);
        if (!i.replied && !i.deferred) await i.reply({ content: 'Error occurred.', ephemeral: true }).catch(()=>{});
    }
});

// ---------------- PERIODIC SAVE ----------------
setInterval(saveData, 60_000);

// ---------------- READY ----------------
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// ---------------- LOGIN ----------------
client.login(process.env.TOKEN);
