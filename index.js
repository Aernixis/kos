// ---------------- KOS LIST UPDATE ----------------
let listUpdateQueue = Promise.resolve();
let listUpdating = false;

async function updateKosList(channel) {
  if (!channel) return;

  listUpdateQueue = listUpdateQueue.then(async () => {
    if (listUpdating) return;
    listUpdating = true;

    const sections = [
      { key: 'playersMessageId', title: '–––––– PLAYERS ––––––', content: formatPlayers() },
      { key: 'priorityMessageId', title: '–––––– PRIORITY ––––––', content: formatPriority() },
      { key: 'clansMessageId', title: '–––––– CLANS ––––––', content: formatClans() }
    ];

    for (const section of sections) {
      try {
        let msg;
        const formatted = '```' + section.title + '\n' + section.content + '\n```';
        if (section.key && data.listData[section.key]) {
          msg = await channel.messages.fetch(data.listData[section.key]).catch(()=>null);
          if (msg) {
            if (msg.content !== formatted) await msg.edit({ content: formatted });
            continue;
          }
        }
        msg = await channel.send({ content: formatted });
        if (section.key) data.listData[section.key] = msg.id;
      } catch(e){ console.error('KOS update error', e); }
    }

    saveData();
    listUpdating = false;
  }).catch(console.error);

  return listUpdateQueue;
}

// ---------------- PREFIX COMMANDS ----------------
client.on('messageCreate', async msg => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith('^')) return;
  if (msg._kosProcessed) return;
  msg._kosProcessed = true;

  const argsRaw = msg.content.trim().split(/\s+/);
  let cmd = argsRaw.shift().toLowerCase();
  let args = [...argsRaw];

  // Normalize aliases
  if (cmd === '^kos') {
    const sub = args.shift()?.toLowerCase();
    if (sub === 'add') cmd = '^ka';
    else if (sub === 'remove') cmd = '^kr';
    else if (sub === 'clan') {
      const clanSub = args.shift()?.toLowerCase();
      if (clanSub === 'add') cmd = '^kca';
      else if (clanSub === 'remove') cmd = '^kcr';
    }
  } else if (cmd === '^priority') {
    const sub = args.shift()?.toLowerCase();
    if (sub === 'add') cmd = '^pa';
    else if (sub === 'remove') cmd = '^pr';
    else cmd = '^p';
  }

  // Submission channel check
  if (data.listData.channelId && msg.channel.id !== data.listData.channelId) {
    if (['^ka','^kr','^p','^pa','^pr','^kca','^kcr'].includes(cmd)) {
      const botMsg = await msg.channel.send(`Use KOS commands in <#${data.listData.channelId}>.`);
      setTimeout(()=>{ botMsg.delete().catch(()=>{}); msg.delete().catch(()=>{}); },3000);
      return;
    }
  }

  let changed = false;
  let actionText = '';

  // ---- PLAYER ----
  if (cmd === '^ka') {
    const name = args.shift();
    const username = args.shift();
    if (!name || !username) return;
    if (!data.players.some(p => p.name===name && p.username===username)) {
      data.players.push({name, username, addedBy: msg.author.id});
      changed = true;
      actionText = `Added ${name} : ${username}`;
    }
  }
  if (cmd === '^kr') {
    const name = args.shift();
    const username = args.shift() || null;
    if (!name) return;
    const before = data.players.length;
    data.players = data.players.filter(p => !(p.name===name && (username?p.username===username:true)));
    data.priority = data.priority.filter(p => p!==name);
    if (before !== data.players.length) { changed = true; actionText = `Removed ${name}${username?` : ${username}`:''}`; }
  }

  // ---- CLAN ----
  if (cmd === '^kca') {
    const name = args.shift();
    const region = args.shift();
    if (!name || !region) return;
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    if (!data.clans.includes(clan)) { data.clans.push(clan); changed=true; actionText=`Added clan ${clan}`; }
  }
  if (cmd === '^kcr') {
    const name = args.shift();
    const region = args.shift();
    if (!name || !region) return;
    const clan = `${region.toUpperCase()}»${name.toUpperCase()}`;
    const before = data.clans.length;
    data.clans = data.clans.filter(c=>c!==clan);
    if (before!==data.clans.length) { changed=true; actionText=`Removed clan ${clan}`; }
  }

  // ---- PRIORITY ----
  if (['^p','^pa'].includes(cmd)) {
    const name = args.join(' ');
    if (!name) return;
    if (!canUsePriority(msg)) {
      const botMsg = await msg.channel.send(`<@${msg.author.id}> You don't have permission to use this command.`);
      setTimeout(()=>{ botMsg.delete().catch(()=>{}); msg.delete().catch(()=>{}); },3000);
      return;
    }
    if (!data.priority.includes(name)) { data.priority.push(name); changed=true; actionText=`Added ${name} to priority`; }
  }
  if (cmd==='^pr') {
    const name = args.join(' ');
    if (!name) return;
    if (!canUsePriority(msg)) {
      const botMsg = await msg.channel.send(`<@${msg.author.id}> You don't have permission to use this command.`);
      setTimeout(()=>{ botMsg.delete().catch(()=>{}); msg.delete().catch(()=>{}); },3000);
      return;
    }
    const before = data.priority.length;
    data.priority = data.priority.filter(p=>p!==name);
    if (before!==data.priority.length){ changed=true; actionText=`Removed ${name} from priority`; }
  }

  if (!changed) return;

  saveData();

  // Update KOS list but **do not send confirmation inside updateKosList**
  updateKosList(msg.channel).catch(console.error);

  // --- send only ONE confirmation message ---
  if (actionText){
    const botMsg = await msg.channel.send(`<@${msg.author.id}> ${actionText}`);
    setTimeout(()=>{ botMsg.delete().catch(()=>{}); msg.delete().catch(()=>{}); },3000);
  }
});
