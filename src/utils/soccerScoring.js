/**
 * 경기 스코어 계산
 * @param {Array} events - 경기 이벤트 배열
 * @returns {{ ourScore: number, opponentScore: number }}
 */
export function calcSoccerScore(events) {
  let ourScore = 0, opponentScore = 0;
  for (const e of (events || [])) {
    if (e.type === "goal" || e.type === "opponentOwnGoal") ourScore++;
    else if (e.type === "owngoal" || e.type === "opponentGoal") opponentScore++;
  }
  return { ourScore, opponentScore };
}

/** 단일 경기 결과 라벨 (우리팀 기준) */
export function soccerResultLabel(ourScore, opponentScore) {
  return ourScore > opponentScore ? "승" : ourScore < opponentScore ? "패" : "무";
}

/**
 * 오늘 팀 전적 집계 (우리팀 기준, 휴식 경기 제외) — 상대별 전적의 합계
 * @returns {{ played, wins, draws, losses, gf, ga }}
 */
export function calcSoccerTeamRecord(soccerMatches) {
  return calcSoccerOpponentRecords(soccerMatches).reduce((acc, r) => ({
    played: acc.played + r.played,
    wins: acc.wins + r.wins,
    draws: acc.draws + r.draws,
    losses: acc.losses + r.losses,
    gf: acc.gf + r.gf,
    ga: acc.ga + r.ga,
  }), { played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 });
}

/**
 * 상대별 전적 집계 (우리팀 기준, 휴식 제외) — 승점/득실 순 정렬
 * @returns {Array<{opponent, played, wins, draws, losses, gf, ga}>}
 */
export function calcSoccerOpponentRecords(soccerMatches) {
  const map = {};
  for (const m of (soccerMatches || [])) {
    if (m.status !== "finished" || m.opponent === "휴식") continue;
    const opp = m.opponent;
    if (!map[opp]) map[opp] = { opponent: opp, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };
    const { ourScore, opponentScore } = calcSoccerScore(m.events || []);
    const r = map[opp];
    r.played++; r.gf += ourScore; r.ga += opponentScore;
    if (ourScore > opponentScore) r.wins++;
    else if (ourScore < opponentScore) r.losses++;
    else r.draws++;
  }
  return Object.values(map).sort((a, b) =>
    ((b.wins * 3 + b.draws) - (a.wins * 3 + a.draws)) ||
    ((b.gf - b.ga) - (a.gf - a.ga)) ||
    (b.gf - a.gf)
  );
}

/**
 * 클린시트 대상 선수 목록 (무실점 경기 시 GK + 모든 DF)
 * 교체로 나간 DF/GK도 포함
 */
export function getCleanSheetPlayers(match) {
  const { ourScore, opponentScore } = calcSoccerScore(match.events);
  if (opponentScore > 0) return [];
  const csPlayers = new Set();
  if (match.gk) csPlayers.add(match.gk);
  (match.defenders || []).forEach(d => csPlayers.add(d));
  for (const e of (match.events || [])) {
    if (e.type === "sub" && (e.position === "GK" || e.position === "DF")) {
      csPlayers.add(e.playerIn);
    }
  }
  return [...csPlayers];
}

/**
 * 경기별 선수 통계 집계
 */
export function calcSoccerPlayerStats(soccerMatches) {
  const stats = {};
  const ensure = (name) => {
    if (!stats[name]) stats[name] = { games: 0, fieldGames: 0, keeperGames: 0, goals: 0, assists: 0, owngoals: 0, cleanSheets: 0, conceded: 0 };
  };
  for (const match of soccerMatches) {
    if (match.status !== "finished") continue;
    const allPlayed = new Set(match.lineup || []);
    for (const e of (match.events || [])) {
      if (e.type === "sub") allPlayed.add(e.playerIn);
    }
    const csPlayers = getCleanSheetPlayers(match);
    for (const name of allPlayed) {
      ensure(name);
      stats[name].games++;
      const wasGk = name === match.gk || (match.events || []).some(e => e.type === "sub" && e.playerIn === name && e.position === "GK");
      if (wasGk) stats[name].keeperGames++;
      else stats[name].fieldGames++;
      if (csPlayers.includes(name)) stats[name].cleanSheets++;
    }
    for (const e of (match.events || [])) {
      if (e.type === "goal") {
        ensure(e.player); stats[e.player].goals++;
        if (e.assist) { ensure(e.assist); stats[e.assist].assists++; }
      }
      if (e.type === "owngoal") { ensure(e.player); stats[e.player].owngoals++; }
      if (e.type === "opponentGoal" && e.currentGk) { ensure(e.currentGk); stats[e.currentGk].conceded++; }
    }
  }
  return stats;
}

/**
 * 선수별 포인트 계산
 */
export function calcSoccerPlayerPoint(playerStat, settings) {
  const { goals, assists, owngoals, cleanSheets } = playerStat;
  return goals + assists + (owngoals * settings.ownGoalPoint) + (cleanSheets * settings.cleanSheetPoint);
}

/**
 * 이벤트로그 시트용 로우 데이터 빌드
 */
export function buildEventLogRows(soccerMatches, gameDate) {
  const rows = [];
  for (const match of soccerMatches) {
    if (match.status !== "finished") continue;
    const matchNum = match.matchIdx + 1;
    const opponent = match.opponent;
    for (const name of (match.lineup || [])) {
      // 정확한 포지션은 positionMap 우선, 없으면 gk/defenders로 폴백(MF가 FW로 잘못 기록되던 문제 수정)
      let position = (match.positionMap && match.positionMap[name]) || "";
      if (!position) {
        if (name === match.gk) position = "GK";
        else if ((match.defenders || []).includes(name)) position = "DF";
        else position = "FW";
      }
      rows.push({
        gameDate, matchNum, opponent,
        event: "출전", player: name, relatedPlayer: "", position,
        inputTime: new Date(match.startedAt).toLocaleString("ko-KR"),
      });
    }
    const sorted = [...(match.events || [])].sort((a, b) => a.timestamp - b.timestamp);
    for (const e of sorted) {
      if (e.type === "goal") {
        rows.push({ gameDate, matchNum, opponent, event: "골", player: e.player, relatedPlayer: e.assist || "", position: "", inputTime: new Date(e.timestamp).toLocaleString("ko-KR") });
      } else if (e.type === "owngoal") {
        rows.push({ gameDate, matchNum, opponent, event: "자책골", player: e.player, relatedPlayer: "", position: "", inputTime: new Date(e.timestamp).toLocaleString("ko-KR") });
      } else if (e.type === "opponentGoal") {
        rows.push({ gameDate, matchNum, opponent, event: "실점", player: e.currentGk || "", relatedPlayer: "", position: "GK", inputTime: new Date(e.timestamp).toLocaleString("ko-KR") });
      } else if (e.type === "sub") {
        rows.push({ gameDate, matchNum, opponent, event: "교체", player: e.playerIn, relatedPlayer: e.playerOut, position: e.position || "", inputTime: new Date(e.timestamp).toLocaleString("ko-KR") });
      }
    }
  }
  return rows;
}

/**
 * 포인트로그 시트용 로우 데이터 빌드
 */
export function buildPointLogRows(soccerMatches, gameDate, inputTime) {
  const rows = [];
  for (const match of soccerMatches) {
    if (match.status !== "finished") continue;
    const matchNum = match.matchIdx + 1;
    for (const e of (match.events || [])) {
      if (e.type === "goal") {
        rows.push({ gameDate, matchId: String(matchNum), opponent: match.opponent, scorer: e.player, assist: e.assist || "", conceded: "", ownGoalPlayer: "", inputTime });
      } else if (e.type === "owngoal") {
        rows.push({ gameDate, matchId: String(matchNum), opponent: match.opponent, scorer: "OG", assist: "", conceded: "", ownGoalPlayer: e.player, inputTime });
      } else if (e.type === "opponentGoal") {
        rows.push({ gameDate, matchId: String(matchNum), opponent: match.opponent, scorer: "", assist: "", conceded: "실점", ownGoalPlayer: "", inputTime });
      }
    }
  }
  return rows;
}

/**
 * 선수별집계기록로그 시트용 로우 데이터 빌드
 */
export function buildPlayerLogRows(soccerMatches, gameDate, inputTime) {
  const stats = calcSoccerPlayerStats(soccerMatches);
  return Object.entries(stats).map(([name, s]) => ({
    gameDate, name,
    games: s.games, fieldGames: s.fieldGames, keeperGames: s.keeperGames,
    goals: s.goals, assists: s.assists, cleanSheets: s.cleanSheets,
    conceded: s.conceded, owngoals: s.owngoals,
    inputTime,
  }));
}
