// 통합 로우 로그 (로그_이벤트, 로그_선수경기) 쓰기용 row 빌더 모음.
// React/DOM 의존성 없음. Apps Script 스키마와 1:1 대응.

export const RAW_EVENT_COLUMNS = [
  "team", "sport", "mode", "tournament_id",
  "date", "match_id", "our_team", "opponent",
  "event_type", "player", "related_player", "position",
  "input_time",
];

export const RAW_PLAYER_GAME_COLUMNS = [
  "team", "sport", "mode", "tournament_id", "date",
  "player", "session_team",
  "games", "field_games", "keeper_games",
  "goals", "assists", "owngoals", "conceded", "cleansheets",
  "crova", "goguma", "역주행", "rank_score",
  "input_time",
];

/**
 * 풋살 pointEvents → 로그_이벤트 rows
 * @param {{ team:string, events:Array<object> }} input
 * @returns {Array<object>} RAW_EVENT_COLUMNS 스키마 row 배열
 */
export function buildRawEventsFromFutsal({ team, events }) {
  const out = [];
  (events || []).forEach(e => {
    const common = {
      team, sport: '풋살', mode: '기본', tournament_id: '',
      date: e.gameDate || '', match_id: e.matchId || '',
      our_team: e.myTeam || '', opponent: e.opponentTeam || '',
      position: '', input_time: e.inputTime || '',
    };
    if (e.scorer) {
      out.push({ ...common, event_type: 'goal', player: e.scorer, related_player: e.assist || '' });
    } else if (e.ownGoalPlayer) {
      out.push({ ...common, event_type: 'ownGoal', player: e.ownGoalPlayer, related_player: '' });
    } else if (e.concedingGk) {
      out.push({ ...common, event_type: 'concede', player: e.concedingGk, related_player: '' });
    }
  });
  return out;
}

/**
 * 풋살 playerData → 로그_선수경기 rows
 */
export function buildRawPlayerGamesFromFutsal({ team, inputTime, players }) {
  return (players || []).map(p => ({
    team, sport: '풋살', mode: '기본', tournament_id: '',
    date: p.gameDate || '', player: p.name || '', session_team: p.playerTeam || '',
    games: 0, field_games: 0, keeper_games: Number(p.keeperGames) || 0,
    goals: Number(p.goals) || 0,
    assists: Number(p.assists) || 0,
    owngoals: Number(p.owngoals) || 0,
    conceded: Number(p.conceded) || 0,
    cleansheets: Number(p.cleanSheets) || 0,
    crova: Number(p.crova) || 0,
    goguma: Number(p.goguma) || 0,
    역주행: Number(p.역주행) || 0,
    rank_score: Number(p.rankScore) || 0,
    input_time: inputTime || '',
  }));
}

const SOCCER_EVENT_MAP = {
  '출전': 'lineup',
  '골': 'goal',
  '자책골': 'ownGoal',
  '실점': 'concede',
  '교체': 'sub',
};

/**
 * 축구 이벤트로그 row → 로그_이벤트 rows (기본/대회 공통)
 * @param {{ team, mode, tournamentId, events }} input
 */
export function buildRawEventsFromSoccer({ team, mode = '기본', tournamentId = '', events }) {
  const out = [];
  (events || []).forEach(e => {
    const type = SOCCER_EVENT_MAP[e.event];
    if (!type) return;
    out.push({
      team, sport: '축구', mode, tournament_id: tournamentId || '',
      date: e.gameDate || '', match_id: String(e.matchNum ?? ''),
      our_team: team, opponent: e.opponent || '',
      event_type: type,
      player: e.player || '', related_player: e.relatedPlayer || '',
      position: e.position || '', input_time: e.inputTime || '',
    });
  });
  return out;
}
