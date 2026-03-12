
// ═══════════════════════════════════════════════════════════════
// ▼ 여기부터 기존 코드 맨 아래에 붙여넣기 ▼
// ═══════════════════════════════════════════════════════════════
// 마스터FC 풋살 웹앱 연동 (경기 상태 자동 저장/복원)
//
// 배포 방법:
// 1. 이 코드를 기존 Apps Script 맨 아래에 붙여넣고 저장
// 2. 배포 → 새 배포 → 유형: 웹 앱
//    - 실행 대상: 나
//    - 액세스 권한: 모든 사용자
// 3. 배포 URL을 복사 → index.html의 APPS_SCRIPT_URL에 붙여넣기
// ═══════════════════════════════════════════════════════════════

var STATE_SHEET_NAME = "앱_경기상태";

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "ping";
    var result;

    if (action === "loadState") {
      result = _loadGameState();
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
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var result;

    if (action === "saveState") {
      result = _saveGameState(body.state);
    } else if (action === "clearState") {
      result = _clearGameState();
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

// 앱_경기상태 시트 가져오기 (없으면 생성)
function _getOrCreateStateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STATE_SHEET_NAME);
    sheet.getRange("A1").setValue("상태JSON");
    sheet.getRange("B1").setValue("저장시간");
    sheet.getRange("C1").setValue("요약");
  }
  return sheet;
}

// 경기 상태 저장 (A2 한 셀에 JSON)
function _saveGameState(state) {
  if (!state) return { error: "state is empty" };

  var sheet = _getOrCreateStateSheet();
  var json = JSON.stringify(state);
  var now = new Date().toISOString();

  var evtCount = (state.allEvents || []).length;
  var matchCount = (state.completedMatches || []).length;
  var summary = (state.phase || "?") + " | 이벤트 " + evtCount + "건 | 완료 " + matchCount + "경기";

  sheet.getRange("A2").setValue(json);
  sheet.getRange("B2").setValue(now);
  sheet.getRange("C2").setValue(summary);

  return { success: true, savedAt: now, summary: summary };
}

// 저장된 상태 불러오기
function _loadGameState() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_NAME);

  if (!sheet) {
    return { found: false, message: "저장된 상태 없음" };
  }

  var json = sheet.getRange("A2").getValue();
  var savedAt = sheet.getRange("B2").getValue();
  var summary = sheet.getRange("C2").getValue();

  if (!json) {
    return { found: false, message: "저장된 상태 없음" };
  }

  try {
    var state = JSON.parse(json);
    return {
      found: true,
      state: state,
      savedAt: savedAt ? new Date(savedAt).toISOString() : null,
      summary: summary || "",
    };
  } catch (e) {
    return { found: false, error: "JSON 파싱 실패: " + e.message };
  }
}

// 상태 삭제 (경기 종료 후)
function _clearGameState() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_NAME);
  if (sheet) {
    sheet.getRange("A2:C2").clearContent();
  }
  return { success: true, message: "상태 초기화 완료" };
}

// ═══════════════════════════════════════════════════════════════
// ▲ 여기까지 붙여넣기 ▲
// ═══════════════════════════════════════════════════════════════
