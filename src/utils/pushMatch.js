// src/utils/pushMatch.js

/**
 * 밀어내기 초기 pushState를 생성한다.
 * @param {number} teamCount - 팀 수
 * @returns {object} 초기 pushState
 */
export function createInitialPushState(teamCount) {
  const teamPlayCounts = {};
  const teamTotalGoals = {};
  for (let i = 0; i < teamCount; i++) {
    teamPlayCounts[i] = 0;
    teamTotalGoals[i] = 0;
  }
  return {
    winStreak: null,
    teamPlayCounts,
    teamTotalGoals,
    lastLoser: null,
    forcedRest: null,
    suggestedMatch: { home: 0, away: 1 },
  };
}

/**
 * 경기 결과를 반영하여 다음 pushState(다음 대진 제안 포함)를 계산한다.
 *
 * @param {object} prevState - 현재 pushState
 * @param {object} matchResult - { homeIdx, awayIdx, homeScore, awayScore }
 * @param {number} teamCount - 총 팀 수
 * @param {string[]} teamNames - 팀 이름 배열 (정렬 기준용)
 * @returns {object} 갱신된 pushState
 */
export function calcNextPushMatch(prevState, matchResult, teamCount, teamNames) {
  const { homeIdx, awayIdx, homeScore, awayScore } = matchResult;

  const getScore = (idx) => idx === homeIdx ? homeScore : awayScore;

  // 1. 출전횟수, 득점 갱신
  const teamPlayCounts = { ...prevState.teamPlayCounts };
  const teamTotalGoals = { ...prevState.teamTotalGoals };
  teamPlayCounts[homeIdx] = (teamPlayCounts[homeIdx] || 0) + 1;
  teamPlayCounts[awayIdx] = (teamPlayCounts[awayIdx] || 0) + 1;
  teamTotalGoals[homeIdx] = (teamTotalGoals[homeIdx] || 0) + homeScore;
  teamTotalGoals[awayIdx] = (teamTotalGoals[awayIdx] || 0) + awayScore;

  // 2. 승패 판정
  let winnerIdx = null;
  let loserIdx = null;
  if (homeScore > awayScore) { winnerIdx = homeIdx; loserIdx = awayIdx; }
  else if (awayScore > homeScore) { winnerIdx = awayIdx; loserIdx = homeIdx; }
  // 무승부면 둘 다 null

  // 3. 연승 처리
  let winStreak = null;
  let forcedRest = null;
  let stayTeam = null; // 잔류하는 팀

  if (winnerIdx !== null && getScore(winnerIdx) >= 2) {
    // 승리팀 득점 >= 2: 잔류
    const prevStreak = prevState.winStreak;
    const isSameTeam = prevStreak && prevStreak.teamIdx === winnerIdx;
    const newCount = isSameTeam ? prevStreak.count + 1 : 1;

    if (newCount >= 3) {
      // 3연승: 강제 휴식
      winStreak = null;
      forcedRest = winnerIdx;
      stayTeam = null; // 둘 다 빠짐
    } else {
      winStreak = { teamIdx: winnerIdx, count: newCount };
      stayTeam = winnerIdx;
    }
  }
  // 그 외 (무승부, 1:0 등): winStreak = null, stayTeam = null

  // 4. 다음 대진 후보 결정
  const excluded = new Set();
  if (loserIdx !== null) excluded.add(loserIdx);
  if (forcedRest !== null) excluded.add(forcedRest);
  // 무승부/1:0일때 두 팀 다 제외
  if (stayTeam === null && forcedRest === null) {
    excluded.add(homeIdx);
    excluded.add(awayIdx);
  }

  let candidates = [];
  for (let i = 0; i < teamCount; i++) {
    if (i === stayTeam) continue; // 잔류팀은 후보에서 제외 (이미 확정)
    if (!excluded.has(i)) candidates.push(i);
  }

  // 엣지 케이스: 후보 부족 시 제한 완화
  const needed = stayTeam !== null ? 1 : 2;
  if (candidates.length < needed) {
    // lastLoser 제한 해제
    if (loserIdx !== null) excluded.delete(loserIdx);
    candidates = [];
    for (let i = 0; i < teamCount; i++) {
      if (i === stayTeam) continue;
      if (!excluded.has(i)) candidates.push(i);
    }
  }
  if (candidates.length < needed) {
    // forcedRest 제한도 해제
    if (forcedRest !== null) excluded.delete(forcedRest);
    candidates = [];
    for (let i = 0; i < teamCount; i++) {
      if (i === stayTeam) continue;
      if (!excluded.has(i)) candidates.push(i);
    }
  }
  if (candidates.length < needed) {
    // 모든 제한 해제 (3팀 무승부 등)
    candidates = [];
    for (let i = 0; i < teamCount; i++) {
      if (i === stayTeam) continue;
      candidates.push(i);
    }
  }

  // 5. 우선순위 정렬: 출전횟수 적은 순 → 다득점 순 → 팀이름순
  candidates.sort((a, b) => {
    const playDiff = (teamPlayCounts[a] || 0) - (teamPlayCounts[b] || 0);
    if (playDiff !== 0) return playDiff;
    const goalDiff = (teamTotalGoals[b] || 0) - (teamTotalGoals[a] || 0);
    if (goalDiff !== 0) return goalDiff;
    return (teamNames[a] || "").localeCompare(teamNames[b] || "", "ko");
  });

  // 6. 대진 구성
  let suggestedMatch;
  if (stayTeam !== null) {
    suggestedMatch = { home: stayTeam, away: candidates[0] };
  } else {
    suggestedMatch = { home: candidates[0], away: candidates[1] };
  }

  return {
    winStreak,
    teamPlayCounts,
    teamTotalGoals,
    lastLoser: loserIdx,
    forcedRest,
    suggestedMatch,
  };
}
