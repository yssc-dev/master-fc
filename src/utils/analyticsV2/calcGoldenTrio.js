// 케미 스코어 TOP N
// 같은 팀으로 뛴 라운드의 듀오 승률에서 둘의 개인 평균 승률을 뺀 값
// 양수일수록 "둘이 같이 뛰면 평소보다 잘함"
// our_members_json + opponent_members_json 모두 처리, (date, match_id)로 dedupe
export function calcGoldenTrio({ matchLogs, minRounds = 3, topN = 5 }) {
  const pairs = {};
  const players = {};

  const parseMembers = (s) => {
    try {
      const parsed = JSON.parse(s || '[]');
      return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && x) : [];
    } catch { return []; }
  };

  const seenIndividual = {}; // playerName -> Set<roundKey>
  const seenPair = {};       // pairKey -> Set<roundKey>

  const bumpPlayer = (name, outcome, roundKey) => {
    if (!seenIndividual[name]) seenIndividual[name] = new Set();
    if (seenIndividual[name].has(roundKey)) return;
    seenIndividual[name].add(roundKey);
    if (!players[name]) players[name] = { games: 0, wins: 0, draws: 0, losses: 0 };
    players[name].games++;
    if (outcome === 'W') players[name].wins++;
    else if (outcome === 'D') players[name].draws++;
    else players[name].losses++;
  };

  const bumpPair = (key, outcome, ref) => {
    const roundKey = `${ref.date}|${ref.match_id}`;
    if (!seenPair[key]) seenPair[key] = new Set();
    if (seenPair[key].has(roundKey)) return;
    seenPair[key].add(roundKey);
    if (!pairs[key]) pairs[key] = { games: 0, wins: 0, draws: 0, losses: 0, matches: [] };
    pairs[key].games++;
    if (outcome === 'W') pairs[key].wins++;
    else if (outcome === 'D') pairs[key].draws++;
    else pairs[key].losses++;
    pairs[key].matches.push({ ...ref, outcome });
  };

  for (const m of matchLogs || []) {
    const home = parseMembers(m.our_members_json);
    const away = parseMembers(m.opponent_members_json);
    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    const homeOutcome = our > opp ? 'W' : (our === opp ? 'D' : 'L');
    const awayOutcome = opp > our ? 'W' : (our === opp ? 'D' : 'L');
    const roundKey = `${m.date}|${m.match_id}`;

    const homeRef = { date: m.date, match_id: m.match_id, side: 'home', team: m.our_team_name, opponent: m.opponent_team_name, our, opp };
    const awayRef = { date: m.date, match_id: m.match_id, side: 'away', team: m.opponent_team_name, opponent: m.our_team_name, our: opp, opp: our };

    const tally = (members, outcome, ref) => {
      if (members.length === 0) return;
      for (const name of members) bumpPlayer(name, outcome, roundKey);
      if (members.length < 2) return;
      const sorted = [...members].sort((a, b) => a.localeCompare(b, 'ko'));
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          bumpPair(`${sorted[i]}|${sorted[j]}`, outcome, ref);
        }
      }
    };

    tally(home, homeOutcome, homeRef);
    tally(away, awayOutcome, awayRef);
  }

  const playerWinRate = (name) => {
    const p = players[name];
    if (!p || p.games === 0) return 0;
    return (p.wins + 0.5 * p.draws) / p.games;
  };

  return Object.entries(pairs)
    .filter(([, v]) => v.games >= minRounds)
    .map(([key, v]) => {
      const [a, b] = key.split('|');
      const pairWR = (v.wins + 0.5 * v.draws) / v.games;
      const indivAvg = (playerWinRate(a) + playerWinRate(b)) / 2;
      return {
        members: [a, b],
        games: v.games, wins: v.wins, draws: v.draws, losses: v.losses,
        winRate: pairWR,
        indivAvg,
        chemistry: pairWR - indivAvg,
        matches: v.matches,
      };
    })
    .sort((a, b) => b.chemistry - a.chemistry || b.games - a.games)
    .slice(0, topN);
}
