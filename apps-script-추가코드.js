
// ═══════════════════════════════════════════════════════════════
// ▼ 여기부터 기존 코드 맨 아래에 붙여넣기 ▼
// ═══════════════════════════════════════════════════════════════
// 풋살 웹앱 연동 (멀티팀 + 과거경기 조회)
//
// 배포 방법:
// 1. 이 코드를 기존 Apps Script 맨 아래에 붙여넣고 저장
// 2. 배포 → 새 배포 → 유형: 웹 앱
//    - 실행 대상: 나
//    - 액세스 권한: 모든 사용자
// 3. 배포 URL을 복사 → index.html의 APPS_SCRIPT_URL에 붙여넣기
// ═══════════════════════════════════════════════════════════════

var STATE_SHEET_NAME = "앱_경기상태";
var AUTH_SHEET_NAME = "회원인증";
// 회원인증 시트 컬럼: A=팀이름, B=모드(풋살/축구), C=이름, D=휴대폰뒷자리, E=역할(관리자/멤버)
// 앱_경기상태 시트 컬럼: A=팀이름, B=경기일자, C=상태(진행중/확정), D=상태JSON, E=저장시간, F=요약

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "ping";
    var result;

    // 인증 검증 (ping 제외)
    if (action !== "ping") {
      var authToken = (e && e.parameter && e.parameter.authToken) || "";
      if (!_verifyAuthToken(authToken)) {
        return ContentService
          .createTextOutput(JSON.stringify({ error: "인증 실패", authRequired: true }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    if (action === "loadState") {
      var team = (e && e.parameter && e.parameter.team) || "";
      result = _loadGameState(team);
    } else if (action === "getHistory") {
      var team = (e && e.parameter && e.parameter.team) || "";
      result = _getHistory(team);
    } else if (action === "ping") {
      result = { ok: true, time: new Date().toISOString() };
    } else {
      result = { error: "Unknown action: " + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return ContentService
        .createTextOutput(JSON.stringify({ error: "잘못된 요청 형식" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var action = body.action;
    var result;

    // 인증 검증 (verifyAuth 자체는 제외)
    if (action !== "verifyAuth") {
      var authToken = body.authToken || "";
      if (!_verifyAuthToken(authToken)) {
        return ContentService
          .createTextOutput(JSON.stringify({ error: "인증 실패", authRequired: true }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    if (action === "verifyAuth") {
      result = _verifyAuth(body.name, body.phone4);
    } else if (action === "saveState") {
      result = _saveGameState(body.state, body.team, body.gameDate);
    } else if (action === "clearState") {
      result = _clearGameState(body.team, body.gameDate);
    } else if (action === "finalizeState") {
      result = _finalizeGameState(body.team, body.gameDate);
    } else if (action === "writePointLog") {
      result = _writePointLog(body.data);
    } else if (action === "writePlayerLog") {
      result = _writePlayerLog(body.data);
    } else {
      result = { error: "Unknown action: " + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ═══════════════════════════════════════════════════════════════
// 회원 인증 (멀티팀)
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

  // 새 형식 (5컬럼: 팀이름, 모드, 이름, 휴대폰뒷자리, 역할)
  if (colCount >= 5) {
    var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    var teams = [];
    for (var i = 0; i < data.length; i++) {
      var regTeam = String(data[i][0]).trim();
      var regMode = String(data[i][1]).trim() || "풋살";
      var regName = String(data[i][2]).trim();
      var regPhone = String(data[i][3]).trim().replace(/^0+/, "");
      var regRole = String(data[i][4]).trim() || "멤버";
      var inputPhone = String(phone4).trim().replace(/^0+/, "");
      if (regName === String(name).trim() && regPhone === inputPhone) {
        teams.push({ team: regTeam, mode: regMode, role: regRole });
      }
    }
    if (teams.length > 0) {
      return { success: true, name: String(name).trim(), teams: teams };
    }
    return { success: false, message: "이름 또는 번호가 일치하지 않습니다" };
  }

  // 이전 형식 호환 (2컬럼: 이름, 휴대폰뒷자리)
  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    var regName = String(data[i][0]).trim();
    var regPhone = String(data[i][1]).trim().replace(/^0+/, "");
    var inputPhone = String(phone4).trim().replace(/^0+/, "");
    if (regName === String(name).trim() && regPhone === inputPhone) {
      return { success: true, name: regName };
    }
  }
  return { success: false, message: "이름 또는 번호가 일치하지 않습니다" };
}

function _verifyAuthToken(token) {
  if (!token) return false;
  var parts = token.split(":");
  // 새 형식: "팀이름:이름:번호"
  if (parts.length === 3) {
    var result = _verifyAuth(parts[1], parts[2]);
    return result.success === true;
  }
  // 이전 형식 호환: "이름:번호"
  if (parts.length === 2) {
    var result = _verifyAuth(parts[0], parts[1]);
    return result.success === true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
// 앱_경기상태 시트 (멀티팀 + 과거기록 보존)
// 컬럼: A=팀이름, B=경기일자, C=상태(진행중/확정), D=상태JSON, E=저장시간, F=요약
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

// 팀+상태로 행 찾기
function _findStateRow(sheet, team, status) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === team && String(data[i][2]).trim() === status) {
      return i + 2; // 1-based row number
    }
  }
  return -1;
}

// 팀+날짜+상태로 행 찾기
function _findStateRowByDate(sheet, team, gameDate, status) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === team && String(data[i][1]).trim() === gameDate && String(data[i][2]).trim() === status) {
      return i + 2;
    }
  }
  return -1;
}

// 경기 상태 저장 (team+날짜로 upsert, "진행중" 행)
function _saveGameState(state, team, gameDate) {
  if (!state) return { error: "state is empty" };
  if (!team) team = "기본팀";
  if (!gameDate) gameDate = new Date().toISOString().slice(0, 10);

  var sheet = _getOrCreateStateSheet();
  var json = JSON.stringify(state);
  var now = new Date().toISOString();

  var evtCount = (state.allEvents || []).length;
  var matchCount = (state.completedMatches || []).length;
  var summary = (state.phase || "?") + " | 이벤트 " + evtCount + "건 | 완료 " + matchCount + "경기";

  // 기존 "진행중" 행 찾기
  var row = _findStateRow(sheet, team, "진행중");
  if (row > 0) {
    // 기존 행 업데이트
    sheet.getRange(row, 2, 1, 5).setValues([[gameDate, "진행중", json, now, summary]]);
  } else {
    // 새 행 추가
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, 1, 6).setValues([[team, gameDate, "진행중", json, now, summary]]);
  }

  return { success: true, savedAt: now, summary: summary };
}

// 저장된 상태 불러오기 (team의 "진행중" 행)
function _loadGameState(team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_NAME);
  if (!sheet) return { found: false, message: "저장된 상태 없음" };

  if (!team) team = "기본팀";

  // 새 형식: 팀으로 "진행중" 행 검색
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { found: false, message: "저장된 상태 없음" };

  var colCount = sheet.getLastColumn();

  // 새 형식 (6컬럼)
  if (colCount >= 6) {
    var row = _findStateRow(sheet, team, "진행중");
    if (row < 0) return { found: false, message: "저장된 상태 없음" };

    var rowData = sheet.getRange(row, 1, 1, 6).getValues()[0];
    var json = rowData[3];
    var savedAt = rowData[4];
    var summary = rowData[5];

    if (!json) return { found: false, message: "저장된 상태 없음" };

    try {
      var state = JSON.parse(json);
      return { found: true, state: state, savedAt: savedAt ? new Date(savedAt).toISOString() : null, summary: summary || "" };
    } catch (e) {
      return { found: false, error: "JSON 파싱 실패: " + e.message };
    }
  }

  // 이전 형식 호환 (3컬럼: A=상태JSON, B=저장시간, C=요약)
  var json = sheet.getRange("A2").getValue();
  var savedAt = sheet.getRange("B2").getValue();
  var summary = sheet.getRange("C2").getValue();
  if (!json) return { found: false, message: "저장된 상태 없음" };
  try {
    var state = JSON.parse(json);
    return { found: true, state: state, savedAt: savedAt ? new Date(savedAt).toISOString() : null, summary: summary || "" };
  } catch (e) {
    return { found: false, error: "JSON 파싱 실패: " + e.message };
  }
}

// 상태 삭제 (team의 "진행중" 행 삭제)
function _clearGameState(team, gameDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_NAME);
  if (!sheet) return { success: true, message: "시트 없음" };

  if (!team) team = "기본팀";

  var colCount = sheet.getLastColumn();

  // 새 형식
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
}

// "진행중" → "확정"으로 상태 변경 (삭제X, 과거기록 보존)
function _finalizeGameState(team, gameDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_NAME);
  if (!sheet) return { success: false, message: "시트 없음" };

  if (!team) team = "기본팀";
  if (!gameDate) gameDate = new Date().toISOString().slice(0, 10);

  var colCount = sheet.getLastColumn();

  if (colCount >= 6) {
    var row = _findStateRow(sheet, team, "진행중");
    if (row < 0) return { success: false, message: "진행중인 경기 없음" };

    // 상태를 "확정"으로 변경
    sheet.getRange(row, 3).setValue("확정");
    sheet.getRange(row, 5).setValue(new Date().toISOString());
    return { success: true, message: "경기 확정 완료" };
  }

  // 이전 형식: clearState와 동일하게 처리
  sheet.getRange("A2:C2").clearContent();
  return { success: true, message: "경기 확정 완료 (이전 형식)" };
}

// 팀의 "확정" 기록 목록 반환
function _getHistory(team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_NAME);
  if (!sheet) return { history: [] };

  if (!team) team = "기본팀";

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { history: [] };

  var colCount = sheet.getLastColumn();
  if (colCount < 6) return { history: [] };

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
        summary: String(data[i][5]) || ""
      });
    }
  }

  // 최신순 정렬
  history.sort(function(a, b) {
    return b.gameDate.localeCompare(a.gameDate);
  });

  return { history: history };
}

// ═══════════════════════════════════════════════════════════════
// 포인트로그 쓰기 (이벤트별 한 줄씩)
// 시트 컬럼: 경기일자, 경기번호, 내팀, 상대팀, 득점선수, 어시선수, 자책골, 실점키퍼명, 입력시간, 팀이름
// ═══════════════════════════════════════════════════════════════
var POINT_LOG_SHEET = "포인트로그";

function _writePointLog(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(POINT_LOG_SHEET);
  var teamName = data.team || "";
  if (!sheet) {
    sheet = ss.insertSheet(POINT_LOG_SHEET);
    sheet.getRange("A1:J1").setValues([["경기일자","경기번호","내팀","상대팀","득점선수","어시선수","자책골","실점키퍼명","입력시간","팀이름"]]);
    sheet.getRange("A1:J1").setFontWeight("bold");
  }
  var rows = data.events || [];
  if (rows.length === 0) return { success: true, message: "이벤트 없음", count: 0 };

  var values = rows.map(function(e) {
    return [
      e.gameDate,
      e.matchId,
      e.myTeam,
      e.opponentTeam,
      e.scorer || "",
      e.assist || "",
      e.ownGoalPlayer || "",
      e.concedingGk || "",
      e.inputTime,
      teamName
    ];
  });
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, values.length, 10).setValues(values);
  return { success: true, count: values.length };
}

// ═══════════════════════════════════════════════════════════════
// 선수별집계기록로그 쓰기 (선수당 한 줄)
// 시트 컬럼: 경기일자, 선수, 골, 어시, 역주행, 실점, 클린시트, 크로바, 고구마, 키퍼경기수, 입력시간, 팀이름
// ═══════════════════════════════════════════════════════════════
var PLAYER_LOG_SHEET = "선수별집계기록로그";

function _writePlayerLog(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PLAYER_LOG_SHEET);
  var teamName = data.team || "";
  if (!sheet) {
    sheet = ss.insertSheet(PLAYER_LOG_SHEET);
    sheet.getRange("A1:L1").setValues([["경기일자","선수","골","어시","역주행","실점","클린시트","크로바","고구마","키퍼경기수","입력시간","팀이름"]]);
    sheet.getRange("A1:L1").setFontWeight("bold");
  }
  var rows = data.players || [];
  if (rows.length === 0) return { success: true, message: "선수 데이터 없음", count: 0 };

  var values = rows.map(function(p) {
    return [
      p.gameDate,
      p.name,
      p.goals || 0,
      p.assists || 0,
      p.owngoals || 0,
      p.conceded || 0,
      p.cleanSheets || 0,
      p.crova || 0,
      p.goguma || 0,
      p.keeperGames || 0,
      p.inputTime,
      teamName
    ];
  });
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, values.length, 12).setValues(values);
  return { success: true, count: values.length };
}

// ═══════════════════════════════════════════════════════════════
// ▲ 여기까지 붙여넣기 ▲
// ═══════════════════════════════════════════════════════════════
