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
  const SPLIT_MS = 60 * 60 * 1000; // 1시간
  const stats = {};
  for (const gr of gameRecords) {
    // 해당 경기일의 모든 이벤트에서 가장 빠른 시간 = 경기 시작 시점
    const allGoals = gr.events.filter(e => e.type === "goal" && e.player && e.timestamp);
    if (allGoals.length === 0) continue;
    const gameStart = Math.min(...allGoals.map(e => e.timestamp));
    for (const e of allGoals) {
      if (!stats[e.player]) stats[e.player] = { early: 0, late: 0, total: 0 };
      if (e.timestamp - gameStart < SPLIT_MS) stats[e.player].early++;
      else stats[e.player].late++;
      stats[e.player].total++;
    }
  }
  return stats;
}

/**
 * 포인트로그에서 승리기여 추출 (stateJSON 없을 때 대체용)
 * 골/어시 기록이 있는 선수만 해당 경기 참여로 간주
 */
export function calcWinStatsFromPointLog(events) {
  // 경기별(date+matchId) 스코어 재구성
  const matches = {};
  for (const e of events) {
    if (!e.date || !e.matchId) continue;
    const key = `${e.date}_${e.matchId}`;
    if (!matches[key]) matches[key] = { ourGoals: 0, opponentGoals: 0, players: new Set() };
    if (e.scorer && e.scorer !== "OG") {
      matches[key].ourGoals++;
      matches[key].players.add(e.scorer);
    }
    if (e.assist) matches[key].players.add(e.assist);
    if (e.ownGoal) {
      matches[key].opponentGoals++;
      matches[key].players.add(e.ownGoal);
    }
    // 실점(상대골) — concedingGk가 있고 scorer가 없는 이벤트
    if (e.concedingGk && !e.scorer) {
      matches[key].opponentGoals++;
      matches[key].players.add(e.concedingGk);
    }
  }
  const stats = {};
  for (const m of Object.values(matches)) {
    const isWin = m.ourGoals > m.opponentGoals;
    const isDraw = m.ourGoals === m.opponentGoals;
    for (const p of m.players) {
      if (!stats[p]) stats[p] = { matches: 0, wins: 0, draws: 0, losses: 0 };
      stats[p].matches++;
      if (isWin) stats[p].wins++;
      else if (isDraw) stats[p].draws++;
      else stats[p].losses++;
    }
  }
  Object.values(stats).forEach(s => {
    s.winRate = s.matches > 0 ? (s.wins + s.draws * 0.5) / s.matches : 0;
  });
  return stats;
}

/**
 * 대시보드 members에서 수비력 추출 (stateJSON 없을 때 대체용)
 * 클린시트/전체경기 비율을 avgConceded 역수 형태로 변환
 */
export function calcDefenseFromMembers(members) {
  const stats = {};
  for (const m of members) {
    if (!m.name || !m.games) continue;
    const csRate = m.games > 0 ? m.cleanSheets / m.games : 0;
    // avgConceded 근사: (1 - csRate) * 보정값. 클린시트 비율이 높을수록 실점이 낮음
    stats[m.name] = {
      fieldMatches: m.games - (m.keeperGames || 0),
      totalConceded: m.conceded || 0,
      avgConceded: (m.games - (m.keeperGames || 0)) > 0
        ? (m.conceded || 0) / (m.games - (m.keeperGames || 0))
        : 0,
    };
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
