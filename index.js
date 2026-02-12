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

// Load data
if (fs.existsSync(DATA_FILE)) {
    try { kosData = JSON.parse(fs.readFileSync(DATA_FILE)); }
    catch { console.error('Failed to load data.json'); }
}

// ---------------- DATA NORMALIZATION ----------------
// Normalize clans to objects with addedBy
if (kosData.clans.length > 0 && typeof kosData.clans[0] === 'string') {
    kosData.clans = kosData.clans.map(c => ({ clan: c, addedBy: null }));
}

// Normalize players to have addedBy if missing
kosData.players = kosData.players.map(p => ({ ...p, addedBy: p.addedBy || null }));

// ---------------- SAVE ----------------
function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(kosData, null, 2));
}

// ---------------- HELPERS ----------------
const norm = s => s.toLowerCase();
let panelUpdating = false;
let listUpdating = false;

function canUsePriority(msg) {
    if (msg.author.id === OWNER_ID) return true;
    return msg.member?.roles.cache.has(PRIORITY_ROLE_ID);
}

// ---------------- FORMAT ----------------
function formatPriority() {
    return kosData.topPriority
        .map(n => kosData.players.find(p => norm(p.name) === norm(n))?.name || n)
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

function contentWithExistingFormatting(type) {
    if (type === 'players') return `–––––––– PLAYERS ––––––\n${formatPlayers()}`;
    if (type === 'priority') return `–––––––– PRIORITY ––––––\n${formatPriority()}`;
    if (type === 'clans') return `–––––––– CLANS ––––––\n${formatClans()}`;
    return '';
}

// ---------------- LIST UPDATE ----------------
async function updateKosList(channel) {
    if (!channel || listUpdating) return;
    listUpdating = true;

    kosData.listData.channelId = channel.id;

    async function fetchOrSend(id, content) {
        if (id) {
            try {
                const msg = await channel.messages.fetch(id);
                await msg.edit({ content });
                return msg.id;
            } catch {}
        }
        const msg = await channel.send({ content });
        return msg.id;
    }

    kosData.listData.playersMessageId = await fetchOrSend(
        kosData.listData.playersMessageId,
        `\`\`\`
${contentWithExistingFormatting('players')}
\`\`\``
    );

    kosData.listData.priorityMessageId = await fetchOrSend(
        kosData.listData.priorityMessageId,
        `\`\`\`
${contentWithExistingFormatting('priority')}
\`\`\``
    );

    kosData.listData.clansMessageId = await fetchOrSend(
        kosData.listData.clansMessageId,
        `\`\`\`
${contentWithExistingFormatting('clans')}
\`\`\``
    );

    saveData();
    listUpdating = false;
}

// ---------------- PANEL UPDATE ----------------
async function updatePanel(channel) {
    if (!channel || panelUpdating) return;
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

    async function fetchOrSendEmbed(id, embed) {
        if (id) {
            try {
                const msg = await channel.messages.fetch(id);
                await msg.edit({ embeds: [embed] });
                return msg.id;
            } catch {}
        }
        const msg = await channel.send({ embeds: [embed] });
        return msg.id;
    }

    kosData.panelMessages.gif = await fetchOrSendEmbed(kosData.panelMessages.gif, gifEmbed);
    kosData.panelMessages.tutorial = await fetchOrSendEmbed(kosData.panelMessages.tutorial, infoEmbed);

    saveData();
    panelUpdating = false;
}

// ---------------- PREFIX COMMANDS ----------------
client.on('messageCreate', async msg => {
    if (msg.author.bot) return;
    if (!msg.content.startsWith('^')) return;

    const p = msg.content.trim().split(/\s+/);
    const cmd = p[0].toLowerCase();
    let handled = false;

    async function confirmPingOnce(text) {
        if (handled) return;
        handled = true;
        try {
            await msg.delete().catch(() => {});
            const botMsg = await msg.channel.send(`<@${msg.author.id}> ${text}`);
            setTimeout(() => botMsg.delete().catch(() => {}), 3000);
        } catch {}
    }

    // --- Enforce submission channel ---
    if (kosData.listData.channelId && msg.channel.id !== kosData.listData.channelId) {
        if (['^ka','^kr','^pa','^p','^pr','^kca','^kcr'].includes(cmd)) {
            return confirmPingOnce('Use KOS commands in the KOS channel.');
        }
    }

    // --- ADD PLAYER ---
    if (cmd === '^ka') {
        const name = p[1], username = p[2];
        if (!name || !username) return confirmPingOnce('Name and username required.');
        if (kosData.players.some(x => norm(x.name) === norm(name))) return confirmPingOnce('Player already exists.');
        kosData.players.push({ name, username, addedBy: msg.author.id });
        saveData();
        return confirmPingOnce(`Added ${name}`);
    }

    // --- REMOVE PLAYER ---
    if (cmd === '^kr') {
        const name = p[1];
        if (!name) return confirmPingOnce('Name required.');
        const player = kosData.players.find(x => norm(x.name) === norm(name));
        if (!player) return confirmPingOnce('Player not found.');
        if (msg.author.id !== OWNER_ID && !canUsePriority(msg) && player.addedBy !== msg.author.id)
            return confirmPingOnce('You cannot remove this player.');
        kosData.players = kosData.players.filter(x => norm(x.name) !== norm(name));
        kosData.topPriority = kosData.topPriority.filter(x => x !== norm(name));
        saveData();
        return confirmPingOnce(`Removed ${name}`);
    }

    // --- PRIORITY ---
    if (['^pa','^p','^pr'].includes(cmd)) {
        if (!canUsePriority(msg)) return confirmPingOnce('You are not allowed to use priority commands.');
        const name = p[1];
        if (!name) return confirmPingOnce('Name required.');
        const key = norm(name);

        if (cmd === '^pa') {
            const username = p[2];
            const playerExists = kosData.players.some(x => norm(x.name) === key);
            if (!playerExists) {
                kosData.players.push({ name, username: username || 'N/A', addedBy: msg.author.id });
                kosData.topPriority.push(key);
                saveData();
                return confirmPingOnce(`${name} added to priority`);
            }
            if (!kosData.topPriority.includes(key)) kosData.topPriority.push(key);
            saveData();
            return confirmPingOnce(`Prioritized ${name}`);
        }

        if (cmd === '^p') {
            if (!kosData.players.some(x => norm(x.name) === key)) return confirmPingOnce('Player must already be on the KOS list.');
            if (!kosData.topPriority.includes(key)) kosData.topPriority.push(key);
            saveData();
            return confirmPingOnce(`Prioritized ${name}`);
        }

        if (cmd === '^pr') {
            kosData.topPriority = kosData.topPriority.filter(x => x !== key);
            saveData();
            return confirmPingOnce(`Demoted ${name}`);
        }
    }

    // --- ADD CLAN ---
    if (cmd === '^kca') {
        const name = p[1], region = p[2];
        if (!name || !region) return confirmPingOnce('Clan name and region required.');
        const clanStr = `${region.toUpperCase()}»${name.toUpperCase()}`;
        if (kosData.clans.some(c => c.clan === clanStr)) return confirmPingOnce('Clan already exists.');
        kosData.clans.push({ clan: clanStr, addedBy: msg.author.id });
        saveData();
        return confirmPingOnce(`Added clan ${clanStr}`);
    }

    // --- REMOVE CLAN ---
    if (cmd === '^kcr') {
        const name = p[1], region = p[2];
        if (!name || !region) return confirmPingOnce('Clan name and region required.');
        const clanStr = `${region.toUpperCase()}»${name.toUpperCase()}`;
        const clan = kosData.clans.find(c => c.clan === clanStr);
        if (!clan) return confirmPingOnce('Clan not found.');
        if (msg.author.id !== OWNER_ID && !canUsePriority(msg) && clan.addedBy !== msg.author.id)
            return confirmPingOnce('You cannot remove this clan.');
        kosData.clans = kosData.clans.filter(c => c.clan !== clanStr);
        saveData();
        return confirmPingOnce(`Removed clan ${clanStr}`);
    }

    // Update KOS list silently if a command was handled
    if (handled && kosData.listData.channelId) {
        const ch = await client.channels.fetch(kosData.listData.channelId).catch(() => null);
        if (ch) updateKosList(ch);
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
