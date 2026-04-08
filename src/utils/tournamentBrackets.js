// src/utils/tournamentBrackets.js

/**
 * 풀리그: 우리팀 경기만 생성 (각 상대팀과 1번씩)
 * @param {string[]} teams - 참가팀 목록
 * @param {string} ourTeam - 우리팀 이름
 */
export function generateFullLeague(teams, ourTeam) {
  const matches = [];
  let matchNum = 1;
  for (const team of teams) {
    if (team === ourTeam) continue;
    matches.push({ matchNum: matchNum++, round: "", home: ourTeam, away: team });
  }
  return matches;
}

/**
 * 녹아웃: 우리팀 첫 경기만 생성 (이후 경기는 승리 시 추가)
 */
export function generateKnockout(teams, ourTeam) {
  const opponents = teams.filter(t => t !== ourTeam);
  if (opponents.length === 0) return [];
  return [{ matchNum: 1, round: "1R", home: ourTeam, away: opponents[0] }];
}

/**
 * 수동: 빈 경기 슬롯 생성
 */
export function generateManual(matchCount, ourTeam) {
  return Array.from({ length: matchCount }, (_, i) => ({
    matchNum: i + 1, round: "", home: ourTeam || "", away: "",
  }));
}
