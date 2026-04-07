// src/utils/gameStateAnalyzer.js

export function parseGameHistory(history) {
  const records = [];
  for (const h of history) {
    if (!h.stateJson) continue;
    let gs;
    try { gs = JSON.parse(h.stateJson); } catch { continue; }
    if (!gs.completedMatches || !gs.teams || !gs.teamNames) continue;
    records.push({
      gameDate: h.gameDate,
      teams: gs.teams || [],
      teamNames: gs.teamNames || [],
      attendees: gs.attendees || [],
      matches: (gs.completedMatches || []).map(m => ({
        matchId: m.matchId, homeIdx: m.homeIdx, awayIdx: m.awayIdx,
        homeTeam: m.homeTeam, awayTeam: m.awayTeam,
        homeScore: m.homeScore, awayScore: m.awayScore,
        homeGk: m.homeGk || "", awayGk: m.awayGk || "",
        isExtra: m.isExtra || false,
      })),
      events: (gs.allEvents || []).map(e => ({
        type: e.type, matchId: e.matchId, player: e.player,
        assist: e.assist, timestamp: e.timestamp,
        scoringTeam: e.scoringTeam, concedingTeam: e.concedingTeam,
      })),
    });
  }
  return records;
}

export function calcDefenseStats(gameRecords) {
  const stats = {};
  for (const gr of gameRecords) {
    for (const m of gr.matches) {
      if (m.isExtra) continue;
      const homeTeam = gr.teams[m.homeIdx] || [];
      const awayTeam = gr.teams[m.awayIdx] || [];
      homeTeam.forEach(p => {
        if (p === m.homeGk) return;
        if (!stats[p]) stats[p] = { fieldMatches: 0, totalConceded: 0 };
        stats[p].fieldMatches++;
        stats[p].totalConceded += m.awayScore;
      });
      awayTeam.forEach(p => {
        if (p === m.awayGk) return;
        if (!stats[p]) stats[p] = { fieldMatches: 0, totalConceded: 0 };
        stats[p].fieldMatches++;
        stats[p].totalConceded += m.homeScore;
      });
    }
  }
  Object.values(stats).forEach(s => {
    s.avgConceded = s.fieldMatches > 0 ? s.totalConceded / s.fieldMatches : 0;
  });
  return stats;
}

export function calcWinContribution(gameRecords) {
  const stats = {};
  for (const gr of gameRecords) {
    for (const m of gr.matches) {
      if (m.isExtra) continue;
      const homeTeam = gr.teams[m.homeIdx] || [];
      const awayTeam = gr.teams[m.awayIdx] || [];
      const homeWin = m.homeScore > m.awayScore;
      const draw = m.homeScore === m.awayScore;
      homeTeam.forEach(p => {
        if (!stats[p]) stats[p] = { matches: 0, wins: 0, draws: 0, losses: 0 };
        stats[p].matches++;
        if (homeWin) stats[p].wins++; else if (draw) stats[p].draws++; else stats[p].losses++;
      });
      awayTeam.forEach(p => {
        if (!stats[p]) stats[p] = { matches: 0, wins: 0, draws: 0, losses: 0 };
        stats[p].matches++;
        if (!homeWin && !draw) stats[p].wins++; else if (draw) stats[p].draws++; else stats[p].losses++;
      });
    }
  }
  Object.values(stats).forEach(s => {
    s.winRate = s.matches > 0 ? (s.wins + s.draws * 0.5) / s.matches : 0;
  });
  return stats;
}

export function calcSynergy(gameRecords) {
  const synergy = {};
  for (const gr of gameRecords) {
    for (const m of gr.matches) {
      if (m.isExtra) continue;
      const homeTeam = gr.teams[m.homeIdx] || [];
      const awayTeam = gr.teams[m.awayIdx] || [];
      const homeWin = m.homeScore > m.awayScore;
      const draw = m.homeScore === m.awayScore;
      const processTeam = (team, isWin) => {
        for (let i = 0; i < team.length; i++) {
          for (let j = i + 1; j < team.length; j++) {
            const a = team[i], b = team[j];
            if (!synergy[a]) synergy[a] = {};
            if (!synergy[a][b]) synergy[a][b] = { games: 0, wins: 0, draws: 0, losses: 0 };
            if (!synergy[b]) synergy[b] = {};
            if (!synergy[b][a]) synergy[b][a] = { games: 0, wins: 0, draws: 0, losses: 0 };
            synergy[a][b].games++; synergy[b][a].games++;
            if (isWin) { synergy[a][b].wins++; synergy[b][a].wins++; }
            else if (draw) { synergy[a][b].draws++; synergy[b][a].draws++; }
            else { synergy[a][b].losses++; synergy[b][a].losses++; }
          }
        }
      };
      processTeam(homeTeam, homeWin);
      processTeam(awayTeam, !homeWin && !draw);
    }
  }
  Object.values(synergy).forEach(partners => {
    Object.values(partners).forEach(s => {
      s.winRate = s.games > 0 ? (s.wins + s.draws * 0.5) / s.games : 0;
    });
  });
  return synergy;
}

export function calcTimePattern(gameRecords) {
  const SPLIT_MINUTES = 10;
  const stats = {};
  for (const gr of gameRecords) {
    const firstTimestamp = {};
    for (const e of gr.events) {
      if (!e.timestamp) continue;
      if (!firstTimestamp[e.matchId] || e.timestamp < firstTimestamp[e.matchId]) {
        firstTimestamp[e.matchId] = e.timestamp;
      }
    }
    for (const e of gr.events) {
      if (e.type !== "goal" || !e.player || !e.timestamp) continue;
      const first = firstTimestamp[e.matchId];
      if (!first) continue;
      const minutes = (e.timestamp - first) / 60000;
      if (!stats[e.player]) stats[e.player] = { early: 0, late: 0, total: 0 };
      if (minutes < SPLIT_MINUTES) stats[e.player].early++;
      else stats[e.player].late++;
      stats[e.player].total++;
    }
  }
  return stats;
}

export function percentile(values, value, lowerIsBetter = false) {
  if (values.length === 0) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  let rank = sorted.findIndex(v => v >= value);
  if (rank === -1) rank = sorted.length;
  const pct = (rank / sorted.length) * 100;
  return lowerIsBetter ? 100 - pct : pct;
}
