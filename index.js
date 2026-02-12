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

if (fs.existsSync(DATA_FILE)) {
    try { kosData = JSON.parse(fs.readFileSync(DATA_FILE)); }
    catch { console.error('Failed to load data.json'); }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(kosData, null, 2));
}

const norm = s => s.toLowerCase();

// ---------------- HELPERS ----------------
function confirmPing(msg, text) {
    msg.channel.send(`<@${msg.author.id}> ${text}`)
        .then(m => setTimeout(() => m.delete().catch(()=>{}), 3000))
        .catch(()=>{});
}

function canUsePriority(msg) {
    if (msg.author.id === OWNER_ID) return true;
    return msg.member?.roles.cache.has(PRIORITY_ROLE_ID);
}

function canRemove(msg, addedBy) {
    return msg.author.id === OWNER_ID || canUsePriority(msg) || msg.author.id === addedBy;
}

// ---------------- FORMAT ----------------
function formatPriority() {
    return kosData.topPriority
        .map(n => {
            const player = kosData.players.find(p => norm(p.name) === n);
            return player ? `${player.name} : ${player.username}` : n;
        })
        .sort()
        .join('\n') || 'None';
}

function formatPlayers() {
    return kosData.players
        .filter(p => !kosData.topPriority.includes(norm(p.name)))
        .sort((a,b) => a.name.localeCompare(b.name))
        .map(p => `${p.name} : ${p.username}`)
        .join('\n') || 'None';
}

function formatClans() {
    return kosData.clans.sort().join('\n') || 'None';
}

// ---------------- LIST UPDATE ----------------
let listUpdating = false;
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
        `\`\`\`–––––––– PLAYERS ––––––\n${formatPlayers()}\n\`\`\``
    );

    kosData.listData.priorityMessageId = await fetchOrSend(
        kosData.listData.priorityMessageId,
        `\`\`\`–––––––– PRIORITY ––––––\n${formatPriority()}\n\`\`\``
    );

    kosData.listData.clansMessageId = await fetchOrSend(
        kosData.listData.clansMessageId,
        `\`\`\`–––––––– CLANS ––––––\n${formatClans()}\n\`\`\``
    );

    saveData();
    listUpdating = false;
}

// ---------------- PANEL ----------------
let panelUpdating = false;
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
    if (!kosData.listData.channelId || msg.channel.id !== kosData.listData.channelId) {
        return confirmPing(msg, 'Use KOS commands in the KOS channel.');
    }

    const p = msg.content.trim().split(/\s+/);
    const cmd = p[0].toLowerCase();

    // --- ADD PLAYER ---
    if (cmd === '^ka') {
        const name = p[1], username = p[2];
        if (!name || !username) return confirmPing(msg, 'Name and username required.');
        if (kosData.players.some(x => norm(x.username) === norm(username))) return confirmPing(msg, 'Username already exists.');
        kosData.players.push({ name, username, addedBy: msg.author.id });
        saveData();
        confirmPing(msg, `Added ${name} : ${username}`);
    }

    // --- REMOVE PLAYER ---
    else if (cmd === '^kr') {
        const name = p[1], username = p[2];
        if (!name) return confirmPing(msg, 'Name required.');

        const matches = kosData.players.filter(p => norm(p.name) === norm(name));
        let player;
        if (matches.length === 0) return confirmPing(msg, 'Player not found.');
        if (matches.length === 1) player = matches[0];
        else {
            if (!username) return confirmPing(msg, 'There are multiple users with this name, add the username.');
            player = kosData.players.find(p => norm(p.name) === norm(name) && norm(p.username) === norm(username));
            if (!player) return confirmPing(msg, 'Player not found with that username.');
        }

        if (!canRemove(msg, player.addedBy)) return confirmPing(msg, 'You do not have permission to remove this player.');

        kosData.players = kosData.players.filter(p => p !== player);
        kosData.topPriority = kosData.topPriority.filter(p => p !== norm(player.name));
        saveData();
        confirmPing(msg, `Removed ${player.name} : ${player.username}`);
    }

    // --- PRIORITY ---
    else if (['^pa','^p','^pr'].includes(cmd)) {
        if (!canUsePriority(msg)) return confirmPing(msg, 'You are not allowed to use priority commands.');
        const name = p[1], username = p[2];
        if (!name) return confirmPing(msg, 'Name required.');

        const matches = kosData.players.filter(x => norm(x.name) === norm(name));
        let player;

        if (cmd === '^pa') {
            if (matches.length === 0) {
                if (!username) return confirmPing(msg, 'Username required for new player.');
                if (kosData.players.some(p => norm(p.username) === norm(username)))
                    return confirmPing(msg, 'Username already exists.');
                player = { name, username, addedBy: msg.author.id };
                kosData.players.push(player);
            } else {
                if (!kosData.topPriority.includes(norm(name))) kosData.topPriority.push(norm(name));
                saveData();
                return confirmPing(msg, `Prioritized ${matches[0].name} : ${matches[0].username}`);
            }
            kosData.topPriority.push(norm(name));
            saveData();
            return confirmPing(msg, `${name} added to priority`);
        }

        if (cmd === '^p') {
            if (matches.length === 0) {
                if (!username) return confirmPing(msg, 'Player not found, username required to add new.');
                if (kosData.players.some(p => norm(p.username) === norm(username)))
                    return confirmPing(msg, 'Username already exists.');
                player = { name, username, addedBy: msg.author.id };
                kosData.players.push(player);
            } else if (matches.length === 1) {
                player = matches[0];
            } else {
                if (!username) return confirmPing(msg, 'There are multiple users with this name, add the username.');
                player = matches.find(p => norm(p.username) === norm(username));
                if (!player) return confirmPing(msg, 'Player not found with that username.');
            }

            if (!kosData.topPriority.includes(norm(player.name))) kosData.topPriority.push(norm(player.name));
            saveData();
            return confirmPing(msg, `Prioritized ${player.name} : ${player.username}`);
        }

        if (cmd === '^pr') {
            if (matches.length === 0) return confirmPing(msg, 'Player not found.');
            player = matches.length === 1 ? matches[0] : matches.find(p => norm(p.username) === norm(username));
            if (!player) return confirmPing(msg, 'Player not found.');
            kosData.topPriority = kosData.topPriority.filter(p => p !== norm(player.name));
            saveData();
            confirmPing(msg, `Demoted ${player.name} : ${player.username}`);
        }
    }

    // --- ADD CLAN ---
    else if (cmd === '^kca') {
        const name = p[1], region = p[2];
        if (!name || !region) return confirmPing(msg, 'Clan name and region required.');
        const clanStr = `${region.toUpperCase()}»${name.toUpperCase()}`;
        if (kosData.clans.includes(clanStr)) return confirmPing(msg, 'Clan already exists.');
        kosData.clans.push({ name, region, addedBy: msg.author.id, str: clanStr });
        saveData();
        confirmPing(msg, `Added clan ${clanStr}`);
    }

    // --- REMOVE CLAN ---
    else if (cmd === '^kcr') {
        const name = p[1], region = p[2];
        if (!name || !region) return confirmPing(msg, 'Clan name and region required.');
        const clanStr = `${region.toUpperCase()}»${name.toUpperCase()}`;
        const clan = kosData.clans.find(c => c.str === clanStr);
        if (!clan) return confirmPing(msg, 'Clan not found.');
        if (!canRemove(msg, clan.addedBy)) return confirmPing(msg, 'You do not have permission to remove this clan.');
        kosData.clans = kosData.clans.filter(c => c !== clan);
        saveData();
        confirmPing(msg, `Removed clan ${clanStr}`);
    }

    // Update KOS list once after any command
    if (kosData.listData.channelId) {
        const ch = await client.channels.fetch(kosData.listData.channelId).catch(()=>null);
        if (ch) updateKosList(ch);
    }
});

// ---------------- SLASH COMMANDS ----------------
client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;

    if (i.user.id !== OWNER_ID)
        return i.reply({ content: 'Not allowed.', ephemeral: true }).catch(()=>{});

    try {
        if (i.commandName === 'panel') {
            await i.deferReply({ flags: 64 });
            await updatePanel(i.channel);
            return i.editReply({ content: 'Panel updated.' });
        }

        if (i.commandName === 'list') {
            await i.deferReply({ flags: 64 });
            await updateKosList(i.channel);
            return i.editReply({ content: 'KOS list updated.' });
        }

        if (i.commandName === 'submission') {
            kosData.listData.channelId = i.channelId;
            saveData();
            if (!i.replied) await i.reply({ content: `Submission channel set to <#${i.channelId}>`, flags: 64 }).catch(()=>{});
        }

    } catch (e) {
        console.error('Slash command error:', e);
        if (!i.replied && !i.deferred) i.reply({ content: 'Error occurred.', ephemeral: true }).catch(()=>{});
    }
});

// ---------------- PERIODIC SAVE ----------------
setInterval(saveData, 60_000);

// ---------------- LOGIN ----------------
client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));
client.login(process.env.TOKEN);
