// N×N 시너지 매트릭스: 같은팀 출전 라운드의 팀승률
export function calcSynergyMatrix({ matchLogs, minRounds = 5 }) {
  const playerSet = new Set();
  const cells = {};
  const bump = (key, outcome) => {
    if (!cells[key]) cells[key] = { games: 0, wins: 0, draws: 0, losses: 0 };
    cells[key].games++;
    if (outcome === 'W') cells[key].wins++;
    else if (outcome === 'D') cells[key].draws++;
    else cells[key].losses++;
  };

  for (const m of matchLogs || []) {
    let members;
    try {
      const parsed = JSON.parse(m.our_members_json || '[]');
      members = Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && x) : null;
    } catch { continue; }
    if (!members || members.length === 0) continue;
    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    const outcome = our > opp ? 'W' : (our === opp ? 'D' : 'L');

    members.forEach(n => playerSet.add(n));
    for (const name of members) bump(`${name}|${name}`, outcome);
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const [a, b] = [members[i], members[j]].sort((x, y) => x.localeCompare(y, 'ko'));
        bump(`${a}|${b}`, outcome);
      }
    }
  }

  for (const k of Object.keys(cells)) {
    const c = cells[k];
    c.winRate = c.games > 0 ? (c.wins + 0.5 * c.draws) / c.games : 0;
  }

  return {
    players: [...playerSet].sort((a, b) => a.localeCompare(b, 'ko')),
    cells,
    minRounds,
  };
}
