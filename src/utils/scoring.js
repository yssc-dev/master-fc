/**
 * @typedef {Object} PlayerData
 * @property {string} name - 선수 이름
 * @property {number} point - 누적 포인트
 * @property {number} games - 경기 수
 * @property {number|null} backNum - 등번호
 * @property {number} goals - 골 수
 * @property {number} assists - 어시스트 수
 * @property {number} ownGoals - 자책골 수
 * @property {number} crova - 크로바(MVP) 횟수
 * @property {number} goguma - 고구마(꼴지) 횟수
 * @property {number} cleanSheets - 클린시트 횟수
 * @property {number} keeperGames - 키퍼 경기 수
 * @property {number} conceded - 실점 수
 * @property {number} concededRate - 실점률
 */

/**
 * @typedef {Object} GameEvent
 * @property {string} matchId - 매치 식별자 (예: "R1_C0")
 * @property {string} type - 이벤트 타입 ("goal" | "owngoal")
 * @property {string} player - 관련 선수 이름
 * @property {string|null} assist - 어시스트 선수 이름
 * @property {string} team - 이벤트 발생 팀
 * @property {string} scoringTeam - 득점 팀
 * @property {string} concedingTeam - 실점 팀
 * @property {string} concedingGk - 실점 키퍼 이름
 * @property {number} concedingGkLoss - 키퍼 실점 수 (goal: 1, owngoal: 2)
 * @property {string} homeTeam - 홈 팀명
 * @property {string} awayTeam - 어웨이 팀명
 * @property {string} [courtId] - 코트 식별자
 * @property {number} [timestamp] - 이벤트 시각
 */

/** @param {string} name @param {PlayerData[]} players @returns {number} */
export function getPlayerPoint(name, players) {
  const p = players.find(x => x.name === name);
  return p ? p.point : 0;
}

/** @param {string} name @param {PlayerData[]} players @returns {PlayerData} */
export function getPlayerData(name, players) {
  return players.find(x => x.name === name) || { name, point: 0, games: 0, backNum: null };
}

/** @param {string[]} members @param {PlayerData[]} players @returns {number} */
export function teamPower(members, players) {
  return members.reduce((sum, p) => sum + getPlayerPoint(p, players), 0);
}

/**
 * 경기 점수 계산 (자책골은 상대팀에 +2로 집계)
 * @param {GameEvent[]} events - 전체 이벤트 배열
 * @param {string} matchId - 매치 식별자
 * @param {string} teamName - 점수를 계산할 팀명
 * @returns {number} 해당 팀의 득점
 */
export function calcMatchScore(events, matchId, teamName) {
  return events
    .filter(e => e.matchId === matchId && e.scoringTeam === teamName)
    .reduce((s, e) => s + (e.type === "owngoal" ? 2 : 1), 0);
}
