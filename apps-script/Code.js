// ═══════════════════════════════════════════════════════════════
// 풋살 웹앱 Apps Script v2.0
//
// CHANGELOG
// 2026-04-28: reimportPointLog 액션 추가 (HTTP 노출, 풋살/축구 디스패치)
// 2026-04-28: _importTournamentEventLogs — owngoal 정규화 + concede_gk 필드 추가 (누락 수정)
// 2026-04-28: _readSoccerPointSchema 통합 스키마 변환 + event_type owngoal 정규화 + concede_gk 필드 추가
// 2026-04-28: 로그_이벤트 스키마 변경 — concede_gk 컬럼 추가, goal/owngoal 행에 실점 GK 통합 기록
// 2026-04-28: deleteRawEventsByDate 액션 추가 (로그_이벤트 날짜별 삭제)
// 2026-04-08: 응답 표준화, 입력 검증, 팀 접근 제어, LockService 동시성 제어 (v2)
//
// 배포: 배포 관리 → 편집 → 새 버전 (URL 고정 유지)
// ═══════════════════════════════════════════════════════════════

var STATE_SHEET_NAME = "앱_경기상태";
var AUTH_SHEET_NAME = "회원인증";
var POINT_LOG_SHEET = "";
var PLAYER_LOG_SHEET = "";

var RAW_EVENTS_SHEET = "로그_이벤트";
var RAW_PLAYER_GAMES_SHEET = "로그_선수경기";
var RAW_MATCHES_SHEET = "로그_매치";

var RAW_EVENTS_HEADERS = [
  "team","sport","mode","tournament_id",
  "date","match_id","our_team","opponent",
  "event_type","player","related_player","concede_gk","position",
  "input_time","game_id"
];

var RAW_MATCHES_HEADERS = [
  "team","sport","mode","tournament_id",
  "date","game_id","match_idx",
  "round_idx","court_id","match_id",
  "our_team_name","opponent_team_name",
  "our_members_json","opponent_members_json",
  "our_score","opponent_score",
  "our_gk","opponent_gk",
  "formation","our_defenders_json",
  "is_extra","input_time"
];

var RAW_PLAYER_GAMES_HEADERS = [
  "team","sport","mode","tournament_id","date",
  "player","session_team",
  "games","field_games","keeper_games",
  "goals","assists","owngoals","conceded","cleansheets",
  "crova","goguma","역주행","rank_score",
  "input_time"
];

function _ensureRawSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var created = [];
  var ev = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!ev) {
    ev = ss.insertSheet(RAW_EVENTS_SHEET);
    ev.getRange(1, 1, 1, RAW_EVENTS_HEADERS.length).setValues([RAW_EVENTS_HEADERS]);
    ev.getRange(1, 1, 1, RAW_EVENTS_HEADERS.length).setFontWeight("bold");
    created.push(RAW_EVENTS_SHEET);
  }
  var pg = ss.getSheetByName(RAW_PLAYER_GAMES_SHEET);
  if (!pg) {
    pg = ss.insertSheet(RAW_PLAYER_GAMES_SHEET);
    pg.getRange(1, 1, 1, RAW_PLAYER_GAMES_HEADERS.length).setValues([RAW_PLAYER_GAMES_HEADERS]);
    pg.getRange(1, 1, 1, RAW_PLAYER_GAMES_HEADERS.length).setFontWeight("bold");
    created.push(RAW_PLAYER_GAMES_SHEET);
  }
  var mt = ss.getSheetByName(RAW_MATCHES_SHEET);
  if (!mt) {
    mt = ss.insertSheet(RAW_MATCHES_SHEET);
    mt.getRange(1, 1, 1, RAW_MATCHES_HEADERS.length).setValues([RAW_MATCHES_HEADERS]);
    mt.getRange(1, 1, 1, RAW_MATCHES_HEADERS.length).setFontWeight("bold");
    created.push(RAW_MATCHES_SHEET);
  }
  return { created: created };
}

function _ensureEventLogHasGameId() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) { _ensureRawSheets(); sheet = ss.getSheetByName(RAW_EVENTS_SHEET); }
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf("game_id") >= 0) {
    if (sheet.getLastColumn() < RAW_EVENTS_HEADERS.length) {
      sheet.getRange(1, 1, 1, RAW_EVENTS_HEADERS.length).setValues([RAW_EVENTS_HEADERS]);
    }
    return { success: true, added: false };
  }
  var newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue("game_id");
  sheet.getRange(1, newCol).setFontWeight("bold");
  return { success: true, added: true, col: newCol };
}

function _backupSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(sheetName);
  if (!src) return { success: false, error: "시트 없음: " + sheetName };
  var stamp = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyyMMdd_HHmm");
  var backupName = sheetName + "_백업_" + stamp;
  if (ss.getSheetByName(backupName)) {
    return { success: true, name: backupName, skipped: true };
  }
  var copy = src.copyTo(ss);
  copy.setName(backupName);
  return { success: true, name: backupName, skipped: false };
}

// ─── 한국시간 헬퍼 ───

function _kstNow() {
  return Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd'T'HH:mm:ss'+09:00'");
}

function _kstDate() {
  return Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd");
}

// 셀 값을 yyyy-MM-dd 문자열로 변환 (Date 객체, "2026. 1. 15", "2026-01-15" 등 모두 처리)
function _toDateStr(val) {
  if (val instanceof Date) return Utilities.formatDate(val, "Asia/Seoul", "yyyy-MM-dd");
  var s = String(val).trim();
  // "2026. 1. 15" or "2026.1.15" 형태 처리
  var m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
  return s;
}

// ─── 공통 헬퍼 ───

function _jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function _errorResponse(message, extra) {
  var resp = { success: false, error: message };
  if (extra) {
    for (var k in extra) resp[k] = extra[k];
  }
  return _jsonResponse(resp);
}

function _successResponse(data) {
  if (!data) data = {};
  data.success = true;
  return _jsonResponse(data);
}

// ─── 인증 토큰 파싱 (팀+이름+번호 추출) ───

function _parseAuthToken(token) {
  if (!token) return null;
  var parts = token.split(":");
  // 새 형식: "팀이름:이름:번호"
  if (parts.length === 3) {
    var result = _verifyAuth(parts[1], parts[2]);
    if (result.success) return { team: parts[0], name: parts[1], phone4: parts[2] };
  }
  // 이전 형식: "이름:번호"
  if (parts.length === 2) {
    var result = _verifyAuth(parts[0], parts[1]);
    if (result.success) return { team: "", name: parts[0], phone4: parts[1] };
  }
  return null;
}

function _verifyAuthToken(token) {
  return _parseAuthToken(token) !== null;
}

// 팀 접근 제어: 토큰의 팀과 요청 팀이 일치하는지 확인
function _checkTeamAccess(authInfo, requestTeam) {
  if (!authInfo || !authInfo.team) return true; // 이전 형식이면 제한 없음
  if (!requestTeam) return true;
  return authInfo.team === requestTeam;
}

// ═══════════════════════════════════════════════════════════════
// 라우터
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "ping";

    if (action === "ping") {
      return _jsonResponse({ success: true, time: _kstNow() });
    }

    // 인증
    var authToken = (e && e.parameter && e.parameter.authToken) || "";
    var authInfo = _parseAuthToken(authToken);
    if (!authInfo) return _errorResponse("인증 실패", { authRequired: true });

    var team = (e && e.parameter && e.parameter.team) || "";

    // 팀 접근 제어
    if (!_checkTeamAccess(authInfo, team)) {
      return _errorResponse("다른 팀의 데이터에 접근할 수 없습니다");
    }

    if (action === "loadState") {
      return _jsonResponse(_loadGameState(team));
    } else if (action === "getHistory") {
      return _jsonResponse(_getHistory(team));
    } else if (action === "getCumulativeBonus") {
      return _jsonResponse(_getCumulativeBonus(team));
    }

    return _errorResponse("Unknown action: " + action);
  } catch (err) {
    return _errorResponse(err.message);
  }
}

function doPost(e) {
  try {
    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return _errorResponse("잘못된 요청 형식");
    }

    var action = body.action;

    // verifyAuth는 인증 불필요
    if (action === "verifyAuth") {
      return _jsonResponse(_verifyAuth(body.name, body.phone4));
    }

    // 그 외 액션은 인증 필요
    var authToken = body.authToken || "";
    var authInfo = _parseAuthToken(authToken);
    if (!authInfo) return _errorResponse("인증 실패", { authRequired: true });

    // 팀 접근 제어 (요청 body에서 team 추출)
    var requestTeam = body.team || (body.data && body.data.team) || "";
    if (!_checkTeamAccess(authInfo, requestTeam)) {
      return _errorResponse("다른 팀의 데이터에 접근할 수 없습니다");
    }

    if (action === "saveState") {
      return _jsonResponse(_saveGameState(body.state, body.team, body.gameId));
    } else if (action === "loadState") {
      return _jsonResponse(_loadGameState(requestTeam));
    } else if (action === "getHistory") {
      return _jsonResponse(_getHistory(requestTeam));
    } else if (action === "getCumulativeBonus") {
      return _jsonResponse(_getCumulativeBonus(requestTeam, body.playerLogSheet || ""));
    } else if (action === "getPointLog") {
      return _jsonResponse(_getPointLog(requestTeam, body.pointLogSheet || ""));
    } else if (action === "getPlayerLog") {
      return _jsonResponse(_getPlayerLog(requestTeam, body.playerLogSheet || ""));
    } else if (action === "getSheetList") {
      return _jsonResponse(_getSheetList());
    } else if (action === "getPrevRankings") {
      return _jsonResponse(_getPrevRankings(requestTeam, body.playerLogSheet || ""));
    } else if (action === "getRankingHistory") {
      return _jsonResponse(_getRankingHistory(requestTeam, body.allPlayers || [], body.playerLogSheet || ""));
    } else if (action === "clearState") {
      return _jsonResponse(_clearGameState(body.team, body.gameId));
    } else if (action === "finalizeState") {
      return _jsonResponse(_finalizeGameState(body.team, body.gameId, body.state));
    } else if (action === "writePointLog") {
      return _jsonResponse(_writePointLog(body.data, body.pointLogSheet || ""));
    } else if (action === "writePlayerLog") {
      return _jsonResponse(_writePlayerLog(body.data, body.playerLogSheet || ""));
    } else if (action === "writeEventLog") {
      return _jsonResponse(_writeEventLog(body.data, body.eventLogSheet || ""));
    } else if (action === "writeSoccerPointLog") {
      return _jsonResponse(_writeSoccerPointLog(body.data, body.pointLogSheet || ""));
    } else if (action === "writeSoccerPlayerLog") {
      return _jsonResponse(_writeSoccerPlayerLog(body.data, body.playerLogSheet || ""));
    } else if (action === "writeRawEvents") {
      return _jsonResponse(_writeRawEvents(body.data));
    } else if (action === "reimportPointLog") {
      return _jsonResponse(_reimportPointLog(body.team, body.sport, body.pointSheet));
    } else if (action === "writeRawPlayerGames") {
      return _jsonResponse(_writeRawPlayerGames(body.data));
    } else if (action === "deleteRawPlayerGamesByDate") {
      return _jsonResponse(_deleteRawPlayerGamesByDate(body.team, body.sport, body.date));
    } else if (action === "ensureEventLogHasGameId") {
      return _jsonResponse(_ensureEventLogHasGameId());
    } else if (action === "backupSheet") {
      return _jsonResponse(_backupSheet(body.sheetName));
    } else if (action === "writeRawMatches") {
      return _jsonResponse(_writeRawMatches(body.data));
    } else if (action === "deleteRawMatchesByDate") {
      return _jsonResponse(_deleteRawMatchesByDate(body.team, body.sport, body.date));
    } else if (action === "deleteRawEventsByDate") {
      return _jsonResponse(_deleteRawEventsByDate(body.team, body.sport, body.date));
    } else if (action === "getRawMatches") {
      return _jsonResponse(_getRawMatches(body.team, body.sport, body.dateFrom, body.dateTo));
    } else if (action === "getRawEvents") {
      return _jsonResponse(_getRawEvents(body.team, body.sport, body.dateFrom, body.dateTo));
    } else if (action === "getRawPlayerGames") {
      return _jsonResponse(_getRawPlayerGames(body.team, body.sport));
    } else if (action === "migrateEventTypes") {
      return _jsonResponse(migrateEventTypes());
    } else if (action === "migrateMatchIds") {
      return _jsonResponse(migrateMatchIds());
    } else if (action === "createTournament") {
      return _jsonResponse(_createTournament(body.data));
    } else if (action === "deleteTournament") {
      return _jsonResponse(_deleteTournament(body.tournamentId));
    } else if (action === "updateTournamentMatch") {
      return _jsonResponse(_updateTournamentMatch(body.tournamentId, body.matchNum, body.updates || {}));
    } else if (action === "getTournamentList") {
      return _jsonResponse(_getTournamentList(requestTeam));
    } else if (action === "getTournamentRoster") {
      return _jsonResponse(_getTournamentRoster(body.tournamentId));
    } else if (action === "getTournamentSchedule") {
      return _jsonResponse(_getTournamentSchedule(body.tournamentId, body.ourTeam || ""));
    } else if (action === "updateTournamentMatchScore") {
      return _jsonResponse(_updateTournamentMatchScore(body.tournamentId, body.matchNum, body.homeScore, body.awayScore));
    } else if (action === "writeTournamentEventLog") {
      return _jsonResponse(_writeTournamentEventLog(body.tournamentId, body.data));
    } else if (action === "writeTournamentPlayerRecord") {
      return _jsonResponse(_writeTournamentPlayerRecord(body.tournamentId, body.data));
    } else if (action === "getTournamentPlayerRecords") {
      return _jsonResponse(_getTournamentPlayerRecords(body.tournamentId));
    } else if (action === "getTournamentEventLog") {
      return _jsonResponse(_getTournamentEventLog(body.tournamentId));
    }

    return _errorResponse("Unknown action: " + action);
  } catch (err) {
    return _errorResponse(err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// 회원 인증
// 시트 컬럼: A=팀이름, B=모드, C=이름, D=휴대폰뒷자리, E=역할
// ═══════════════════════════════════════════════════════════════

function _getAuthSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(AUTH_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(AUTH_SHEET_NAME);
    sheet.getRange("A1:E1").setValues([["팀이름", "모드", "이름", "휴대폰뒷자리", "역할"]]);
    sheet.getRange("A1:E1").setFontWeight("bold");
  }
  return sheet;
}

function _verifyAuth(name, phone4) {
  if (!name || !phone4) return { success: false, message: "이름과 휴대폰 뒷자리를 입력하세요" };

  var sheet = _getAuthSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, message: "등록된 회원이 없습니다. 관리자에게 문의하세요" };

  var colCount = sheet.getLastColumn();
  var inputName = String(name).trim();
  var inputPhone = String(phone4).trim().replace(/^0+/, "");

  // 새 형식 (5컬럼: 팀이름, 모드, 이름, 휴대폰뒷자리, 역할)
  if (colCount >= 5) {
    var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    var teams = [];
    for (var i = 0; i < data.length; i++) {
      var regName = String(data[i][2]).trim();
      var regPhone = String(data[i][3]).trim().replace(/^0+/, "");
      if (regName === inputName && regPhone === inputPhone) {
        teams.push({
          team: String(data[i][0]).trim(),
          mode: String(data[i][1]).trim() || "풋살",
          role: String(data[i][4]).trim() || "멤버",
        });
      }
    }
    if (teams.length > 0) {
      return { success: true, name: inputName, teams: teams };
    }
    return { success: false, message: "이름 또는 번호가 일치하지 않습니다" };
  }

  // 이전 형식 호환 (2컬럼: 이름, 휴대폰뒷자리)
  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    var regName = String(data[i][0]).trim();
    var regPhone = String(data[i][1]).trim().replace(/^0+/, "");
    if (regName === inputName && regPhone === inputPhone) {
      return { success: true, name: regName };
    }
  }
  return { success: false, message: "이름 또는 번호가 일치하지 않습니다" };
}

// ═══════════════════════════════════════════════════════════════
// 경기 상태 관리 (LockService로 동시성 제어)
// 시트 컬럼: A=팀이름, B=경기일자, C=상태(진행중/확정), D=상태JSON, E=저장시간, F=요약
// ═══════════════════════════════════════════════════════════════

function _getOrCreateStateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STATE_SHEET_NAME);
    sheet.getRange("A1:F1").setValues([["팀이름", "경기일자", "상태", "상태JSON", "저장시간", "요약"]]);
    sheet.getRange("A1:F1").setFontWeight("bold");
  }
  return sheet;
}

// 팀+상태로 모든 행 찾기 (다중 경기 지원)
function _findAllStateRows(sheet, team, status) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === team && String(data[i][2]).trim() === status) {
      rows.push(i + 2);
    }
  }
  return rows;
}

// 팀+gameId로 특정 행 찾기 (state_json 내부의 gameId 매칭)
function _findStateRowByGameId(sheet, team, gameId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var colCount = sheet.getLastColumn();
  if (colCount < 6) return -1;
  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() !== team) continue;
    if (String(data[i][2]).trim() !== "진행중") continue;
    // 요약(F열)에서 gameId 매칭 (빠른 검색)
    if (gameId && String(data[i][5]).indexOf(gameId) >= 0) return i + 2;
    // 폴백: JSON 파싱
    if (gameId) {
      try {
        var s = JSON.parse(data[i][3]);
        if (s.gameId === gameId) return i + 2;
      } catch(e) {}
    }
  }
  return -1;
}

// 경기일자: gameId 타임스탬프(경기 생성 시점) 사용, 없으면 현재 날짜
function _stateRowGameDate(gameId) {
  var gameDate = _kstDate();
  if (gameId && gameId.indexOf("g_") === 0) {
    try {
      var ts = parseInt(gameId.substring(2), 10);
      if (ts > 0) gameDate = Utilities.formatDate(new Date(ts), "Asia/Seoul", "yyyy-MM-dd");
    } catch(e) {}
  }
  return gameDate;
}

function _stateRowSummary(gameId, state) {
  var evtCount = (state.allEvents || []).length;
  var matchCount = (state.completedMatches || []).length;
  var creator = state.gameCreator || state.lastEditor || "?";
  return gameId + " | " + creator + " | " + (state.phase || "?") + " | 이벤트 " + evtCount + "건 | 완료 " + matchCount + "경기";
}

function _saveGameState(state, team, gameId) {
  if (!state) return { success: false, error: "state is empty" };
  if (!team) team = "기본팀";
  if (!gameId) gameId = state.gameId || "";
  var gameDate = _stateRowGameDate(gameId);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, error: "다른 저장이 진행 중입니다. 잠시 후 다시 시도하세요" };

  try {
    var sheet = _getOrCreateStateSheet();
    var json = JSON.stringify(state);
    var now = _kstNow();
    var summary = _stateRowSummary(gameId, state);

    // gameId로 기존 행 찾기
    var row = gameId ? _findStateRowByGameId(sheet, team, gameId) : -1;
    if (row > 0) {
      sheet.getRange(row, 2, 1, 5).setValues([[gameDate, "진행중", json, now, summary]]);
    } else {
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, 1, 6).setValues([[team, gameDate, "진행중", json, now, summary]]);
    }

    return { success: true, savedAt: now, summary: summary };
  } finally {
    lock.releaseLock();
  }
}

function _loadGameState(team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_NAME);
  if (!sheet) return { success: true, found: false, games: [] };

  if (!team) team = "기본팀";

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, found: false, games: [] };

  var colCount = sheet.getLastColumn();

  if (colCount >= 6) {
    var rows = _findAllStateRows(sheet, team, "진행중");
    if (rows.length === 0) return { success: true, found: false, games: [] };

    var games = [];
    for (var r = 0; r < rows.length; r++) {
      var rowData = sheet.getRange(rows[r], 1, 1, 6).getValues()[0];
      var json = rowData[3];
      if (!json) continue;
      try {
        var state = JSON.parse(json);
        games.push({
          gameId: state.gameId || "legacy_" + r,
          state: state,
          savedAt: rowData[4] ? new Date(rowData[4]).toISOString() : null,
          summary: String(rowData[5]) || "",
        });
      } catch (e) { /* skip invalid */ }
    }

    // 하위호환: 단일 게임도 found 플래그 제공
    return { success: true, found: games.length > 0, games: games, state: games.length > 0 ? games[0].state : null, savedAt: games.length > 0 ? games[0].savedAt : null };
  }

  // 이전 형식 호환 (3컬럼)
  var json = sheet.getRange("A2").getValue();
  var savedAt = sheet.getRange("B2").getValue();
  if (!json) return { success: true, found: false, games: [] };
  try {
    var state = JSON.parse(json);
    var game = { gameId: state.gameId || "legacy", state: state, savedAt: savedAt ? String(savedAt) : null };
    return { success: true, found: true, games: [game], state: state, savedAt: game.savedAt };
  } catch (e) {
    return { success: false, found: false, games: [], error: "JSON 파싱 실패: " + e.message };
  }
}

function _clearGameState(team, gameId) {
  if (!team) team = "기본팀";

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(STATE_SHEET_NAME);
    if (!sheet) return { success: true, message: "시트 없음" };

    var colCount = sheet.getLastColumn();

    if (colCount >= 6) {
      var row = gameId ? _findStateRowByGameId(sheet, team, gameId) : -1;
      // gameId 없으면 첫 번째 "진행중" 삭제 (하위호환)
      if (row < 0) {
        var rows = _findAllStateRows(sheet, team, "진행중");
        row = rows.length > 0 ? rows[0] : -1;
      }
      if (row > 0) {
        sheet.deleteRow(row);
      }
      return { success: true, message: "상태 초기화 완료" };
    }

    sheet.getRange("A2:C2").clearContent();
    return { success: true, message: "상태 초기화 완료" };
  } finally {
    lock.releaseLock();
  }
}

// Firebase 단일화 이후 진행중 행이 없을 수 있으므로, state가 제공되면 확정 행을 신규 insert.
function _finalizeGameState(team, gameId, state) {
  if (!team) team = "기본팀";

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var sheet = _getOrCreateStateSheet();
    var colCount = sheet.getLastColumn();
    var now = _kstNow();

    if (colCount >= 6) {
      var row = gameId ? _findStateRowByGameId(sheet, team, gameId) : -1;
      if (row < 0) {
        var rows = _findAllStateRows(sheet, team, "진행중");
        row = rows.length > 0 ? rows[0] : -1;
      }

      if (row > 0) {
        if (state) {
          var gameDate = _stateRowGameDate(gameId);
          var json = JSON.stringify(state);
          var summary = _stateRowSummary(gameId, state);
          sheet.getRange(row, 2, 1, 5).setValues([[gameDate, "확정", json, now, summary]]);
        } else {
          sheet.getRange(row, 3).setValue("확정");
          sheet.getRange(row, 5).setValue(now);
        }
        return { success: true, message: "경기 확정 완료" };
      }

      if (state) {
        var gameDate2 = _stateRowGameDate(gameId);
        var json2 = JSON.stringify(state);
        var summary2 = _stateRowSummary(gameId, state);
        var lastRow = sheet.getLastRow();
        sheet.getRange(lastRow + 1, 1, 1, 6).setValues([[team, gameDate2, "확정", json2, now, summary2]]);
        return { success: true, message: "경기 확정 신규 저장" };
      }
      return { success: false, error: "진행중인 경기 없음 (state 없음)" };
    }

    sheet.getRange("A2:C2").clearContent();
    return { success: true, message: "경기 확정 완료 (이전 형식)" };
  } finally {
    lock.releaseLock();
  }
}

function _getHistory(team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_NAME);
  if (!sheet) return { success: true, history: [] };

  if (!team) team = "기본팀";

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, history: [] };

  var colCount = sheet.getLastColumn();
  if (colCount < 3) return { success: true, history: [] };

  // 최소 3열(team, date, status)만 있으면 동작, 부족한 열은 빈값 처리
  var readCols = Math.min(colCount, 6);
  var data = sheet.getRange(2, 1, lastRow - 1, readCols).getValues();
  var history = [];

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === team && String(data[i][2]).trim() === "확정") {
      history.push({
        team: String(data[i][0]).trim(),
        gameDate: String(data[i][1]).trim(),
        status: "확정",
        stateJson: data[i][3] ? String(data[i][3]) : "",
        savedAt: data[i][4] ? String(data[i][4]) : null,
        summary: data[i][5] ? String(data[i][5]) : "",
      });
    }
  }

  history.sort(function(a, b) {
    var d = b.gameDate.localeCompare(a.gameDate);
    if (d !== 0) return d;
    return (b.savedAt || "").localeCompare(a.savedAt || "");
  });

  return { success: true, history: history };
}

// ═══════════════════════════════════════════════════════════════
// 포인트로그 / 선수별집계 (입력 검증 + LockService)
// ═══════════════════════════════════════════════════════════════

function _validatePointLogEvent(e, idx) {
  var errors = [];
  if (!e.gameDate) errors.push("이벤트[" + idx + "]: gameDate 누락");
  if (!e.matchId) errors.push("이벤트[" + idx + "]: matchId 누락");
  if (!e.scorer && !e.ownGoalPlayer) errors.push("이벤트[" + idx + "]: scorer 또는 ownGoalPlayer 필요");
  return errors;
}

function _validatePlayerLogEntry(p, idx) {
  var errors = [];
  if (!p.gameDate) errors.push("선수[" + idx + "]: gameDate 누락");
  if (!p.name) errors.push("선수[" + idx + "]: name 누락");
  return errors;
}

function _writePointLog(data, sheetName) {
  if (!data) return { success: false, error: "data 누락" };
  var teamName = data.team || "";
  var rows = data.events || [];
  if (rows.length === 0) return { success: true, message: "이벤트 없음", count: 0 };

  // 입력 검증
  var allErrors = [];
  for (var i = 0; i < rows.length; i++) {
    var errs = _validatePointLogEvent(rows[i], i);
    allErrors = allErrors.concat(errs);
  }
  if (allErrors.length > 0) return { success: false, error: "검증 실패", details: allErrors };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetName = sheetName || POINT_LOG_SHEET;
    var sheet = ss.getSheetByName(targetName);
    if (!sheet) {
      sheet = ss.insertSheet(POINT_LOG_SHEET);
      sheet.getRange("A1:J1").setValues([["경기일자","경기번호","내팀","상대팀","득점선수","어시선수","자책골","실점키퍼명","입력시간","팀이름"]]);
      sheet.getRange("A1:J1").setFontWeight("bold");
    }

    var values = rows.map(function(e) {
      return [
        e.gameDate, e.matchId, e.myTeam || "", e.opponentTeam || "",
        e.scorer || "", e.assist || "", e.ownGoalPlayer || "",
        e.concedingGk || "", e.inputTime || _kstNow(), teamName,
      ];
    });

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 10).setValues(values);
    return { success: true, count: values.length };
  } finally {
    lock.releaseLock();
  }
}

function _writePlayerLog(data, sheetName) {
  if (!data) return { success: false, error: "data 누락" };
  var teamName = data.team || "";
  var rows = data.players || [];
  if (rows.length === 0) return { success: true, message: "선수 데이터 없음", count: 0 };

  // 입력 검증
  var allErrors = [];
  for (var i = 0; i < rows.length; i++) {
    var errs = _validatePlayerLogEntry(rows[i], i);
    allErrors = allErrors.concat(errs);
  }
  if (allErrors.length > 0) return { success: false, error: "검증 실패", details: allErrors };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetName = sheetName || PLAYER_LOG_SHEET;
    var sheet = ss.getSheetByName(targetName);
    if (!sheet) {
      sheet = ss.insertSheet(PLAYER_LOG_SHEET);
      sheet.getRange("A1:M1").setValues([["경기일자","선수명","골","어시","역주행","실점","클린시트","크로바","고구마","키퍼경기수","팀순위점수","입력시간","소속팀"]]);
      sheet.getRange("A1:M1").setFontWeight("bold");
    }

    var values = rows.map(function(p) {
      return [
        p.gameDate, p.name,
        Number(p.goals) || 0, Number(p.assists) || 0, Number(p.owngoals) || 0,
        Number(p.conceded) || 0, Number(p.cleanSheets) || 0,
        Number(p.crova) || 0, Number(p.goguma) || 0, Number(p.keeperGames) || 0,
        Number(p.rankScore) || 0, p.inputTime || _kstNow(), teamName,
      ];
    });

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 13).setValues(values);
    return { success: true, count: values.length };
  } finally {
    lock.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════
// 축구 이벤트로그 쓰기
// 컬럼: 경기일자, 경기번호, 상대팀명, 이벤트, 선수, 관련선수, 포지션, 입력시간
// ═══════════════════════════════════════════════════════════════

function _writeEventLog(data, sheetName) {
  if (!data) return { success: false, error: "data 누락" };
  var teamName = data.team || "";
  var rows = data.events || [];
  if (rows.length === 0) return { success: true, message: "이벤트 없음", count: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetName = sheetName || "축구_이벤트로그";
    var sheet = ss.getSheetByName(targetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetName);
      sheet.getRange("A1:H1").setValues([["경기일자","경기번호","상대팀명","이벤트","선수","관련선수","포지션","입력시간"]]);
      sheet.getRange("A1:H1").setFontWeight("bold");
    }

    var values = rows.map(function(e) {
      return [
        e.gameDate, e.matchNum || "", e.opponent || "",
        e.event || "", e.player || "", e.relatedPlayer || "",
        e.position || "", e.inputTime || _kstNow(),
      ];
    });

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 8).setValues(values);
    return { success: true, count: values.length };
  } finally {
    lock.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════
// 축구 포인트로그 쓰기
// 컬럼: 경기일자, 경기번호, 상대팀명, 득점, 어시, 실점, 자책골, 입력시간
// ═══════════════════════════════════════════════════════════════

function _writeSoccerPointLog(data, sheetName) {
  if (!data) return { success: false, error: "data 누락" };
  var teamName = data.team || "";
  var rows = data.events || [];
  if (rows.length === 0) return { success: true, message: "이벤트 없음", count: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetName = sheetName || "축구_포인트로그";
    var sheet = ss.getSheetByName(targetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetName);
      sheet.getRange("A1:H1").setValues([["경기일자","경기번호","상대팀명","득점","어시","실점","자책골","입력시간"]]);
      sheet.getRange("A1:H1").setFontWeight("bold");
    }

    var values = rows.map(function(e) {
      return [
        e.gameDate, e.matchId || "", e.opponent || "",
        e.scorer || "", e.assist || "", e.conceded || "",
        e.ownGoalPlayer || "", e.inputTime || _kstNow(),
      ];
    });

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 8).setValues(values);
    return { success: true, count: values.length };
  } finally {
    lock.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════
// 축구 선수별집계기록 쓰기
// 컬럼: 경기일자, 선수명, 전체경기, 필드경기, 키퍼경기, 골, 어시, 클린시트, 실점, 자책골, 입력시간
// ═══════════════════════════════════════════════════════════════

function _writeSoccerPlayerLog(data, sheetName) {
  if (!data) return { success: false, error: "data 누락" };
  var teamName = data.team || "";
  var rows = data.players || [];
  if (rows.length === 0) return { success: true, message: "선수 데이터 없음", count: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetName = sheetName || "축구_선수별집계기록로그";
    var sheet = ss.getSheetByName(targetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetName);
      sheet.getRange("A1:K1").setValues([["경기일자","선수명","전체경기","필드경기","키퍼경기","골","어시","클린시트","실점","자책골","입력시간"]]);
      sheet.getRange("A1:K1").setFontWeight("bold");
    }

    var values = rows.map(function(p) {
      return [
        p.gameDate, p.name,
        Number(p.games) || 0, Number(p.fieldGames) || 0, Number(p.keeperGames) || 0,
        Number(p.goals) || 0, Number(p.assists) || 0, Number(p.cleanSheets) || 0,
        Number(p.conceded) || 0, Number(p.owngoals) || 0,
        p.inputTime || _kstNow(),
      ];
    });

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 11).setValues(values);
    return { success: true, count: values.length };
  } finally {
    lock.releaseLock();
  }
}

function _writeRawEvents(data) {
  if (!data || !data.rows) return { success: false, error: "rows 누락" };
  _ensureRawSheets();
  var rows = data.rows;
  if (rows.length === 0) return { success: true, count: 0, skipped: 0 };
  // skipDedupe=true: Legacy import 용. 같은 (선수,경기,event_type,date,tid,team) 조합이
  // 정당하게 중복되는 케이스(헤딩골 2회 입력 등) 보존 위함. 재실행 전 _clearRawSheets 필수.
  var skipDedupe = data.skipDedupe === true;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
    var existingKeys = skipDedupe ? {} : _loadRawEventKeys(sheet);

    var toInsert = [];
    var skipped = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!skipDedupe) {
        var key = _rawEventKey(r);
        if (existingKeys[key]) { skipped++; continue; }
        existingKeys[key] = true;
      }
      toInsert.push(_rawEventToArray(r));
    }
    if (toInsert.length > 0) {
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      if (lastCol < RAW_EVENTS_HEADERS.length) {
        _ensureEventLogHasGameId();
      }
      sheet.getRange(lastRow + 1, 1, toInsert.length, RAW_EVENTS_HEADERS.length).setValues(toInsert);
    }
    return { success: true, count: toInsert.length, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

function _rawEventKey(r) {
  return [r.team||"", r.sport||"", r.mode||"", r.tournament_id||"", r.date||"", r.match_id||"",
    r.event_type||"", r.player||"", r.related_player||"", r.concede_gk||"", r.input_time||"", r.game_id||""].join("|");
}

function _rawEventToArray(r) {
  return [r.team||"", r.sport||"", r.mode||"", r.tournament_id||"",
    r.date||"", r.match_id||"", r.our_team||"", r.opponent||"",
    r.event_type||"", r.player||"", r.related_player||"", r.concede_gk||"", r.position||"",
    r.input_time||"", r.game_id||""];
}

function _loadRawEventKeys(sheet) {
  var lastRow = sheet.getLastRow();
  var keys = {};
  if (lastRow < 2) return keys;
  var lastCol = sheet.getLastColumn();
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var gidCol = headers.indexOf("game_id");
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var gid = gidCol >= 0 ? String(r[gidCol] || "") : "";
    var key = [r[0], r[1], r[2], r[3], _toDateStr(r[4]), r[5], r[8], r[9], r[10], String(r[11]||""), String(r[13]), gid].join("|");
    keys[key] = true;
  }
  return keys;
}

function _writeRawMatches(data) {
  if (!data || !data.rows) return { success: false, error: "rows 누락" };
  _ensureRawSheets();
  var rows = data.rows;
  if (rows.length === 0) return { success: true, count: 0, skipped: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(RAW_MATCHES_SHEET);
    var existingKeys = _loadRawMatchKeys(sheet);

    var toInsert = [];
    var skipped = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var key = (r.game_id || "") + "|" + (r.match_id || "");
      if (existingKeys[key]) { skipped++; continue; }
      existingKeys[key] = true;
      toInsert.push(_rawMatchToArray(r));
    }
    if (toInsert.length > 0) {
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, toInsert.length, RAW_MATCHES_HEADERS.length).setValues(toInsert);
    }
    return { success: true, count: toInsert.length, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

function _loadRawMatchKeys(sheet) {
  var lastRow = sheet.getLastRow();
  var keys = {};
  if (lastRow < 2) return keys;
  var data = sheet.getRange(2, 6, lastRow - 1, 5).getValues(); // game_id=col6, match_id=col10 → 6..10
  for (var i = 0; i < data.length; i++) {
    var key = (data[i][0] || "") + "|" + (data[i][4] || "");
    keys[key] = true;
  }
  return keys;
}

function _rawMatchToArray(r) {
  return [
    r.team||"", r.sport||"", r.mode||"", r.tournament_id||"",
    r.date||"", r.game_id||"", r.match_idx||0,
    r.round_idx===null||r.round_idx===undefined?"":r.round_idx,
    r.court_id===null||r.court_id===undefined?"":r.court_id,
    r.match_id||"",
    r.our_team_name||"", r.opponent_team_name||"",
    r.our_members_json||"[]", r.opponent_members_json||"[]",
    r.our_score||0, r.opponent_score||0,
    r.our_gk||"", r.opponent_gk||"",
    r.formation||"", r.our_defenders_json||"[]",
    r.is_extra===true, r.input_time||""
  ];
}

function _deleteRawPlayerGamesByDate(team, sport, date) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_PLAYER_GAMES_SHEET);
  if (!sheet) return { removed: 0 };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { removed: 0 };
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_PLAYER_GAMES_HEADERS.length).getValues();
  var removed = 0;
  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === team && data[i][1] === sport && _toDateStr(data[i][4]) === date) {
      sheet.deleteRow(i + 2);
      removed++;
    }
  }
  return { removed: removed };
}

function _deleteRawMatchesByDate(team, sport, date) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_MATCHES_SHEET);
  if (!sheet) return { removed: 0 };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { removed: 0 };
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_MATCHES_HEADERS.length).getValues();
  var removed = 0;
  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === team && data[i][1] === sport && _toDateStr(data[i][4]) === date) {
      sheet.deleteRow(i + 2);
      removed++;
    }
  }
  return { removed: removed };
}

function _deleteRawEventsByDate(team, sport, date) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) return { removed: 0 };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { removed: 0 };
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_EVENTS_HEADERS.length).getValues();
  var removed = 0;
  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === team && data[i][1] === sport && _toDateStr(data[i][4]) === date) {
      sheet.deleteRow(i + 2);
      removed++;
    }
  }
  return { removed: removed };
}

function _getRawMatches(team, sport, dateFrom, dateTo) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_MATCHES_SHEET);
  if (!sheet) { _ensureRawSheets(); sheet = ss.getSheetByName(RAW_MATCHES_SHEET); }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, rows: [] };
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_MATCHES_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (team && r[0] !== team) continue;
    if (sport && r[1] !== sport) continue;
    var d = _toDateStr(r[4]);
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;
    var row = {};
    for (var j = 0; j < RAW_MATCHES_HEADERS.length; j++) row[RAW_MATCHES_HEADERS[j]] = r[j];
    row.date = d;
    out.push(row);
  }
  return { success: true, rows: out };
}

function _getRawEvents(team, sport, dateFrom, dateTo) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) { _ensureRawSheets(); sheet = ss.getSheetByName(RAW_EVENTS_SHEET); }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, rows: [] };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (team && r[0] !== team) continue;
    if (sport && r[1] !== sport) continue;
    var d = _toDateStr(r[4]);
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;
    var row = {};
    for (var j = 0; j < headers.length; j++) row[headers[j]] = r[j];
    row.date = d;
    out.push(row);
  }
  return { success: true, rows: out };
}

function _getRawPlayerGames(team, sport) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_PLAYER_GAMES_SHEET);
  if (!sheet) return { success: true, rows: [] };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, rows: [] };
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_PLAYER_GAMES_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (team && r[0] !== team) continue;
    if (sport && r[1] !== sport) continue;
    var row = {};
    for (var j = 0; j < RAW_PLAYER_GAMES_HEADERS.length; j++) row[RAW_PLAYER_GAMES_HEADERS[j]] = r[j];
    row.date = _toDateStr(r[4]);
    out.push(row);
  }
  return { success: true, rows: out };
}

function migrateEventTypes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) return { success: false, error: "로그_이벤트 시트 없음" };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, updated: 0 };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = headers.indexOf("event_type") + 1;
  if (col < 1) return { success: false, error: "event_type 컬럼 없음" };
  var range = sheet.getRange(2, col, lastRow - 1, 1);
  var vals = range.getValues();
  var updated = 0;
  for (var i = 0; i < vals.length; i++) {
    var v = String(vals[i][0] || "");
    var next = v;
    if (v === "ownGoal") next = "owngoal";
    else if (v === "opponentGoal") next = "concede";
    if (next !== v) { vals[i][0] = next; updated++; }
  }
  if (updated > 0) range.setValues(vals);
  return { success: true, updated: updated };
}

function migrateMatchIds() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) return { success: false, error: "로그_이벤트 시트 없음" };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, updated: 0, unrecognized: [] };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var midCol = headers.indexOf("match_id") + 1;
  var sportCol = headers.indexOf("sport") + 1;
  if (midCol < 1 || sportCol < 1) return { success: false, error: "match_id/sport 컬럼 없음" };
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var updated = 0;
  var unrecognized = {};
  for (var i = 0; i < data.length; i++) {
    var raw = String(data[i][midCol - 1] || "").trim();
    var sport = String(data[i][sportCol - 1] || "").trim();
    var next = _normalizeMatchIdAS(raw, sport);
    if (next !== raw) {
      sheet.getRange(i + 2, midCol).setValue(next);
      updated++;
    } else if (raw && !_isStandardMatchId(raw, sport)) {
      unrecognized[raw] = (unrecognized[raw] || 0) + 1;
    }
  }
  return { success: true, updated: updated, unrecognized: unrecognized };
}

function _normalizeMatchIdAS(raw, sport) {
  if (!raw) return raw;
  var s = String(raw).trim();
  if (/^R\d+_C\d+$/.test(s)) return s;
  var m1 = s.match(/^(\d+)라운드\s*매치(\d+)$/);
  if (m1) return "R" + m1[1] + "_C" + (parseInt(m1[2], 10) - 1);
  // "1라운드 A구장" → R1_C0, "1라운드 B구장" → R1_C1 (코트 알파벳 인덱스)
  var m3 = s.match(/^(\d+)라운드\s*([A-Z])구장$/);
  if (m3) return "R" + m3[1] + "_C" + (m3[2].charCodeAt(0) - 65);
  var m2 = s.match(/^(\d+)경기$/);
  var n = m2 ? m2[1] : (/^\d+$/.test(s) ? s : null);
  if (n !== null) return sport === "풋살" ? "R" + n + "_C0" : n;
  return s;
}

function _isStandardMatchId(s, sport) {
  if (sport === "풋살") return /^R\d+_C\d+$/.test(s);
  return /^\d+$/.test(s);
}

function _writeRawPlayerGames(data) {
  if (!data || !data.rows) return { success: false, error: "rows 누락" };
  _ensureRawSheets();
  var rows = data.rows;
  if (rows.length === 0 && !data.replaceBy) return { success: true, count: 0, skipped: 0 };
  // skipDedupe=true: Legacy import 용. 같은 선수가 한 날짜에 복수 세션 기록된 케이스 보존.
  var skipDedupe = data.skipDedupe === true;
  // replaceBy={team, sport, mode, tournament_id}: 대회 재집계용.
  // 해당 스코프의 기존 행을 삭제한 뒤 새 rows insert.
  var replaceBy = data.replaceBy && typeof data.replaceBy === 'object' ? data.replaceBy : null;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(RAW_PLAYER_GAMES_SHEET);
    var removed = 0;
    if (replaceBy) removed = _removeRawPlayerGamesMatching(sheet, replaceBy);
    var existingKeys = (skipDedupe || replaceBy) ? {} : _loadRawPlayerGameKeys(sheet);

    var toInsert = [];
    var skipped = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!skipDedupe && !replaceBy) {
        var key = _rawPlayerGameKey(r);
        if (existingKeys[key]) { skipped++; continue; }
        existingKeys[key] = true;
      }
      toInsert.push(_rawPlayerGameToArray(r));
    }
    if (toInsert.length > 0) {
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, toInsert.length, RAW_PLAYER_GAMES_HEADERS.length).setValues(toInsert);
    }
    return { success: true, count: toInsert.length, skipped: skipped, removed: removed };
  } finally {
    lock.releaseLock();
  }
}

// replaceBy 스코프 (team, sport, mode, tournament_id) 매칭 기존 행 삭제. 반환: 삭제 건수.
function _removeRawPlayerGamesMatching(sheet, filter) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_PLAYER_GAMES_HEADERS.length).getValues();
  var ft = filter.team || "", fs = filter.sport || "", fm = filter.mode || "", fti = filter.tournament_id || "";
  var removed = 0;
  for (var i = data.length - 1; i >= 0; i--) {
    var r = data[i];
    if (r[0] === ft && r[1] === fs && r[2] === fm && r[3] === fti) {
      sheet.deleteRow(i + 2);
      removed++;
    }
  }
  return removed;
}

function _rawPlayerGameKey(r) {
  return [r.team||"", r.sport||"", r.mode||"", r.tournament_id||"", r.date||"", r.player||""].join("|");
}

function _rawPlayerGameToArray(r) {
  return [r.team||"", r.sport||"", r.mode||"", r.tournament_id||"",
    r.date||"", r.player||"", r.session_team||"",
    Number(r.games)||0, Number(r.field_games)||0, Number(r.keeper_games)||0,
    Number(r.goals)||0, Number(r.assists)||0, Number(r.owngoals)||0,
    Number(r.conceded)||0, Number(r.cleansheets)||0,
    Number(r.crova)||0, Number(r.goguma)||0, Number(r["역주행"])||0, Number(r.rank_score)||0,
    r.input_time||""];
}

function _loadRawPlayerGameKeys(sheet) {
  var lastRow = sheet.getLastRow();
  var keys = {};
  if (lastRow < 2) return keys;
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_PLAYER_GAMES_HEADERS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    // [team, sport, mode, tid, date, player, session_team, ...]
    var key = [r[0], r[1], r[2], r[3], _toDateStr(r[4]), r[5]].join("|");
    keys[key] = true;
  }
  return keys;
}

// ═══════════════════════════════════════════════════════════════
// 일회성 Legacy Import (기존 시트 read-only → 로그_이벤트/로그_선수경기 append)
// skipDedupe=true 로 write — 같은 (선수,경기,event_type,date,tid) 중복도 보존
// (헤딩골 같은 이벤트를 2번 입력한 케이스 등).
//
// 사용법 (Apps Script 편집기에서 _runImport 실행):
//   _importLegacyToRaw({
//     teams: [
//       { team: "마스터FC", pointSheet: "마스터FC 포인트 로그", pointSchema: "futsalPoint",
//         playerSheet: "마스터FC 선수별집계기록 로그", playerSchema: "futsalPlayer" },
//       { team: "하버FC",   pointSheet: "하버FC 포인트 로그",  pointSchema: "soccerPoint",
//         playerSheet: "하버FC 선수기록보관소",             playerSchema: "soccerPlayer" },
//     ],
//     includeTournaments: true   // 생략하면 true
//   });
//
// 주의사항:
//   - config.teams 필수. 빈 config로 호출하면 { error: "config.teams 필요" } 반환.
//   - **재실행 전 반드시 _clearRawSheets() 먼저 실행**. skipDedupe 모드라 중복 방지 안 됨.
//   - 신규 dual-write 경로 (doPost → _writeRawEvents)는 skipDedupe=false 로 정상 dedupe.
// ═══════════════════════════════════════════════════════════════

// ---------------------------------------------------------------
// 스키마별 Reader 함수 (각각 sheetName, team 인자를 받아 { rows, error? } 반환)
// ---------------------------------------------------------------

// 첫 5행 중 A열이 firstColExpected인 행을 헤더로 간주. 못 찾으면 1.
// 시트에 빈 상단 행(frozen row 용도)이 있는 경우에 대응.
function _findHeaderRow(sheet, firstColExpected) {
  var lastRow = sheet.getLastRow();
  var maxPeek = Math.min(lastRow, 5);
  if (maxPeek < 1) return 1;
  var peek = sheet.getRange(1, 1, maxPeek, 1).getValues();
  for (var i = 0; i < peek.length; i++) {
    if (String(peek[i][0] || "").trim() === firstColExpected) return i + 1;
  }
  return 1;
}

function _readFutsalPointSchema(sheetName, team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(sheetName);
  if (!src) return { rows: [], error: sheetName + " 없음" };
  var lastRow = src.getLastRow();
  if (lastRow < 2) return { rows: [] };
  var headerRow = _findHeaderRow(src, "경기일자");
  if (lastRow <= headerRow) return { rows: [] };
  // 헤더 검증: 인덱스 0-8 필수
  var headers = src.getRange(headerRow, 1, 1, Math.min(src.getLastColumn(), 10)).getValues()[0];
  var expectedBase = ["경기일자", "경기번호", "내팀", "상대팀"];
  var goalVariants = ["득점", "득점선수"];
  var assistVariants = ["어시", "어시선수"];
  var gkVariants = ["실점키퍼", "실점키퍼명"];
  // 인덱스 0-3 고정 검증
  for (var ci = 0; ci < expectedBase.length; ci++) {
    if (String(headers[ci] || "").trim() !== expectedBase[ci]) {
      return { rows: [], error: "헤더 불일치: expected " + expectedBase[ci] + ", got " + String(headers[ci] || "") };
    }
  }
  // 인덱스 4,5,6,7 유연 검증 (변형 허용)
  var h4 = String(headers[4] || "").trim();
  var h5 = String(headers[5] || "").trim();
  var h7 = String(headers[7] || "").trim();
  var validH4 = (h4 === goalVariants[0] || h4 === goalVariants[1]);
  var validH5 = (h5 === assistVariants[0] || h5 === assistVariants[1]);
  var validH7 = (h7 === gkVariants[0] || h7 === gkVariants[1]);
  if (!validH4) return { rows: [], error: "헤더 불일치: expected 득점/득점선수, got " + h4 };
  if (!validH5) return { rows: [], error: "헤더 불일치: expected 어시/어시선수, got " + h5 };
  if (String(headers[6] || "").trim() !== "자책골") return { rows: [], error: "헤더 불일치: expected 자책골, got " + String(headers[6] || "") };
  if (!validH7) return { rows: [], error: "헤더 불일치: expected 실점키퍼/실점키퍼명, got " + h7 };
  if (String(headers[8] || "").trim() !== "입력시간") return { rows: [], error: "헤더 불일치: expected 입력시간, got " + String(headers[8] || "") };

  var colCount = Math.min(src.getLastColumn(), 10);
  var data = src.getRange(headerRow + 1, 1, lastRow - headerRow, colCount).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var gameDate = _toDateStr(r[0]);
    var matchId = String(r[1] || "");
    var myTeam = String(r[2] || "");
    var opponent = String(r[3] || "");
    var scorer = String(r[4] || "");
    var assist = String(r[5] || "");
    var ownGoal = String(r[6] || "");
    var concedingGk = String(r[7] || "");
    var inputTime = r[8] instanceof Date ? Utilities.formatDate(r[8], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(r[8] || "");
    var common = {
      team: team, sport: "풋살", mode: "기본", tournament_id: "",
      date: gameDate, match_id: matchId, our_team: myTeam, opponent: opponent,
      position: "", input_time: inputTime
    };
    // 한 포인트로그 행 → 한 로그_이벤트 행 (concede_gk 컬럼에 실점 키퍼 통합)
    if (scorer) {
      rows.push({
        team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
        date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
        position: common.position, input_time: common.input_time,
        event_type: "goal", player: scorer, related_player: assist, concede_gk: concedingGk
      });
    } else if (ownGoal) {
      rows.push({
        team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
        date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
        position: common.position, input_time: common.input_time,
        event_type: "owngoal", player: ownGoal, related_player: "", concede_gk: concedingGk
      });
    } else if (concedingGk) {
      // 단독 실점 (득점자 미상) — 드물지만 보존
      rows.push({
        team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
        date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
        position: common.position, input_time: common.input_time,
        event_type: "concede", player: concedingGk, related_player: "", concede_gk: concedingGk
      });
    }
  }
  return { rows: rows };
}

function _readFutsalPlayerSchema(sheetName, team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(sheetName);
  if (!src) return { rows: [], error: sheetName + " 없음" };
  var lastRow = src.getLastRow();
  if (lastRow < 2) return { rows: [] };
  var headerRow = _findHeaderRow(src, "경기일자");
  if (lastRow <= headerRow) return { rows: [] };
  // 헤더 검증: 13 컬럼 필수
  var expectedHeaders = ["경기일자", "선수명", "골", "어시", "역주행", "실점", "클린시트", "크로바", "고구마", "키퍼경기수", "팀순위점수", "입력시간", "소속팀"];
  var headers = src.getRange(headerRow, 1, 1, 13).getValues()[0];
  for (var ci = 0; ci < expectedHeaders.length; ci++) {
    if (String(headers[ci] || "").trim() !== expectedHeaders[ci]) {
      return { rows: [], error: "헤더 불일치: expected " + expectedHeaders[ci] + ", got " + String(headers[ci] || "") };
    }
  }

  var data = src.getRange(headerRow + 1, 1, lastRow - headerRow, 13).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var name = String(r[1] || "");
    if (!name) continue;
    var gameDate = _toDateStr(r[0]);
    var inputTime = r[11] instanceof Date ? Utilities.formatDate(r[11], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(r[11] || "");
    rows.push({
      team: team, sport: "풋살", mode: "기본", tournament_id: "",
      date: gameDate, player: name, session_team: "",
      games: 0, field_games: 0, keeper_games: Number(r[9]) || 0,
      goals: Number(r[2]) || 0, assists: Number(r[3]) || 0,
      owngoals: 0, conceded: Number(r[5]) || 0, cleansheets: Number(r[6]) || 0,
      crova: Number(r[7]) || 0, goguma: Number(r[8]) || 0,
      "역주행": Number(r[4]) || 0, rank_score: Number(r[10]) || 0,
      input_time: inputTime
    });
  }
  return { rows: rows };
}

function _readSoccerPointSchema(sheetName, team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(sheetName);
  if (!src) return { rows: [], error: sheetName + " 없음" };
  var lastRow = src.getLastRow();
  if (lastRow < 2) return { rows: [] };
  var headerRow = _findHeaderRow(src, "경기일자");
  if (lastRow <= headerRow) return { rows: [] };
  // 헤더 검증: 8 컬럼 필수
  var expectedHeaders = ["경기일자", "경기번호", "상대팀명", "득점", "어시", "실점", "자책골", "입력시간"];
  var headers = src.getRange(headerRow, 1, 1, 8).getValues()[0];
  for (var ci = 0; ci < expectedHeaders.length; ci++) {
    if (String(headers[ci] || "").trim() !== expectedHeaders[ci]) {
      return { rows: [], error: "헤더 불일치: expected " + expectedHeaders[ci] + ", got " + String(headers[ci] || "") };
    }
  }

  var data = src.getRange(headerRow + 1, 1, lastRow - headerRow, 8).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var gameDate = _toDateStr(r[0]);
    var matchId = String(r[1] || "");
    var opponent = String(r[2] || "");
    var goalVal = String(r[3] || "");
    var assist = String(r[4] || "");
    var concede = String(r[5] || "");
    var ownGoal = String(r[6] || "");
    var inputTime = r[7] instanceof Date ? Utilities.formatDate(r[7], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(r[7] || "");
    var common = {
      team: team, sport: "축구", mode: "기본", tournament_id: "",
      date: gameDate, match_id: matchId, our_team: team, opponent: opponent,
      position: "", input_time: inputTime
    };
    if (goalVal === "OG") {
      // 득점 컬럼에 "OG" 리터럴 + 자책골 컬럼에 선수명이 있을 수 있으니 r[6] 우선
      rows.push({
        team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
        date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
        position: common.position, input_time: common.input_time,
        event_type: "owngoal", player: ownGoal, related_player: "", concede_gk: ""
      });
    } else if (goalVal) {
      rows.push({
        team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
        date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
        position: common.position, input_time: common.input_time,
        event_type: "goal", player: goalVal, related_player: assist, concede_gk: ""
      });
    } else if (ownGoal) {
      rows.push({
        team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
        date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
        position: common.position, input_time: common.input_time,
        event_type: "owngoal", player: ownGoal, related_player: "", concede_gk: ""
      });
    } else if (concede) {
      rows.push({
        team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
        date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
        position: common.position, input_time: common.input_time,
        event_type: "concede", player: concede, related_player: "", concede_gk: concede
      });
    }
  }
  return { rows: rows };
}

function _readSoccerPlayerSchema(sheetName, team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(sheetName);
  if (!src) return { rows: [], error: sheetName + " 없음" };
  var lastRow = src.getLastRow();
  if (lastRow < 2) return { rows: [] };
  var headerRow = _findHeaderRow(src, "경기일자");
  if (lastRow <= headerRow) return { rows: [] };
  // 헤더 검증: 11 컬럼 필수 (12번째 주석 컬럼은 무시)
  var expectedHeaders = ["경기일자", "선수명", "전체경기", "필드경기", "키퍼경기", "골", "어시", "클린시트", "실점", "자책골", "입력시간"];
  var headers = src.getRange(headerRow, 1, 1, 11).getValues()[0];
  for (var ci = 0; ci < expectedHeaders.length; ci++) {
    if (String(headers[ci] || "").trim() !== expectedHeaders[ci]) {
      return { rows: [], error: "헤더 불일치: expected " + expectedHeaders[ci] + ", got " + String(headers[ci] || "") };
    }
  }

  var data = src.getRange(headerRow + 1, 1, lastRow - headerRow, 11).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var name = String(r[1] || "");
    if (!name) continue;
    var gameDate = _toDateStr(r[0]);
    var inputTime = r[10] instanceof Date ? Utilities.formatDate(r[10], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(r[10] || "");
    rows.push({
      team: team, sport: "축구", mode: "기본", tournament_id: "",
      date: gameDate, player: name, session_team: "",
      games: Number(r[2]) || 0, field_games: Number(r[3]) || 0, keeper_games: Number(r[4]) || 0,
      goals: Number(r[5]) || 0, assists: Number(r[6]) || 0,
      owngoals: Number(r[9]) || 0, conceded: Number(r[8]) || 0, cleansheets: Number(r[7]) || 0,
      crova: 0, goguma: 0, "역주행": 0, rank_score: 0, input_time: inputTime
    });
  }
  return { rows: rows };
}

function _importTournamentEventLogs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var rows = [];
  var errors = [];
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var name = sheet.getName();
    var m = name.match(/^대회_(.+)_이벤트로그$/);
    if (!m) continue;
    var tid = m[1];
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) continue;
    // 컬럼: [경기번호, 상대팀, 이벤트, 선수, 관련선수, 포지션, 입력시간]
    var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    var typeMap = { "출전": "lineup", "골": "goal", "자책골": "owngoal", "실점": "concede", "교체": "sub" };
    for (var i = 0; i < data.length; i++) {
      var r = data[i];
      var eventType = typeMap[String(r[2] || "")];
      if (!eventType) continue;
      var inputTime = r[6] instanceof Date ? Utilities.formatDate(r[6], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(r[6] || "");
      // 대회 시트엔 date 컬럼 없음 → inputTime 앞부분을 date로 사용 (YYYY-MM-DD 추출)
      var date = "";
      var dm = inputTime.match(/^(\d{4}-\d{2}-\d{2})/);
      if (dm) date = dm[1];
      var playerVal = String(r[3] || "");
      // concede 이벤트: player(r[3])가 GK → _readSoccerPointSchema와 동일하게 concede_gk에 기록
      var concedeGk = (eventType === "concede") ? playerVal : "";
      rows.push({
        team: "", sport: "축구", mode: "대회", tournament_id: tid,
        date: date, match_id: String(r[0] || ""),
        our_team: "", opponent: String(r[1] || ""),
        event_type: eventType, player: playerVal, related_player: String(r[4] || ""),
        concede_gk: concedeGk, position: String(r[5] || ""), input_time: inputTime,
      });
    }
  }
  return { rows: rows, errors: errors };
}

/**
 * config.teams 기반 import. 반드시 명시적 config를 전달해야 함.
 * config = {
 *   teams: [
 *     { team: "마스터FC", pointSheet: "마스터FC 포인트 로그", pointSchema: "futsalPoint",
 *       playerSheet: "마스터FC 선수별집계기록 로그", playerSchema: "futsalPlayer" },
 *     { team: "하버FC", pointSheet: "하버FC 포인트 로그", pointSchema: "soccerPoint",
 *       playerSheet: "하버FC 선수기록보관소", playerSchema: "soccerPlayer" },
 *   ],
 *   includeTournaments: true  // 생략 시 true
 * }
 */
function _importLegacyToRaw(config) {
  if (!config || !config.teams) return { error: "config.teams 필요" };
  _ensureRawSheets();
  var result = { insertedEvents: 0, insertedPlayerGames: 0, skippedEvents: 0, skippedPlayerGames: 0, sources: {} };

  var teams = config.teams;
  for (var t = 0; t < teams.length; t++) {
    var entry = teams[t];
    var teamName = entry.team || "";

    // Point/Event 시트 처리
    if (entry.pointSheet && entry.pointSchema) {
      var pointData;
      try {
        if (entry.pointSchema === "futsalPoint") {
          pointData = _readFutsalPointSchema(entry.pointSheet, teamName);
        } else if (entry.pointSchema === "soccerPoint") {
          pointData = _readSoccerPointSchema(entry.pointSheet, teamName);
        } else {
          pointData = { rows: [], error: "알 수 없는 pointSchema: " + entry.pointSchema };
        }
      } catch (e) {
        result.sources[entry.pointSheet] = { error: e.message };
        pointData = null;
      }
      if (pointData) {
        var pointRows = pointData.rows || [];
        if (pointRows.length === 0) {
          result.sources[entry.pointSheet] = { inserted: 0, skipped: 0, note: pointData.error || "빈 소스" };
        } else {
          var pointWrite = _writeRawEvents({ rows: pointRows, skipDedupe: true });
          result.sources[entry.pointSheet] = { inserted: pointWrite.count || 0, skipped: pointWrite.skipped || 0 };
          result.insertedEvents += pointWrite.count || 0;
          result.skippedEvents += pointWrite.skipped || 0;
        }
      }
    }

    // Player 시트 처리
    if (entry.playerSheet && entry.playerSchema) {
      var playerData;
      try {
        if (entry.playerSchema === "futsalPlayer") {
          playerData = _readFutsalPlayerSchema(entry.playerSheet, teamName);
        } else if (entry.playerSchema === "soccerPlayer") {
          playerData = _readSoccerPlayerSchema(entry.playerSheet, teamName);
        } else {
          playerData = { rows: [], error: "알 수 없는 playerSchema: " + entry.playerSchema };
        }
      } catch (e) {
        result.sources[entry.playerSheet] = { error: e.message };
        playerData = null;
      }
      if (playerData) {
        var playerRows = playerData.rows || [];
        if (playerRows.length === 0) {
          result.sources[entry.playerSheet] = { inserted: 0, skipped: 0, note: playerData.error || "빈 소스" };
        } else {
          var playerWrite = _writeRawPlayerGames({ rows: playerRows, skipDedupe: true });
          result.sources[entry.playerSheet] = { inserted: playerWrite.count || 0, skipped: playerWrite.skipped || 0 };
          result.insertedPlayerGames += playerWrite.count || 0;
          result.skippedPlayerGames += playerWrite.skipped || 0;
        }
      }
    }
  }

  // 대회 이벤트로그 (기본 포함)
  var includeTournaments = config.includeTournaments !== false;
  if (includeTournaments) {
    var tourneyData;
    try { tourneyData = _importTournamentEventLogs(); } catch (e) {
      result.sources["대회 이벤트로그"] = { error: e.message };
      tourneyData = null;
    }
    if (tourneyData) {
      var tourneyRows = tourneyData.rows || [];
      if (tourneyRows.length === 0) {
        result.sources["대회 이벤트로그"] = { inserted: 0, skipped: 0, note: "빈 소스" };
      } else {
        var tourneyWrite = _writeRawEvents({ rows: tourneyRows, skipDedupe: true });
        result.sources["대회 이벤트로그"] = { inserted: tourneyWrite.count || 0, skipped: tourneyWrite.skipped || 0 };
        result.insertedEvents += tourneyWrite.count || 0;
        result.skippedEvents += tourneyWrite.skipped || 0;
      }
    }
  }

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * 로그_이벤트, 로그_선수경기 시트의 데이터 행을 전부 삭제하고 헤더만 보존.
 * 이전 import 결과가 잘못된 경우 _clearRawSheets() 후 _importLegacyToRaw() 재실행.
 * Returns { cleared: { 로그_이벤트: N, 로그_선수경기: M } }
 */
function _clearRawSheets() {
  _ensureRawSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cleared = {};

  var eventSheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (eventSheet) {
    var eventLastRow = eventSheet.getLastRow();
    if (eventLastRow >= 2) {
      var eventCount = eventLastRow - 1;
      eventSheet.deleteRows(2, eventCount);
      cleared[RAW_EVENTS_SHEET] = eventCount;
    } else {
      cleared[RAW_EVENTS_SHEET] = 0;
    }
  }

  var playerSheet = ss.getSheetByName(RAW_PLAYER_GAMES_SHEET);
  if (playerSheet) {
    var playerLastRow = playerSheet.getLastRow();
    if (playerLastRow >= 2) {
      var playerCount = playerLastRow - 1;
      playerSheet.deleteRows(2, playerCount);
      cleared[RAW_PLAYER_GAMES_SHEET] = playerCount;
    } else {
      cleared[RAW_PLAYER_GAMES_SHEET] = 0;
    }
  }

  Logger.log(JSON.stringify({ cleared: cleared }));
  return { cleared: cleared };
}

/**
 * Apps Script 편집기 실행창에서 인자 전달이 안 되므로 래퍼.
 * 팀/시트 추가 시 teams 배열에 항목 추가.
 * 편집기에서 함수 선택 후 "실행" 클릭.
 */
function _runImport() {
  return _importLegacyToRaw({
    teams: [
      {
        team: "마스터FC",
        pointSheet: "마스터FC 포인트 로그",
        pointSchema: "futsalPoint",
        playerSheet: "마스터FC 선수별집계기록 로그",
        playerSchema: "futsalPlayer"
      },
      {
        team: "하버FC",
        pointSheet: "하버FC 포인트 로그",
        pointSchema: "soccerPoint",
        playerSheet: "하버FC 선수기록보관소",
        playerSchema: "soccerPlayer"
      }
    ]
  });
}

function _reimportPointLog(team, sport, pointSheet) {
  if (!team || !sport || !pointSheet) return { success: false, error: "team/sport/pointSheet 필요" };
  if (sport === "풋살") return _reimportFutsalPointForTeam(team, pointSheet);
  if (sport === "축구") return _reimportSoccerPointForTeam(team, pointSheet);
  return { success: false, error: "지원하지 않는 sport: " + sport };
}

function _reimportSoccerPointForTeam(team, pointSheet) {
  // _reimportFutsalPointForTeam 과 동일 패턴, 단 _readSoccerPointSchema 호출
  _ensureRawSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) return { success: false, error: "로그_이벤트 시트 없음" };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var lastRow = sheet.getLastRow();
    var deleted = 0;
    if (lastRow >= 2) {
      var lastCol = sheet.getLastColumn();
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var teamCol = headers.indexOf("team");
      var sportCol = headers.indexOf("sport");
      if (teamCol < 0 || sportCol < 0) return { success: false, error: "team/sport 컬럼 없음" };
      var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      var keep = [];
      for (var i = 0; i < data.length; i++) {
        var rowTeam = String(data[i][teamCol] || "").trim();
        var rowSport = String(data[i][sportCol] || "").trim();
        if (rowTeam === team && rowSport === "축구") { deleted++; continue; }
        keep.push(data[i]);
      }
      sheet.deleteRows(2, lastRow - 1);
      if (keep.length > 0) {
        sheet.getRange(2, 1, keep.length, lastCol).setValues(keep);
      }
    }

    var pointData = _readSoccerPointSchema(pointSheet, team);
    var rows = pointData.rows || [];
    if (pointData.error) return { success: false, deleted: deleted, error: pointData.error };

    var inserted = 0;
    if (rows.length > 0) {
      var write = _writeRawEvents({ rows: rows, skipDedupe: true });
      inserted = write.count || 0;
    }
    Logger.log(JSON.stringify({ team: team, sport: "축구", deleted: deleted, inserted: inserted }));
    return { success: true, deleted: deleted, inserted: inserted };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 특정 팀/종목의 로그_이벤트 행만 삭제 후 포인트 시트에서 재import.
 * _readFutsalPointSchema 같은 변환 로직이 바뀌었을 때 안전하게 재적용.
 * 로그_선수경기는 건드리지 않음.
 */
function _reimportFutsalPointForTeam(team, pointSheet) {
  _ensureRawSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) return { success: false, error: "로그_이벤트 시트 없음" };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var lastRow = sheet.getLastRow();
    var deleted = 0;
    if (lastRow >= 2) {
      var lastCol = sheet.getLastColumn();
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var teamCol = headers.indexOf("team");
      var sportCol = headers.indexOf("sport");
      if (teamCol < 0 || sportCol < 0) return { success: false, error: "team/sport 컬럼 없음" };
      var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      // 보존 행만 모아서 한 번에 다시 씀
      var keep = [];
      for (var i = 0; i < data.length; i++) {
        var rowTeam = String(data[i][teamCol] || "").trim();
        var rowSport = String(data[i][sportCol] || "").trim();
        if (rowTeam === team && rowSport === "풋살") { deleted++; continue; }
        keep.push(data[i]);
      }
      sheet.deleteRows(2, lastRow - 1);
      if (keep.length > 0) {
        sheet.getRange(2, 1, keep.length, lastCol).setValues(keep);
      }
    }

    var pointData = _readFutsalPointSchema(pointSheet, team);
    var rows = pointData.rows || [];
    if (pointData.error) return { success: false, deleted: deleted, error: pointData.error };

    var inserted = 0;
    if (rows.length > 0) {
      var write = _writeRawEvents({ rows: rows, skipDedupe: true });
      inserted = write.count || 0;
    }
    Logger.log(JSON.stringify({ deleted: deleted, inserted: inserted }));
    return { success: true, deleted: deleted, inserted: inserted };
  } finally {
    lock.releaseLock();
  }
}

/** Apps Script 편집기에서 직접 실행. 마스터FC/풋살 로그_이벤트 재import. */
function _reimportMasterFCFutsalPoint() {
  return _reimportFutsalPointForTeam("마스터FC", "마스터FC 포인트 로그");
}

// ═══════════════════════════════════════════════════════════════
// 누적 크로바/고구마 조회
// ═══════════════════════════════════════════════════════════════

function _getCumulativeBonus(team, sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName || PLAYER_LOG_SHEET);
  if (!sheet) return { success: true, crova: {}, goguma: {} };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, crova: {}, goguma: {} };

  var colCount = sheet.getLastColumn();
  var data = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();

  var crova = {};
  var goguma = {};

  for (var i = 0; i < data.length; i++) {
    if (team && colCount >= 13) {
      var rowTeam = String(data[i][12]).trim();
      if (rowTeam && rowTeam !== team) continue;
    }

    var name = String(data[i][1]).trim();
    if (!name) continue;

    var c = Number(data[i][7]) || 0;
    var g = Number(data[i][8]) || 0;

    if (c !== 0) crova[name] = (crova[name] || 0) + c;
    if (g !== 0) goguma[name] = (goguma[name] || 0) + g;
  }

  return { success: true, crova: crova, goguma: goguma };
}

// ═══════════════════════════════════════════════════════════════
// 시트 목록 조회
// ═══════════════════════════════════════════════════════════════

function _getSheetList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var list = sheets.map(function(s) {
    return { name: s.getName(), gid: s.getSheetId() };
  });
  return { success: true, sheets: list };
}

// ═══════════════════════════════════════════════════════════════
// 이전 랭킹 계산 (마지막 경기 제외 누적 포인트 기반)
// ═══════════════════════════════════════════════════════════════

function _getPrevRankings(team, sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName || PLAYER_LOG_SHEET);
  if (!sheet) return { success: true, latestDeltas: {} };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, latestDeltas: {} };

  var data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
  // 열: 경기일자(0), 선수명(1), 골(2), 어시(3), 역주행(4), 실점(5), 클린시트(6), 크로바(7), 고구마(8), 키퍼경기수(9), 팀순위점수(10), 입력시간(11), 소속팀(12)

  // 팀 필터 + 최신 경기일자 찾기
  var latestDate = "";
  for (var i = 0; i < data.length; i++) {
    var rowTeam = data[i][12] ? String(data[i][12]).trim() : "";
    if (rowTeam && rowTeam !== team) continue;
    var dateStr = _toDateStr(data[i][0]);
    if (dateStr > latestDate) latestDate = dateStr;
  }

  if (!latestDate) return { success: true, latestDeltas: {} };

  // 최신 경기일자의 선수별 증분만 추출
  var deltas = {};
  for (var j = 0; j < data.length; j++) {
    var rTeam = data[j][12] ? String(data[j][12]).trim() : "";
    if (rTeam && rTeam !== team) continue;
    var ds = _toDateStr(data[j][0]);
    if (ds !== latestDate) continue;
    var name = String(data[j][1]).trim();
    if (!name) continue;
    deltas[name] = {
      goals: Number(data[j][2]) || 0,
      assists: Number(data[j][3]) || 0,
      ownGoals: Number(data[j][4]) || 0,
      cleanSheets: Number(data[j][6]) || 0,
      crova: Number(data[j][7]) || 0,
      goguma: Number(data[j][8]) || 0,
    };
  }

  return { success: true, latestDeltas: deltas, latestDate: latestDate };
}

// ═══════════════════════════════════════════════════════════════
// 랭킹 히스토리 (캔들차트용 - 경기일자별 전체 선수 랭킹)
// ═══════════════════════════════════════════════════════════════

function _getRankingHistory(team, allPlayers, customSheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = customSheetName || PLAYER_LOG_SHEET;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: true, rankingHistory: { dates: [], players: {} } };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, rankingHistory: { dates: [], players: {} } };

  var data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();

  // 경기일자별 선수 데이터 그룹핑
  var dateMap = {}; // { "2025-09-15": [ {name, goals, assists, ...} ] }
  for (var i = 0; i < data.length; i++) {
    var rowTeam = data[i][12] ? String(data[i][12]).trim() : "";
    if (rowTeam && rowTeam !== team) continue;

    var dateStr = _toDateStr(data[i][0]);
    var name = String(data[i][1]).trim();
    if (!name || !dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

    if (!dateMap[dateStr]) dateMap[dateStr] = [];
    dateMap[dateStr].push({
      name: name,
      goals: Number(data[i][2]) || 0,
      assists: Number(data[i][3]) || 0,
      ownGoals: Number(data[i][4]) || 0,
      cleanSheets: Number(data[i][6]) || 0,
      crova: Number(data[i][7]) || 0,
      goguma: Number(data[i][8]) || 0,
    });
  }

  var sortedDates = Object.keys(dateMap).sort();
  // 디버그: 처리된 행 수, 날짜 목록, 첫 5행 날짜 원본값
  var debug = {
    totalRows: data.length,
    datesFound: sortedDates,
    first5RawDates: data.slice(0, 5).map(function(r) { return { raw: String(r[0]), type: typeof r[0], isDate: r[0] instanceof Date, converted: _toDateStr(r[0]), name: String(r[1]).trim(), team: String(r[12] || "").trim() }; }),
  };
  if (sortedDates.length === 0) return { success: true, rankingHistory: { dates: [], players: {} }, debug: debug };

  // 경기일자별 누적 → 랭킹 계산
  var cumulative = {}; // { name: { goals, assists, ownGoals, cleanSheets, crova, goguma } }
  // 대시보드 전체 선수 목록으로 초기화 (0 스탯)
  if (allPlayers && allPlayers.length > 0) {
    for (var ap = 0; ap < allPlayers.length; ap++) {
      var pn = String(allPlayers[ap]).trim();
      if (pn) cumulative[pn] = { goals: 0, assists: 0, ownGoals: 0, cleanSheets: 0, crova: 0, goguma: 0 };
    }
  }
  var resultDates = [];
  var resultPlayers = {}; // { name: [rank1, rank2, ...] }

  for (var d = 0; d < sortedDates.length; d++) {
    var dt = sortedDates[d];
    var rows = dateMap[dt];

    // 해당 날짜 데이터 누적
    for (var r = 0; r < rows.length; r++) {
      var p = rows[r];
      if (!cumulative[p.name]) cumulative[p.name] = { goals: 0, assists: 0, ownGoals: 0, cleanSheets: 0, crova: 0, goguma: 0 };
      cumulative[p.name].goals += p.goals;
      cumulative[p.name].assists += p.assists;
      cumulative[p.name].ownGoals += p.ownGoals;
      cumulative[p.name].cleanSheets += p.cleanSheets;
      cumulative[p.name].crova += p.crova;
      cumulative[p.name].goguma += p.goguma;
    }

    // 전체 선수 랭킹 계산
    var ranked = Object.keys(cumulative).map(function(n) {
      var s = cumulative[n];
      var pt = s.goals + s.assists + s.ownGoals + s.cleanSheets + s.crova + s.goguma;
      return { name: n, point: pt, ownGoals: s.ownGoals, goguma: s.goguma, goals: s.goals, assists: s.assists, cleanSheets: s.cleanSheets };
    });

    ranked.sort(function(a, b) {
      if (b.point !== a.point) return b.point - a.point;
      if (a.ownGoals !== b.ownGoals) return a.ownGoals - b.ownGoals;
      if (a.goguma !== b.goguma) return a.goguma - b.goguma;
      if (b.goals !== a.goals) return b.goals - a.goals;
      if (b.assists !== a.assists) return b.assists - a.assists;
      return b.cleanSheets - a.cleanSheets;
    });

    resultDates.push(dt);
    for (var k = 0; k < ranked.length; k++) {
      var nm = ranked[k].name;
      if (!resultPlayers[nm]) {
        // 첫 등장 전 날짜들은 null로 채움
        resultPlayers[nm] = [];
        for (var f = 0; f < resultDates.length - 1; f++) resultPlayers[nm].push(null);
      }
      resultPlayers[nm].push(k + 1);
    }

    // 이전에 존재했지만 이번 날짜에 랭킹 안 된 선수 (있을 수 없지만 안전장치)
    for (var pn in resultPlayers) {
      if (resultPlayers[pn].length < resultDates.length) {
        resultPlayers[pn].push(resultPlayers[pn][resultPlayers[pn].length - 1]);
      }
    }
  }

  return { success: true, rankingHistory: { dates: resultDates, players: resultPlayers }, debug: debug };
}

// ═══════════════════════════════════════════════════════════════
// 포인트로그(골 이벤트) 조회
// ═══════════════════════════════════════════════════════════════

function _getPointLog(team, customSheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = customSheetName || POINT_LOG_SHEET;
  var useCustomSheet = !!customSheetName && customSheetName !== POINT_LOG_SHEET;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: true, events: [] };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, events: [] };

  var colCount = sheet.getLastColumn();
  // 헤더 행 자동 탐색 (1~5행 중 "경기일자" 포함 행)
  var headerRow = 1;
  var scanRows = sheet.getRange(1, 1, Math.min(5, lastRow), colCount).getValues();
  for (var r = 0; r < scanRows.length; r++) {
    if (scanRows[r].some(function(cell) { return String(cell).trim() === "경기일자"; })) {
      headerRow = r + 1;
      break;
    }
  }
  var headers = sheet.getRange(headerRow, 1, 1, colCount).getValues()[0].map(function(h) { return String(h).trim(); });

  // 헤더 기반 동적 컬럼 매핑 (풋살/축구 공통)
  var cm = {};
  for (var c = 0; c < headers.length; c++) {
    var h = headers[c];
    if (h === "경기일자") cm.date = c;
    else if (h === "경기번호") cm.matchId = c;
    else if (h === "내팀") cm.myTeam = c;
    else if (h === "상대팀" || h === "상대팀명") cm.opponent = c;
    else if (h === "득점" || h === "득점선수") cm.scorer = c;
    else if (h === "어시" || h === "어시선수") cm.assist = c;
    else if (h === "자책골") cm.ownGoal = c;
    else if (h === "실점" || h === "실점키퍼" || h === "실점키퍼명") cm.concedingGk = c;
    else if (h === "팀이름") cm.teamName = c;
  }

  var dataStartRow = headerRow + 1;
  if (dataStartRow > lastRow) return { success: true, events: [] };
  var data = sheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, colCount).getValues();
  var events = [];
  for (var i = 0; i < data.length; i++) {
    if (cm.teamName !== undefined && !useCustomSheet) {
      var rowTeam = data[i][cm.teamName] ? String(data[i][cm.teamName]).trim() : "";
      if (rowTeam && rowTeam !== team) continue;
    }

    var dateStr = _toDateStr(data[i][cm.date !== undefined ? cm.date : 0]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

    events.push({
      date: dateStr,
      matchId: cm.matchId !== undefined ? String(data[i][cm.matchId] || "").trim() : "",
      myTeam: cm.myTeam !== undefined ? String(data[i][cm.myTeam] || "").trim() : "",
      opponent: cm.opponent !== undefined ? String(data[i][cm.opponent] || "").trim() : "",
      scorer: cm.scorer !== undefined ? String(data[i][cm.scorer] || "").trim() : "",
      assist: cm.assist !== undefined ? String(data[i][cm.assist] || "").trim() : "",
      ownGoal: cm.ownGoal !== undefined ? String(data[i][cm.ownGoal] || "").trim() : "",
      concedingGk: cm.concedingGk !== undefined ? String(data[i][cm.concedingGk] || "").trim() : "",
    });
  }

  return { success: true, events: events };
}

// ═══════════════════════════════════════════════════════════════
// 선수별집계기록로그 조회
// ═══════════════════════════════════════════════════════════════

function _getPlayerLog(team, customSheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = customSheetName || PLAYER_LOG_SHEET;
  var useCustomSheet = !!customSheetName && customSheetName !== PLAYER_LOG_SHEET;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: true, players: [] };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, players: [] };

  var colCount = sheet.getLastColumn();
  // 헤더 행 자동 탐색 (1~5행 중 "선수명" 또는 "경기일자" 포함 행)
  var headerRow = 1;
  var scanRows = sheet.getRange(1, 1, Math.min(5, lastRow), colCount).getValues();
  for (var r = 0; r < scanRows.length; r++) {
    if (scanRows[r].some(function(cell) { var s = String(cell).trim(); return s === "선수명" || s === "경기일자"; })) {
      headerRow = r + 1;
      break;
    }
  }
  var headers = sheet.getRange(headerRow, 1, 1, colCount).getValues()[0].map(function(h) { return String(h).trim(); });

  // 헤더 기반 동적 컬럼 매핑 (풋살/축구 공통)
  var cm = {};
  for (var c = 0; c < headers.length; c++) {
    var h = headers[c];
    if (h === "경기일자") cm.date = c;
    else if (h === "선수명") cm.name = c;
    else if (h === "골") cm.goals = c;
    else if (h === "어시") cm.assists = c;
    else if (h === "역주행" || h === "자책골") cm.ownGoals = c;
    else if (h === "실점") cm.conceded = c;
    else if (h === "클린시트") cm.cleanSheets = c;
    else if (h === "크로바") cm.crova = c;
    else if (h === "고구마") cm.goguma = c;
    else if (h === "키퍼경기수" || h === "키퍼경기") cm.keeperGames = c;
    else if (h === "팀순위점수") cm.rankScore = c;
    else if (h === "소속팀") cm.teamName = c;
  }

  var dataStartRow = headerRow + 1;
  if (dataStartRow > lastRow) return { success: true, players: [] };
  var data = sheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, colCount).getValues();
  var players = [];
  for (var i = 0; i < data.length; i++) {
    if (cm.teamName !== undefined && !useCustomSheet) {
      var rowTeam = data[i][cm.teamName] ? String(data[i][cm.teamName]).trim() : "";
      if (rowTeam && rowTeam !== team) continue;
    }
    var dateStr = _toDateStr(data[i][cm.date !== undefined ? cm.date : 0]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    var name = String(data[i][cm.name !== undefined ? cm.name : 1]).trim();
    if (!name) continue;
    players.push({
      date: dateStr, name: name,
      goals: cm.goals !== undefined ? Number(data[i][cm.goals]) || 0 : 0,
      assists: cm.assists !== undefined ? Number(data[i][cm.assists]) || 0 : 0,
      ownGoals: cm.ownGoals !== undefined ? Number(data[i][cm.ownGoals]) || 0 : 0,
      conceded: cm.conceded !== undefined ? Number(data[i][cm.conceded]) || 0 : 0,
      cleanSheets: cm.cleanSheets !== undefined ? Number(data[i][cm.cleanSheets]) || 0 : 0,
      crova: cm.crova !== undefined ? Number(data[i][cm.crova]) || 0 : 0,
      goguma: cm.goguma !== undefined ? Number(data[i][cm.goguma]) || 0 : 0,
      keeperGames: cm.keeperGames !== undefined ? Number(data[i][cm.keeperGames]) || 0 : 0,
      rankScore: cm.rankScore !== undefined ? Number(data[i][cm.rankScore]) || 0 : 0,
    });
  }
  return { success: true, players: players, debug: { totalRows: data.length, returned: players.length, requestedTeam: team, sheetName: sheetName, headers: headers } };
}

// ═══════════════════════════════════════════════════════════════
// 대회 관리
// ═══════════════════════════════════════════════════════════════

function _createTournament(data) {
  if (!data || !data.id || !data.name) return { success: false, error: "필수 정보 누락" };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var listSheet = ss.getSheetByName("대회_목록");
  if (!listSheet) {
    listSheet = ss.insertSheet("대회_목록");
    listSheet.getRange("A1:J1").setValues([["대회ID","대회명","시작일","종료일","참가팀","대진형태","상태","생성시간","기본경기시간","기본구장"]]);
    listSheet.getRange("A1:J1").setFontWeight("bold");
  }
  var lastRow = listSheet.getLastRow();
  listSheet.getRange(lastRow + 1, 1, 1, 10).setValues([[
    data.id, data.name, data.startDate || "", data.endDate || "",
    (data.teams || []).join(","), data.format || "manual", "active", _kstNow(),
    Number(data.defaultMinutes) || 90, data.defaultVenue || ""
  ]]);
  var schedSheet = ss.insertSheet("대회_" + data.id + "_일정");
  schedSheet.getRange("A1:H1").setValues([["경기번호","날짜","홈팀","원정팀","홈스코어","원정스코어","시간","구장"]]);
  schedSheet.getRange("A1:H1").setFontWeight("bold");
  var matches = data.matches || [];
  if (matches.length > 0) {
    var defVenue = data.defaultVenue || "";
    var values = matches.map(function(m) {
      return [m.matchNum, m.date || "", m.home || "", m.away || "", "", "", "", defVenue];
    });
    schedSheet.getRange(2, 1, values.length, 8).setValues(values);
  }
  var eventSheet = ss.insertSheet("대회_" + data.id + "_이벤트로그");
  eventSheet.getRange("A1:G1").setValues([["경기번호","상대팀명","이벤트","선수","관련선수","포지션","입력시간"]]);
  eventSheet.getRange("A1:G1").setFontWeight("bold");
  var playerSheet = ss.insertSheet("대회_" + data.id + "_대시보드");
  playerSheet.getRange("A1:J1").setValues([["선수명","전체경기","필드경기","키퍼경기","골","어시","클린시트","실점","자책골","포인트"]]);
  playerSheet.getRange("A1:J1").setFontWeight("bold");
  return { success: true, id: data.id };
}

function _deleteTournament(tournamentId) {
  if (!tournamentId) return { success: false, error: "대회ID 누락" };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // 관련 시트 삭제
  ["_일정", "_이벤트로그", "_대시보드"].forEach(function(suffix) {
    var sheet = ss.getSheetByName("대회_" + tournamentId + suffix);
    if (sheet) ss.deleteSheet(sheet);
  });
  // 대회_목록에서 행 삭제
  var listSheet = ss.getSheetByName("대회_목록");
  if (listSheet) {
    var lastRow = listSheet.getLastRow();
    if (lastRow >= 2) {
      var data = listSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = data.length - 1; i >= 0; i--) {
        if (String(data[i][0]) === tournamentId) listSheet.deleteRow(i + 2);
      }
    }
  }
  return { success: true };
}

function _updateTournamentMatch(tournamentId, matchNum, updates) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_일정");
  if (!sheet) return { success: false, error: "일정 시트 없음" };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, error: "데이터 없음" };
  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  for (var i = 0; i < data.length; i++) {
    if (Number(data[i][0]) === matchNum) {
      if (updates.date !== undefined) sheet.getRange(i + 2, 2).setValue(updates.date);
      if (updates.home !== undefined) sheet.getRange(i + 2, 3).setValue(updates.home);
      if (updates.away !== undefined) sheet.getRange(i + 2, 4).setValue(updates.away);
      if (updates.time !== undefined) sheet.getRange(i + 2, 7).setValue(updates.time);
      if (updates.venue !== undefined) sheet.getRange(i + 2, 8).setValue(updates.venue);
      return { success: true };
    }
  }
  return { success: false, error: "경기번호 " + matchNum + " 없음" };
}

function _getTournamentRoster(tournamentId) {
  // _대시보드 시트에서 명단 조회 (선수기록 = 대시보드)
  var result = _getTournamentPlayerRecords(tournamentId);
  return { success: true, players: (result.players || []).map(function(p) {
    return { name: p.name, games: p.games, goals: p.goals, assists: p.assists, cleanSheets: p.cleanSheets, point: p.point };
  })};
}

function _getTournamentList(team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_목록");
  if (!sheet) return { success: true, tournaments: [] };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, tournaments: [] };
  var colCount = Math.max(sheet.getLastColumn(), 10);
  var data = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  var list = data.filter(function(r) { return r[0]; }).map(function(r) {
    return { id: String(r[0]), name: String(r[1]), startDate: _toDateStr(r[2]), endDate: _toDateStr(r[3]),
      teams: String(r[4]).split(",").map(function(t) { return t.trim(); }).filter(Boolean),
      format: String(r[5]), status: String(r[6]),
      defaultMinutes: Number(r[8]) || 90, defaultVenue: String(r[9] || "") };
  });
  return { success: true, tournaments: list };
}

function _getTournamentSchedule(tournamentId, ourTeam) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_일정");
  if (!sheet) return { success: false, error: "일정 시트 없음" };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, matches: [] };
  var colCount = Math.max(sheet.getLastColumn(), 8);
  var data = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  var matches = data.filter(function(r) { return r[0]; }).map(function(r) {
    var home = String(r[2] || "").trim();
    var away = String(r[3] || "").trim();
    var isOurs = ourTeam ? (home === ourTeam || away === ourTeam) : false;
    var hasScore = r[4] !== "" && r[4] !== null && r[4] !== undefined;
    return { matchNum: Number(r[0]), date: _toDateStr(r[1]),
      home: home, away: away,
      homeScore: hasScore ? Number(r[4]) : null,
      awayScore: r[5] !== "" && r[5] !== null ? Number(r[5]) : null,
      time: String(r[6] || "").trim(),
      venue: String(r[7] || "").trim(),
      isOurs: isOurs,
      status: hasScore ? "finished" : "scheduled" };
  });
  return { success: true, matches: matches };
}

function _updateTournamentMatchScore(tournamentId, matchNum, homeScore, awayScore) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_일정");
  if (!sheet) return { success: false, error: "일정 시트 없음" };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, error: "데이터 없음" };
  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  for (var i = 0; i < data.length; i++) {
    if (Number(data[i][0]) === matchNum) {
      sheet.getRange(i + 2, 5).setValue(homeScore);  // E열: 홈스코어
      sheet.getRange(i + 2, 6).setValue(awayScore);  // F열: 원정스코어
      return { success: true };
    }
  }
  return { success: false, error: "경기번호 " + matchNum + " 없음" };
}

function _writeTournamentEventLog(tournamentId, data) {
  if (!data) return { success: false, error: "data 누락" };
  var rows = data.events || [];
  if (rows.length === 0) return { success: true, count: 0 };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_이벤트로그");
  if (!sheet) return { success: false, error: "이벤트로그 시트 없음" };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var values = rows.map(function(e) {
      return [e.matchNum || "", e.opponent || "", e.event || "", e.player || "", e.relatedPlayer || "", e.position || "", e.inputTime || _kstNow()];
    });
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 7).setValues(values);
    return { success: true, count: values.length };
  } finally { lock.releaseLock(); }
}

function _writeTournamentPlayerRecord(tournamentId, data) {
  if (!data) return { success: false, error: "data 누락" };
  var rows = data.players || [];
  if (rows.length === 0) return { success: true, count: 0 };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_대시보드");
  if (!sheet) return { success: false, error: "선수기록 시트 없음" };
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 10).clearContent();
  var values = rows.map(function(p) {
    return [p.name, Number(p.games)||0, Number(p.fieldGames)||0, Number(p.keeperGames)||0,
      Number(p.goals)||0, Number(p.assists)||0, Number(p.cleanSheets)||0,
      Number(p.conceded)||0, Number(p.owngoals)||0, Number(p.point)||0];
  });
  sheet.getRange(2, 1, values.length, 10).setValues(values);
  return { success: true, count: values.length };
}

function _getTournamentPlayerRecords(tournamentId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_대시보드");
  if (!sheet) return { success: true, players: [] };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, players: [] };
  var data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  var players = data.filter(function(r) { return r[0]; }).map(function(r) {
    return { name: String(r[0]), games: Number(r[1])||0, fieldGames: Number(r[2])||0,
      keeperGames: Number(r[3])||0, goals: Number(r[4])||0, assists: Number(r[5])||0,
      cleanSheets: Number(r[6])||0, conceded: Number(r[7])||0, owngoals: Number(r[8])||0,
      point: Number(r[9])||0 };
  });
  return { success: true, players: players };
}

function _getTournamentEventLog(tournamentId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_이벤트로그");
  if (!sheet) return { success: true, events: [] };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, events: [] };
  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var events = data.filter(function(r) { return r[0]; }).map(function(r) {
    return { matchNum: Number(r[0]), opponent: String(r[1]), event: String(r[2]),
      player: String(r[3]), relatedPlayer: String(r[4]), position: String(r[5]),
      inputTime: String(r[6]) };
  });
  return { success: true, events: events };
}
