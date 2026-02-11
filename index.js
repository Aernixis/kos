require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');

const OWNER_ID = '1283217337084018749';
const PREFIX = '^';

// Memory storage
let kosList = {
    regular: [
        { name: '1U_0I', username: '1U_0I' },
        { name: '—043—', username: 'lennoxtownmonkey15' },
        { name: '0liver', username: 'mm2_1love19' },
        { name: '999_kayden', username: '999_kayden' },
        { name: '999_lemacaque', username: '999_lemacaque' },
        { name: 'Afterburn', username: 'Fangxburn' },
        { name: 'Akiren', username: 'Artem_274912' },
        { name: 'Amazingboy2382', username: 'Amazingboy2382' },
        { name: 'anton_raton', username: 'anton_raton' },
        { name: 'arsonguy', username: 'Gamingx_gaming' },
        { name: 'Atomic', username: 'Bobby_JordanCR' },
        { name: 'Atomic', username: 'zioles123665' },
        { name: 'BENJI', username: 'Senj_77' },
        { name: 'CG_Jun', username: 'Juns_shrine' },
        { name: 'COOLSKELETON95', username: 'CoolSkeleton95_J' },
        { name: 'Duperamr7', username: 'Duperamr7' },
        { name: 'Elsanti', username: 'Suscriproll' },
        { name: 'Erasi_Asy', username: 'Erasi_Asy' },
        { name: 'Esebas2345', username: 'Esebas2345' },
        { name: 'epaxit', username: 'epaxit' },
        { name: 'eye', username: 'FAWAX921' },
        { name: 'Friday_UAEban', username: 'EyesWiThered' },
        { name: 'holi98cclllll', username: 'holi98cclllll' },
        { name: 'HoWitzer', username: 'Frandfrork' },
        { name: 'I_atemytable', username: 'henkiespo' },
        { name: 'IceBreaker', username: 'GlebUA6' },
        { name: 'IL1US', username: 'vlad1357909090' },
        { name: 'ItsGoingDown', username: 'ItsGoingDown' },
        { name: 'Jayce', username: 'jayce_devs' },
        { name: 'Jerry', username: 'dark_reaperxy' },
        { name: 'Jhu96796ii', username: 'Jhu96796ii' },
        { name: 'Jonion', username: 'GohansannKid' },
        { name: 'Koshka_Nika', username: 'Xv13600' },
        { name: 'Leo', username: 'BOOK9915' },
        { name: 'LordOfCycles', username: 'LordOfCycles' },
        { name: 'Lilhoneylover', username: 'Lilhoneylover' },
        { name: 'lshshcbfr', username: 'lshshcbfr' },
        { name: 'Mab/Yosh', username: 'Mab/Yosh' },
        { name: 'megarandom77', username: 'megarandom77' },
        { name: 'milkvey64', username: 'milkvey64' },
        { name: 'Nowhere', username: 'MehmeT_003100' },
        { name: 'PARK_P12MI', username: 'le_PAINfou7' },
        { name: 'Polaris', username: 'PolarisFR' },
        { name: 'RR_bf', username: 'RR_bf' },
        { name: 'RR_yori', username: 'RR_yori' },
        { name: 'raga', username: 'raga' },
        { name: 'RASHKA', username: 'Slowzyy86' },
        { name: 'Rtd_Zidox', username: 'Zidox_7' },
        { name: 'Saibot_xMeddy', username: 'vlad0k_i' },
        { name: 'shairaxn', username: 'shairaxn' },
        { name: 'sousoune81100', username: 'sousoune81100' },
        { name: 'Spitfire', username: 'Therealwarlock1' },
        { name: 'STN_An1', username: 'ana_011528' },
        { name: 'Susmogus264', username: 'Susmogus264' },
        { name: 'TheBlueRay', username: 'ElSanti0026' },
        { name: 'uruma', username: 'uruma' },
        { name: 'Valorantussvintus', username: 'Valorantussvintus' },
        { name: 'Yassen_Kun', username: 'yaseenvx' },
        { name: 'hamad', username: 'hamad' },
        { name: 'vagg', username: 'vagg' },
        { name: 'cawaigirl', username: 'CoolLitleG1rl' },
        { name: 'sairpluto', username: 'sairpluto' },
        { name: 'Sohee_macho', username: 'Armandonar' },
        { name: '67321', username: 'Xdd332166' },
        { name: 'Shairaxn', username: 'Shairaxn' },
        { name: 'Pingvinyasha_2', username: 'Pingvinyasha_2' },
        { name: '3mkhsin59', username: '3mkhsin59' },
        { name: 'sin', username: 'Flircher' },
        { name: 'Frederick', username: 'lalala123123222' },
        { name: 'laziz', username: 'sobirovLaziz_010' }
    ],
    priority: [
        { name: 'Rtd_Zidox', username: 'Rtd_Zidox' },
        { name: 'Wezah', username: 'Wezah' },
        { name: 'RASHKA', username: 'RASHKA' },
        { name: 'Spitfire', username: 'Spitfire' },
        { name: 'Rekt', username: '@primalflick2024' },
        { name: 'smile', username: 'smile' },
        { name: 'icewraith', username: 'icewraith' }
    ],
    clans: [
        'EU»XI','EU»RR','EU»ROTA','EU»RTD','EU»TCK','EU»PARK','EU»TV','EU»RDR','EU»NOTA','EU»STS','EU»ZD',
        'NA»TSA','NA»CSR/CDR','NA»STN','NA»DTA','NA»SH','NA»ATK'
    ]
};

// In-memory message references for updating
let messagesRef = {
    regular: null,
    priority: null,
    clans: null
};

let submissionChannel = null;
let listChannel = null;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
});

// Helper to sort
function sortPlayers(arr) {
    return arr.sort((a, b) => a.name.localeCompare(b.name));
}

// Helper to build list text
function buildListText() {
    let regularText = '```';
    sortPlayers(kosList.regular).forEach(p => regularText += `\n${p.name} : ${p.username}`);
    regularText += '\n```';

    let priorityText = '```';
    sortPlayers(kosList.priority).forEach(p => priorityText += `\n${p.name} : ${p.username}`);
    priorityText += '\n```';

    let clansText = '```' + kosList.clans.sort().join('\n') + '```';

    return { regularText, priorityText, clansText };
}

// Update list messages
async function updateListMessages() {
    if (!listChannel) return;
    const { regularText, priorityText, clansText } = buildListText();
    try {
        if (!messagesRef.regular) messagesRef.regular = await listChannel.send(regularText);
        else await messagesRef.regular.edit(regularText);

        if (!messagesRef.priority) messagesRef.priority = await listChannel.send(priorityText);
        else await messagesRef.priority.edit(priorityText);

        if (!messagesRef.clans) messagesRef.clans = await listChannel.send(clansText);
        else await messagesRef.clans.edit(clansText);
    } catch (err) {
        console.error(err);
    }
}

// Owner check
function isOwner(userId) {
    return userId === OWNER_ID;
}

// Command handler for prefix
client.on('messageCreate', async message => {
    if (!message.content.startsWith(PREFIX) || message.author.bot) return;
    if (!isOwner(message.author.id)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Player add/remove
    if (command === 'kos' || command === 'ka' || command === 'kr' || command === 'kca' || command === 'kcr') {
        let action = '';
        let type = '';
        if (command === 'kos') action = args[0], type = args[1]; 
        else if (command === 'ka') { action = 'add'; type = 'player'; }
        else if (command === 'kr') { action = 'remove'; type = 'player'; }
        else if (command === 'kca') { action = 'add'; type = 'clan'; }
        else if (command === 'kcr') { action = 'remove'; type = 'clan'; }

        try {
            if (type === 'player' || type === undefined) {
                let name = args[action === 'add' ? 0 : 0];
                let username = args[action === 'add' ? 1 : 1];
                if (action === 'add') kosList.regular.push({ name, username });
                else kosList.regular = kosList.regular.filter(p => !(p.name === name && p.username === username));
            }
            if (type === 'clan' || type === undefined) {
                let name = args[0];
                let region = args[1];
                let clanName = `${name} » ${region}`;
                if (action === 'add') kosList.clans.push(clanName);
                else kosList.clans = kosList.clans.filter(c => c !== clanName);
            }
            // Ping and auto-delete
            const reply = await message.channel.send(`${action === 'add' ? 'Player/Clan added!' : 'Player/Clan removed!'}`);
            setTimeout(() => reply.delete(), 3000);
            setTimeout(() => message.delete(), 3000);

            await updateListMessages();
        } catch (err) {
            console.error(err);
        }
    }
});

// Slash commands
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (!isOwner(interaction.user.id)) return;

    const { commandName } = interaction;

    if (commandName === 'panel') {
        try {
            if (interaction.guild) {
                await interaction.channel.send({ content: 'https://i.imgur.com/aV9NbA7.png' });
                const embed = new EmbedBuilder()
                    .setTitle('KOS Submission System')
                    .setDescription(`This bot organizes LBG players and clans onto the KOS list for YX members.
                    
Players
* To add players, use the command ^kos add or ^ka
* When adding players, place the name before the username
Example:
^kos add poison poisonrebuild
^ka poison poisonrebuild
* To remove players, use the command ^kos remove or ^kr
* Removing players follows the same format as adding them
Example:
^kos remove poison poisonrebuild
^kr poison poisonrebuild
Clans
* To add clans, use the command ^kos clan add or ^kca
* When adding clans, place the name before the region and use the short region code
Example:
^kos clan add yx eu
^kca yx eu
* To remove clans, use the command ^kos clan remove or ^kcr
* Removing clans follows the same format as adding them
Example:
^kos clan remove yx eu
^kcr yx eu
Thank you for being apart of YX!`)
                    .setColor(0xFF0000);
                await interaction.channel.send({ embeds: [embed] });
                await interaction.reply({ content: 'Panel posted!', ephemeral: true });
            }
        } catch (err) { console.error(err); }
    } else if (commandName === 'list') {
        if (!listChannel) listChannel = interaction.channel;
        await updateListMessages();
        await interaction.reply({ content: 'KOS list posted/updated!', ephemeral: true });
    } else if (commandName === 'submission') {
        if (!submissionChannel) submissionChannel = interaction.channel;
        await interaction.reply({ content: 'Submission channel set!', ephemeral: true });
    }
});

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Login
client.login(process.env.TOKEN);
