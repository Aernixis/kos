// ---------------- Prefix Commands ----------------
client.on('messageCreate', async msg => {
    if (msg.author.bot) return;

    const parts = msg.content.trim().split(/\s+/);
    const prefix = parts[0].toLowerCase();

    // ---------------- Player Add/Remove ----------------
    if (['^ka','^kr','^kos'].includes(prefix)) {
        let action, name, username;

        // Determine action and indexes based on prefix
        if (prefix === '^ka') {
            action = 'add';
            name = parts[1];
            username = parts[2];
        } else if (prefix === '^kr') {
            action = 'remove';
            name = parts[1];
        } else if (prefix === '^kos') {
            action = parts[1]?.toLowerCase(); // 'add' or 'remove'
            name = parts[2];
            username = parts[3];
        } else {
            return; // not a player command
        }

        // Handle Add
        if (action === 'add') {
            if(!name && !username) return confirmPing(msg, 'Player name and username required.');
            if(!name) return confirmPing(msg, 'Player name required.');
            if(!username) return confirmPing(msg, 'Username required.');

            if(kosData.players.some(p => p.name.toLowerCase() === name.toLowerCase()))
                return confirmPing(msg, `Player "${name}" already exists.`);

            kosData.players.push({ name, username, addedBy: msg.author.id });
            saveData();
            confirmPing(msg, `Player added: ${name} (${username})`);
        }

        // Handle Remove
        else if (action === 'remove') {
            if(!name) return confirmPing(msg, 'Player name required.');

            const idx = kosData.players.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
            if(idx === -1) return confirmPing(msg, `Player "${name}" not found.`);

            kosData.players.splice(idx, 1);
            saveData();
            confirmPing(msg, `Player removed: ${name}`);
        }

        // Update KOS list immediately
        if(kosData.listData.channelId) {
            const ch = await client.channels.fetch(kosData.listData.channelId).catch(()=>null);
            if(ch) updateKosList(ch);
        }
    }

    // ---------------- Clan Add/Remove ----------------
    if (['^kca','^kcr','^kos'].includes(prefix)) {
        let action, name, region;

        if (prefix === '^kca') {
            action = 'add';
            name = parts[1];
            region = parts[2];
        } else if (prefix === '^kcr') {
            action = 'remove';
            name = parts[1];
            region = parts[2];
        } else if (prefix === '^kos' && parts[1]?.toLowerCase() === 'clan') {
            action = parts[2]?.toLowerCase(); // 'add' or 'remove'
            name = parts[3];
            region = parts[4];
        } else {
            return; // not a clan command
        }

        // Validate input
        if(!name && !region) return confirmPing(msg, 'Clan name and region required.');
        if(!name) return confirmPing(msg, 'Clan name required.');
        if(!region) return confirmPing(msg, 'Region required.');

        const formattedClan = `${region.toUpperCase()}»${name.toUpperCase()}`;

        // Handle Add
        if (action === 'add') {
            if(kosData.clans.includes(formattedClan))
                return confirmPing(msg, 'Clan already exists.');

            kosData.clans.push(formattedClan);
            saveData();
            confirmPing(msg, `Clan added: ${formattedClan}`);
        }

        // Handle Remove
        else if (action === 'remove') {
            const index = kosData.clans.indexOf(formattedClan);
            if (index === -1) return confirmPing(msg, 'Clan not found.');

            kosData.clans.splice(index, 1);
            saveData();
            confirmPing(msg, `Clan removed: ${formattedClan}`);
        } else {
            return confirmPing(msg, 'Invalid action. Use add or remove.');
        }

        // Update KOS list immediately
        if(kosData.listData.channelId) {
            const ch = await client.channels.fetch(kosData.listData.channelId).catch(()=>null);
            if(ch) updateKosList(ch);
        }
    }
});
