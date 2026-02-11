// Adding a player
function addPlayer(name, username, authorId) {
  const exists = data.players.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (exists) return false;
  data.players.push({ name, username, addedBy: authorId });
  data.players.sort((a,b)=>a.name.localeCompare(b.name));
  saveData();
  updateListMessages();
  return true;
}

// Removing a player
function removePlayer(name, author) {
  const player = data.players.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (!player) return false;
  // Permission check
  if (player.addedBy !== author.id && !author.roles.cache.has("1412837397607092405")) return "nopermission";
  data.players = data.players.filter(p => p.name.toLowerCase() !== name.toLowerCase());
  saveData();
  updateListMessages();
  return true;
}

// Similar logic for clans
function addClan(name, region, authorId) {
  const exists = data.clans.find(c => c.name.toLowerCase() === name.toLowerCase() && c.region.toLowerCase() === region.toLowerCase());
  if (exists) return false;
  data.clans.push({ name, region, addedBy: authorId });
  data.clans.sort((a,b)=>a.name.localeCompare(b.name));
  saveData();
  updateListMessages();
  return true;
}

function removeClan(name, region, author) {
  const clan = data.clans.find(c => c.name.toLowerCase() === name.toLowerCase() && c.region.toLowerCase() === region.toLowerCase());
  if (!clan) return false;
  if (clan.addedBy !== author.id && !author.roles.cache.has("1412837397607092405")) return "nopermission";
  data.clans = data.clans.filter(c => !(c.name.toLowerCase()===name.toLowerCase() && c.region.toLowerCase()===region.toLowerCase()));
  saveData();
  updateListMessages();
  return true;
}
