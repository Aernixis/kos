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
    players: [],         // { name, username, addedBy }
    topPriority: [],     // array of lowercased names
    clans: [],           // { name, region, addedBy }
    panel: { channelId: null, gifId: null, infoId: null },
    list: { channelId: null, playersId: null, priorityId: null, clansId: null }
};

// Load saved data
if (fs.existsSync(DATA_FILE)) {
    try { kosData = JSON.parse(fs.readFileSync(DATA_FILE)); }
    catch (e) { console.error('Failed to load data.json:', e); }
}

// ---------------- SAVE ----------------
function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(kosData, null, 2));
}

// ---------------- HELPERS ----------------
const norm = s => s.toLowerCase();

function confirmPing(msg, text) {
    return msg.channel.send(`<@${msg.author.id}> ${text}`)
        .then(m => setTimeout(() => m.delete().catch(() => {}), 3000))
        .catch(() => {});
}

function canUsePriority(msg) {
    return msg.author.id === OWNER_ID || msg.member?.roles.cache.has(PRIORITY_ROLE_ID);
}

function inSubmissionChannel(msg) {
    return kosData.list.channelId && msg.channel.id === kosData.list.channelId;
}

// ---------------- FORMAT ----------------
function formatPlayers() {
    return kosData.players
        .filter(p => !kosData.topPriority.includes(norm(p.name)))
        .sort((a,b) => a.name.localeCompare(b.name))
        .map(p => `${p.name} : ${p.username || 'N/A'}`)
        .join('\n') || 'None';
}

function formatPriority() {
    return kosData.topPriority
        .map(n => kosData.players.find(p => norm(p.name) === n)?.name || n)
        .sort()
        .join('\n') || 'None';
}

function formatClans() {
    return kosData.clans
        .map(c => `${c.region.toUpperCase()}»${c.name.toUpperCase()}`)
        .sort()
        .join('\n') || 'None';
}

// ---------------- LIST UPDATE ----------------
let listUpdating = false;
async function updateKosList(channel) {
    if (!channel || listUpdating) return;
    listUpdating = true;

    kosData.list.channelId = channel.id;

    async function editOrSend(id, content) {
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

    kosData.list.playersId = await editOrSend(
        kosData.list.playersId,
        `\`\`\`–––––––– PLAYERS ––––––\n${formatPlayers()}\n\`\`\``
    );

    kosData.list.priorityId = await editOrSend(
        kosData.list.priorityId,
        `\`\`\`–––––––– PRIORITY ––––––\n${formatPriority()}\n\`\`\``
    );

    kosData.list.clansId = await editOrSend(
        kosData.list.clansId,
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

    kosData.panel.channelId = channel.id;

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

    async function editOrSendEmbed(id, embed) {
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

    kosData.panel.gifId = await editOrSendEmbed(kosData.panel.gifId, gifEmbed);
    kosData.panel.infoId = await editOrSendEmbed(kosData.panel.infoId, infoEmbed);

    saveData();
    panelUpdating = false;
}

// ---------------- PREFIX COMMANDS ----------------
client.on('messageCreate', async msg => {
    if (msg.author.bot) return;
    const p = msg.content.trim().split(/\s+/);
    const cmd = p[0].toLowerCase();

    // Require submission channel for prefix commands
    if (!inSubmissionChannel(msg)) {
        if (['^ka','^kr','^pa','^p','^pr','^kca','^kcr'].includes(cmd))
            return confirmPing(msg, 'Use KOS commands in the KOS channel.');
    }

    // --- ADD PLAYER ---
    if (cmd === '^ka') {
        const name = p[1], username = p[2];
        if (!name || !username) return confirmPing(msg, 'Name and username required.');
        if (kosData.players.some(x => norm(x.name) === norm(name)))
            return confirmPing(msg, 'Player already exists.');
        kosData.players.push({ name, username, addedBy: msg.author.id });
        saveData();
        confirmPing(msg, `Added ${name}`);
    }

    // --- REMOVE PLAYER ---
    else if (cmd === '^kr') {
        const name = p[1];
        if (!name) return confirmPing(msg, 'Name required.');
        const key = norm(name);
        const player = kosData.players.find(p => norm(p.name) === key);
        if (!player) return confirmPing(msg, 'Player not found.');
        if (player.addedBy !== msg.author.id && !canUsePriority(msg))
            return confirmPing(msg, 'You are not allowed to remove this player.');
        kosData.players = kosData.players.filter(p => norm(p.name) !== key);
        kosData.topPriority = kosData.topPriority.filter(p => p !== key);
        saveData();
        confirmPing(msg, `Removed ${name}`);
    }

    // --- PRIORITY ---
    else if (['^pa','^p','^pr'].includes(cmd)) {
        if (!canUsePriority(msg)) return confirmPing(msg, 'You are not allowed to use priority commands.');
        const name = p[1];
        if (!name) return confirmPing(msg, 'Name required.');
        const key = norm(name);

        if (cmd === '^pa') {
            const username = p[2];
            const exists = kosData.players.some(x => norm(x.name) === key);
            if (!exists) kosData.players.push({ name, username: username || 'N/A', addedBy: msg.author.id });
            if (!kosData.topPriority.includes(key)) kosData.topPriority.push(key);
            saveData();
            return confirmPing(msg, exists ? `Prioritized ${name}` : `${name} added to priority`);
        }

        if (cmd === '^p') {
            if (!kosData.players.some(x => norm(x.name) === key)) return confirmPing(msg, 'Player must already be on the KOS list.');
            if (!kosData.topPriority.includes(key)) kosData.topPriority.push(key);
            saveData();
            return confirmPing(msg, `Prioritized ${name}`);
        }

        if (cmd === '^pr') {
            kosData.topPriority = kosData.topPriority.filter(x => x !== key);
            saveData();
            return confirmPing(msg, `Demoted ${name}`);
        }
    }

    // --- ADD CLAN ---
    else if (cmd === '^kca') {
        const name = p[1], region = p[2];
        if (!name || !region) return confirmPing(msg, 'Clan name and region required.');
        const key = `${region.toUpperCase()}»${name.toUpperCase()}`;
        if (kosData.clans.some(c => `${c.region.toUpperCase()}»${c.name.toUpperCase()}` === key))
            return confirmPing(msg, 'Clan already exists.');
        kosData.clans.push({ name, region, addedBy: msg.author.id });
        saveData();
        confirmPing(msg, `Added clan ${key}`);
    }

    // --- REMOVE CLAN ---
    else if (cmd === '^kcr') {
        const name = p[1], region = p[2];
        if (!name || !region) return confirmPing(msg, 'Clan name and region required.');
        const key = `${region.toUpperCase()}»${name.toUpperCase()}`;
        const clan = kosData.clans.find(c => `${c.region.toUpperCase()}»${c.name.toUpperCase()}` === key);
        if (!clan) return confirmPing(msg, 'Clan not found.');
        if (clan.addedBy !== msg.author.id && !canUsePriority(msg))
            return confirmPing(msg, 'You are not allowed to remove this clan.');
        kosData.clans = kosData.clans.filter(c => `${c.region.toUpperCase()}»${c.name.toUpperCase()}` !== key);
        saveData();
        confirmPing(msg, `Removed clan ${key}`);
    }

    // Update KOS list
    if (kosData.list.channelId) {
        const ch = await client.channels.fetch(kosData.list.channelId).catch(()=>null);
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
            if (!i.replied && !i.deferred) await i.deferReply({ flags: 64 }).catch(()=>{});
            await updatePanel(i.channel);
            if (i.deferred) await i.editReply({ content: 'Panel updated.' }).catch(()=>{});
            else await i.reply({ content: 'Panel updated.', flags: 64 }).catch(()=>{});
        }

        if (i.commandName === 'list') {
            if (!i.replied && !i.deferred) await i.deferReply({ flags: 64 }).catch(()=>{});
            await updateKosList(i.channel);
            if (i.deferred) await i.editReply({ content: 'KOS list updated.' }).catch(()=>{});
            else await i.reply({ content: 'KOS list updated.', flags: 64 }).catch(()=>{});
        }

        if (i.commandName === 'submission') {
            kosData.list.channelId = i.channelId;
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

// ---------------- READY ----------------
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// ---------------- LOGIN ----------------
client.login(process.env.TOKEN);
