// ═══════════════════════════════════════════════════════════════
// 마이그레이션 스크립트 (1회만 실행)
// Apps Script 에디터에서 실행: migrateAll()
// ═══════════════════════════════════════════════════════════════

/**
 * 전체 마이그레이션 실행
 * Apps Script 에디터에서 이 함수를 선택 후 ▶ 실행
 */
function migrateAll() {
  var msg = [];
  msg.push(migrateAuthSheet());
  msg.push(migrateStateSheet());
  Logger.log("=== 마이그레이션 완료 ===\n" + msg.join("\n"));
  SpreadsheetApp.getUi().alert("마이그레이션 완료!\n\n" + msg.join("\n"));
}

/**
 * 회원인증 시트 마이그레이션
 * 기존: A=이름, B=휴대폰뒷자리
 * 변경: A=팀이름, B=모드, C=이름, D=휴대폰뒷자리, E=역할
 */
function migrateAuthSheet() {
  var TEAM_NAME = "마스터FC";  // ← 여기에 팀이름 입력
  var MODE = "풋살";           // ← 풋살 또는 축구
  var DEFAULT_ROLE = "멤버";   // 기본 역할

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("회원인증");
  if (!sheet) return "회원인증 시트 없음 - 건너뜀";

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  // 이미 마이그레이션된 경우 (5컬럼 이상)
  if (lastCol >= 5) {
    var header = sheet.getRange("A1").getValue();
    if (String(header).trim() === "팀이름") {
      return "회원인증: 이미 마이그레이션됨 (건너뜀)";
    }
  }

  if (lastRow < 1) return "회원인증: 데이터 없음";

  // 기존 데이터 읽기 (A=이름, B=번호)
  var oldData = sheet.getRange(2, 1, Math.max(lastRow - 1, 1), 2).getValues();

  // 시트 초기화
  sheet.clear();

  // 새 헤더
  sheet.getRange("A1:E1").setValues([["팀이름", "모드", "이름", "휴대폰뒷자리", "역할"]]);
  sheet.getRange("A1:E1").setFontWeight("bold");

  // 데이터 변환
  if (lastRow >= 2) {
    var newData = [];
    for (var i = 0; i < oldData.length; i++) {
      var name = String(oldData[i][0]).trim();
      var phone = String(oldData[i][1]).trim();
      if (!name) continue;
      newData.push([TEAM_NAME, MODE, name, phone, DEFAULT_ROLE]);
    }
    if (newData.length > 0) {
      sheet.getRange(2, 1, newData.length, 5).setValues(newData);
    }
    return "회원인증: " + newData.length + "명 마이그레이션 완료 (팀: " + TEAM_NAME + ")";
  }

  return "회원인증: 헤더만 변경 (데이터 없음)";
}

/**
 * 앱_경기상태 시트 마이그레이션
 * 기존: A=상태JSON, B=저장시간, C=요약 (A2 한 셀)
 * 변경: A=팀이름, B=경기일자, C=상태, D=상태JSON, E=저장시간, F=요약
 */
function migrateStateSheet() {
  var TEAM_NAME = "마스터FC";  // ← 위와 동일하게 입력

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("앱_경기상태");
  if (!sheet) return "앱_경기상태 시트 없음 - 건너뜀";

  var lastCol = sheet.getLastColumn();

  // 이미 마이그레이션된 경우
  if (lastCol >= 6) {
    var header = sheet.getRange("A1").getValue();
    if (String(header).trim() === "팀이름") {
      return "앱_경기상태: 이미 마이그레이션됨 (건너뜀)";
    }
  }

  // 기존 데이터 읽기
  var oldJson = sheet.getRange("A2").getValue();
  var oldTime = sheet.getRange("B2").getValue();
  var oldSummary = sheet.getRange("C2").getValue();

  // 시트 초기화
  sheet.clear();

  // 새 헤더
  sheet.getRange("A1:F1").setValues([["팀이름", "경기일자", "상태", "상태JSON", "저장시간", "요약"]]);
  sheet.getRange("A1:F1").setFontWeight("bold");

  // 기존 진행중 데이터가 있으면 마이그레이션
  if (oldJson) {
    var gameDate = new Date().toISOString().slice(0, 10);
    try {
      var state = JSON.parse(oldJson);
      // 상태에서 날짜 추출 시도
      if (state.lastEditTime) {
        gameDate = new Date(state.lastEditTime).toISOString().slice(0, 10);
      }
    } catch(e) {}

    sheet.getRange(2, 1, 1, 6).setValues([[
      TEAM_NAME,
      gameDate,
      "진행중",
      oldJson,
      oldTime || new Date().toISOString(),
      oldSummary || ""
    ]]);
    return "앱_경기상태: 진행중 데이터 1건 마이그레이션 완료";
  }

  return "앱_경기상태: 헤더만 변경 (진행중 데이터 없음)";
}

// ═══════════════════════════════════════════════════════════════
// 포인트로그/선수별집계 시트는 기존 데이터 유지
// 새 컬럼(팀이름)은 앞으로 기록되는 것부터 자동 추가됨
// 기존 데이터에 팀이름을 채우고 싶으면 아래 함수 실행
// ═══════════════════════════════════════════════════════════════
function migrateLogSheets() {
  var TEAM_NAME = "마스터FC";  // ← 동일하게 입력

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var msg = [];

  // 포인트로그: 기존 9컬럼 → 10컬럼 (J=팀이름)
  var pointSheet = ss.getSheetByName("포인트로그");
  if (pointSheet) {
    var lastRow = pointSheet.getLastRow();
    var lastCol = pointSheet.getLastColumn();
    if (lastCol === 9 && lastRow >= 2) {
      // 헤더 추가
      pointSheet.getRange("J1").setValue("팀이름").setFontWeight("bold");
      // 기존 데이터에 팀이름 채우기
      var fillData = [];
      for (var i = 0; i < lastRow - 1; i++) fillData.push([TEAM_NAME]);
      pointSheet.getRange(2, 10, lastRow - 1, 1).setValues(fillData);
      msg.push("포인트로그: " + (lastRow - 1) + "행에 팀이름 추가");
    } else if (lastCol >= 10) {
      msg.push("포인트로그: 이미 10컬럼 이상 (건너뜀)");
    } else {
      msg.push("포인트로그: 데이터 없음");
    }
  }

  // 선수별집계: 기존 11컬럼 → 12컬럼 (L=팀이름)
  var playerSheet = ss.getSheetByName("선수별집계기록로그");
  if (playerSheet) {
    var lastRow = playerSheet.getLastRow();
    var lastCol = playerSheet.getLastColumn();
    if (lastCol === 11 && lastRow >= 2) {
      playerSheet.getRange("L1").setValue("팀이름").setFontWeight("bold");
      var fillData = [];
      for (var i = 0; i < lastRow - 1; i++) fillData.push([TEAM_NAME]);
      playerSheet.getRange(2, 12, lastRow - 1, 1).setValues(fillData);
      msg.push("선수별집계: " + (lastRow - 1) + "행에 팀이름 추가");
    } else if (lastCol >= 12) {
      msg.push("선수별집계: 이미 12컬럼 이상 (건너뜀)");
    } else {
      msg.push("선수별집계: 데이터 없음");
    }
  }

  var result = msg.join("\n") || "변경사항 없음";
  Logger.log(result);
  SpreadsheetApp.getUi().alert("로그 시트 마이그레이션\n\n" + result);
}
