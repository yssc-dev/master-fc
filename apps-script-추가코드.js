// ═══════════════════════════════════════════════════════════════
// 풋살 웹앱 Apps Script v2.0
// 개선: 응답 표준화, 입력 검증, 팀 접근 제어, LockService 동시성 제어
//
// 배포: 배포 → 새 배포 → 웹 앱 → 실행 대상: 나, 액세스: 모든 사용자
// ═══════════════════════════════════════════════════════════════

var STATE_SHEET_NAME = "앱_경기상태";
var AUTH_SHEET_NAME = "회원인증";
var POINT_LOG_SHEET = "포인트로그";
var PLAYER_LOG_SHEET = "선수별집계기록로그";

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
      return _jsonResponse({ success: true, time: new Date().toISOString() });
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
      return _jsonResponse(_saveGameState(body.state, body.team));
    } else if (action === "clearState") {
      return _jsonResponse(_clearGameState(body.team));
    } else if (action === "finalizeState") {
      return _jsonResponse(_finalizeGameState(body.team));
    } else if (action === "writePointLog") {
      return _jsonResponse(_writePointLog(body.data));
    } else if (action === "writePlayerLog") {
      return _jsonResponse(_writePlayerLog(body.data));
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

function _findStateRow(sheet, team, status) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === team && String(data[i][2]).trim() === status) {
      return i + 2;
    }
  }
  return -1;
}

function _saveGameState(state, team) {
  if (!state) return { success: false, error: "state is empty" };
  if (!team) team = "기본팀";
  var gameDate = new Date().toISOString().slice(0, 10);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, error: "다른 저장이 진행 중입니다. 잠시 후 다시 시도하세요" };

  try {
    var sheet = _getOrCreateStateSheet();
    var json = JSON.stringify(state);
    var now = new Date().toISOString();

    var evtCount = (state.allEvents || []).length;
    var matchCount = (state.completedMatches || []).length;
    var summary = (state.phase || "?") + " | 이벤트 " + evtCount + "건 | 완료 " + matchCount + "경기";

    var row = _findStateRow(sheet, team, "진행중");
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
  if (!sheet) return { success: true, found: false, message: "저장된 상태 없음" };

  if (!team) team = "기본팀";

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, found: false, message: "저장된 상태 없음" };

  var colCount = sheet.getLastColumn();

  if (colCount >= 6) {
    var row = _findStateRow(sheet, team, "진행중");
    if (row < 0) return { success: true, found: false, message: "저장된 상태 없음" };

    var rowData = sheet.getRange(row, 1, 1, 6).getValues()[0];
    var json = rowData[3];
    var savedAt = rowData[4];
    var summary = rowData[5];

    if (!json) return { success: true, found: false, message: "저장된 상태 없음" };

    try {
      var state = JSON.parse(json);
      return { success: true, found: true, state: state, savedAt: savedAt ? new Date(savedAt).toISOString() : null, summary: summary || "" };
    } catch (e) {
      return { success: false, found: false, error: "JSON 파싱 실패: " + e.message };
    }
  }

  // 이전 형식 호환 (3컬럼)
  var json = sheet.getRange("A2").getValue();
  var savedAt = sheet.getRange("B2").getValue();
  var summary = sheet.getRange("C2").getValue();
  if (!json) return { success: true, found: false, message: "저장된 상태 없음" };
  try {
    var state = JSON.parse(json);
    return { success: true, found: true, state: state, savedAt: savedAt ? new Date(savedAt).toISOString() : null, summary: summary || "" };
  } catch (e) {
    return { success: false, found: false, error: "JSON 파싱 실패: " + e.message };
  }
}

function _clearGameState(team) {
  if (!team) team = "기본팀";

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(STATE_SHEET_NAME);
    if (!sheet) return { success: true, message: "시트 없음" };

    var colCount = sheet.getLastColumn();

    if (colCount >= 6) {
      var row = _findStateRow(sheet, team, "진행중");
      if (row > 0) {
        sheet.deleteRow(row);
      }
      return { success: true, message: "상태 초기화 완료" };
    }

    // 이전 형식 호환
    sheet.getRange("A2:C2").clearContent();
    return { success: true, message: "상태 초기화 완료" };
  } finally {
    lock.releaseLock();
  }
}

function _finalizeGameState(team) {
  if (!team) team = "기본팀";

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(STATE_SHEET_NAME);
    if (!sheet) return { success: false, error: "시트 없음" };

    var colCount = sheet.getLastColumn();

    if (colCount >= 6) {
      var row = _findStateRow(sheet, team, "진행중");
      if (row < 0) return { success: false, error: "진행중인 경기 없음" };

      sheet.getRange(row, 3).setValue("확정");
      sheet.getRange(row, 5).setValue(new Date().toISOString());
      return { success: true, message: "경기 확정 완료" };
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
  if (colCount < 6) return { success: true, history: [] };

  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var history = [];

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === team && String(data[i][2]).trim() === "확정") {
      history.push({
        team: String(data[i][0]).trim(),
        gameDate: String(data[i][1]).trim(),
        status: "확정",
        stateJson: String(data[i][3]),
        savedAt: data[i][4] ? new Date(data[i][4]).toISOString() : null,
        summary: String(data[i][5]) || "",
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

function _writePointLog(data) {
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
    var sheet = ss.getSheetByName(POINT_LOG_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(POINT_LOG_SHEET);
      sheet.getRange("A1:J1").setValues([["경기일자","경기번호","내팀","상대팀","득점선수","어시선수","자책골","실점키퍼명","입력시간","팀이름"]]);
      sheet.getRange("A1:J1").setFontWeight("bold");
    }

    var values = rows.map(function(e) {
      return [
        e.gameDate, e.matchId, e.myTeam || "", e.opponentTeam || "",
        e.scorer || "", e.assist || "", e.ownGoalPlayer || "",
        e.concedingGk || "", e.inputTime || new Date().toISOString(), teamName,
      ];
    });

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 10).setValues(values);
    return { success: true, count: values.length };
  } finally {
    lock.releaseLock();
  }
}

function _writePlayerLog(data) {
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
    var sheet = ss.getSheetByName(PLAYER_LOG_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(PLAYER_LOG_SHEET);
      sheet.getRange("A1:L1").setValues([["경기일자","선수","골","어시","역주행","실점","클린시트","크로바","고구마","키퍼경기수","입력시간","팀이름"]]);
      sheet.getRange("A1:L1").setFontWeight("bold");
    }

    var values = rows.map(function(p) {
      return [
        p.gameDate, p.name,
        Number(p.goals) || 0, Number(p.assists) || 0, Number(p.owngoals) || 0,
        Number(p.conceded) || 0, Number(p.cleanSheets) || 0,
        Number(p.crova) || 0, Number(p.goguma) || 0, Number(p.keeperGames) || 0,
        p.inputTime || new Date().toISOString(), teamName,
      ];
    });

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 12).setValues(values);
    return { success: true, count: values.length };
  } finally {
    lock.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════
// 누적 크로바/고구마 조회
// ═══════════════════════════════════════════════════════════════

function _getCumulativeBonus(team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PLAYER_LOG_SHEET);
  if (!sheet) return { success: true, crova: {}, goguma: {} };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, crova: {}, goguma: {} };

  var colCount = sheet.getLastColumn();
  var data = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();

  var crova = {};
  var goguma = {};

  for (var i = 0; i < data.length; i++) {
    if (team && colCount >= 12) {
      var rowTeam = String(data[i][11]).trim();
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
