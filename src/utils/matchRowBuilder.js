// Firebase stateJSON → 로그_매치 rows 빌더.
// 풋살 / 축구 공통 스키마로 정규화.

// our_members_json 직렬화: 휴식 정보가 있으면 객체 형식, 없으면 기존 배열 형식 (호환 유지).
//   - 휴식 있음 : { "players": ["A","B","C"], "absent": ["C"] }
//   - 휴식 없음 : ["A","B","C"]
export function serializeMembers(players, absent) {
  if (!Array.isArray(players)) return JSON.stringify([]);
  const absList = Array.isArray(absent) ? absent.filter(p => players.includes(p)) : [];
  if (absList.length === 0) return JSON.stringify(players);
  return JSON.stringify({ players, absent: absList });
}

export const RAW_MATCH_COLUMNS = [
  'team', 'sport', 'mode', 'tournament_id',
  'date', 'game_id', 'match_idx',
  'round_idx', 'court_id', 'match_id',
  'our_team_name', 'opponent_team_name',
  'our_members_json', 'opponent_members_json',
  'our_score', 'opponent_score',
  'our_gk', 'opponent_gk',
  'formation', 'our_defenders_json',
  'is_extra', 'input_time',
];

function parseMatchIdFutsal(matchId) {
  // R{n}_C{m} (schedule) / P{n}_C0 (push) / F{n}_C{m} (free) 모두 지원
  const m = String(matchId || '').match(/^[RPF](\d+)_C(\d+)$/);
  if (!m) return { round_idx: null, court_id: null };
  return { round_idx: parseInt(m[1], 10), court_id: parseInt(m[2], 10) };
}

/**
 * 풋살 stateJSON → 로그_매치 rows.
 * @param {{ team, mode, tournamentId, date, stateJSON, inputTime }} input
 */
export function buildRoundRowsFromFutsal({ team, mode = '기본', tournamentId = '', date, stateJSON, inputTime }) {
  if (!stateJSON || !Array.isArray(stateJSON.completedMatches)) return [];
  const teams = stateJSON.teams || [];
  const gameId = stateJSON.gameId || '';
  return stateJSON.completedMatches.map((m, idx) => {
    const { round_idx, court_id } = parseMatchIdFutsal(m.matchId);
    // 라운드별 명단 스냅샷이 저장돼 있으면 그걸 사용 (용병 포함). 구버전 데이터는 현재 teams로 폴백.
    const home = (Array.isArray(m.homePlayers) && m.homePlayers.length > 0)
      ? m.homePlayers : (teams[m.homeIdx] || []);
    const away = (Array.isArray(m.awayPlayers) && m.awayPlayers.length > 0)
      ? m.awayPlayers : (teams[m.awayIdx] || []);
    return {
      team, sport: '풋살', mode, tournament_id: tournamentId,
      date: date || '',
      game_id: gameId,
      match_idx: idx + 1,
      round_idx, court_id,
      match_id: m.matchId || '',
      our_team_name: m.homeTeam || '',
      opponent_team_name: m.awayTeam || '',
      our_members_json: serializeMembers(home, m.homeAbsent || []),
      opponent_members_json: serializeMembers(away, m.awayAbsent || []),
      our_score: Number(m.homeScore) || 0,
      opponent_score: Number(m.awayScore) || 0,
      our_gk: m.homeGk || '',
      opponent_gk: m.awayGk || '',
      formation: '',
      our_defenders_json: JSON.stringify([]),
      is_extra: !!m.isExtra,
      input_time: inputTime || '',
    };
  });
}

/**
 * 축구 stateJSON → 로그_매치 rows.
 * @param {{ team, mode, tournamentId, date, stateJSON, inputTime }} input
 */
export function buildRoundRowsFromSoccer({ team, mode = '기본', tournamentId = '', date, stateJSON, inputTime }) {
  if (!stateJSON || !Array.isArray(stateJSON.soccerMatches)) return [];
  return stateJSON.soccerMatches.map(m => {
    const startedAt = m.startedAt;
    const gameId = startedAt ? `s_${startedAt}` : `s_${date}_${m.matchIdx}`;
    const startingPlayers = (m.lineup || []).filter(Boolean); // lineup은 선수 이름 문자열 배열
    const subInPlayers = (m.events || [])
      .filter(e => e.type === 'sub' && e.playerIn)
      .map(e => e.playerIn);
    const allMembers = Array.from(new Set([...startingPlayers, ...subInPlayers]));
    return {
      team, sport: '축구', mode, tournament_id: tournamentId,
      date: date || '',
      game_id: gameId,
      match_idx: m.matchIdx,
      round_idx: null, court_id: null,
      match_id: String(m.matchIdx),
      our_team_name: team,
      opponent_team_name: m.opponent || '',
      our_members_json: JSON.stringify(allMembers),
      opponent_members_json: JSON.stringify([]),
      our_score: Number(m.ourScore) || 0,
      opponent_score: Number(m.opponentScore) || 0,
      our_gk: m.gk || '',
      opponent_gk: '',
      formation: m.formation || '',
      our_defenders_json: JSON.stringify(m.defenders || []),
      is_extra: false,
      input_time: inputTime || '',
    };
  });
}
