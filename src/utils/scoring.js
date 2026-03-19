export function getPlayerPoint(name, players) {
  const p = players.find(x => x.name === name);
  return p ? p.point : 0;
}

export function getPlayerData(name, players) {
  return players.find(x => x.name === name) || { name, point: 0, games: 0, backNum: null };
}

export function teamPower(members, players) {
  return members.reduce((sum, p) => sum + getPlayerPoint(p, players), 0);
}

export function calcMatchScore(events, matchId, teamName) {
  return events
    .filter(e => e.matchId === matchId && e.scoringTeam === teamName)
    .reduce((s, e) => s + (e.type === "owngoal" ? 2 : 1), 0);
}
