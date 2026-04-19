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
      date: e.gameDate, match_id: e.matchId,
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
