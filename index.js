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
    if (!msg.member) return false;
    return msg.member.roles.cache.has(PRIORITY_ROLE_ID);
}

// ---------------- FORMAT ----------------
function formatPriority() {
    return kosData.topPriority
        .map(n => kosData.players.find(p => norm(p.name) === n)?.name || n)
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
    return kosData.clans.sort().join('\n') || 'None';
}

// ---------------- LIST UPDATE ----------------
async function updateKosList(channel) {
    if (!channel) return;
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
}

// ---------------- PANEL ----------------
async function updatePanel(channel) {
    if (!channel) return;

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
}

// ---------------- PREFIX COMMANDS ----------------
client.on('messageCreate', async msg => {
    if (msg.author.bot) return;
    const p = msg.content.trim().split(/\s+/);
    const cmd = p[0].toLowerCase();

    // --- ADD PLAYER ---
    if (cmd === '^ka') {
        const name = p[1], username = p[2];
        if (!name || !username) return confirmPing(msg, 'Name and username required.');
        if (kosData.players.some(x => norm(x.name) === norm(name))) return confirmPing(msg, 'Player already exists.');
        kosData.players.push({ name, username });
        saveData();
        confirmPing(msg, `Added ${name}`);
    }

    // --- REMOVE PLAYER ---
    else if (cmd === '^kr') {
        const name = p[1];
        if (!name) return confirmPing(msg, 'Name required.');
        kosData.players = kosData.players.filter(x => norm(x.name) !== norm(name));
        kosData.topPriority = kosData.topPriority.filter(x => x !== norm(name));
        saveData();
        confirmPing(msg, `Removed ${name}`);
    }

    // --- PRIORITY ---
    else if (['^pa','^p','^pr'].includes(cmd)) {
        if (!canUsePriority(msg)) return confirmPing(msg, 'You are not allowed to use priority commands.');
        const name = p[1];
        if (!name) return confirmPing(msg, 'Name required.');
        const key = norm(name);

        // ^pa = add + prioritize
        if (cmd === '^pa') {
            const username = p[2];
            const playerExists = kosData.players.some(x => norm(x.name) === key);
            if (!playerExists) {
                kosData.players.push({ name, username: username || 'N/A' });
                kosData.topPriority.push(key);
                saveData();
                return confirmPing(msg, `${name} added to priority`);
            }
            if (!kosData.topPriority.includes(key)) kosData.topPriority.push(key);
            saveData();
            return confirmPing(msg, `Prioritized ${name}`);
        }

        // ^p = promote existing
        if (cmd === '^p') {
            if (!kosData.players.some(x => norm(x.name) === key)) return confirmPing(msg, 'Player must already be on the KOS list.');
            if (!kosData.topPriority.includes(key)) kosData.topPriority.push(key);
            saveData();
            confirmPing(msg, `Prioritized ${name}`);
        }

        // ^pr = demote
        if (cmd === '^pr') {
            kosData.topPriority = kosData.topPriority.filter(x => x !== key);
            saveData();
            confirmPing(msg, `Demoted ${name}`);
        }
    }

    // --- ADD CLAN ---
    else if (cmd === '^kca') {
        const name = p[1], region = p[2];
        if (!name || !region) return confirmPing(msg, 'Clan name and region required.');
        const clanStr = `${region.toUpperCase()}»${name.toUpperCase()}`;
        if (kosData.clans.includes(clanStr)) return confirmPing(msg, 'Clan already exists.');
        kosData.clans.push(clanStr);
        saveData();
        confirmPing(msg, `Added clan ${clanStr}`);
    }

    // --- REMOVE CLAN ---
    else if (cmd === '^kcr') {
        const name = p[1], region = p[2];
        if (!name || !region) return confirmPing(msg, 'Clan name and region required.');
        const clanStr = `${region.toUpperCase()}»${name.toUpperCase()}`;
        if (!kosData.clans.includes(clanStr)) return confirmPing(msg, 'Clan not found.');
        kosData.clans = kosData.clans.filter(c => c !== clanStr);
        saveData();
        confirmPing(msg, `Removed clan ${clanStr}`);
    }

    // Update list once after any command
    if (kosData.listData.channelId) {
        const ch = await client.channels.fetch(kosData.listData.channelId).catch(()=>null);
        if (ch) updateKosList(ch);
    }
});

// ---------------- SLASH COMMANDS ----------------
client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;

    if (i.user.id !== OWNER_ID) return i.reply({ content: 'Not allowed.', ephemeral: true }).catch(()=>{});

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
client.login(process.env.TOKEN);

