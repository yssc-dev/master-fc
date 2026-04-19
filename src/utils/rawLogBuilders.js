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
