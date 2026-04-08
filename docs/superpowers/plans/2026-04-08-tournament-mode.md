# 축구 대회 모드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 축구 리그와 별도로 대회(토너먼트) 경기를 독립적으로 기록/관리하는 기능을 추가한다.

**Architecture:** 팀 대시보드에 "대회" 탭을 추가하고, 대회 선택 시 전용 대시보드(팀순위/일정/개인기록/분석/경기관리)로 진입한다. 데이터는 구글시트(대회별 시트 탭)에 저장하고 Firebase에 메타정보를 저장한다. 우리팀 경기는 기존 SoccerRecorder를 재사용하고, 타팀 경기는 스코어만 수동 입력한다.

**Tech Stack:** React 19, Vite, Firebase Realtime DB, Google Apps Script, Google Sheets

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/utils/tournamentBrackets.js` | 대진표 자동 생성 (풀리그/녹아웃) |
| `src/components/tournament/CreateTournament.jsx` | 대회 생성 폼 |
| `src/components/tournament/TournamentListTab.jsx` | 대회 목록 탭 (대시보드 5번째 탭) |
| `src/components/tournament/TournamentDashboard.jsx` | 대회 전용 대시보드 (4탭 컨테이너) |
| `src/components/tournament/TournamentStandings.jsx` | 팀 순위표 컴포넌트 |
| `src/components/tournament/TournamentSchedule.jsx` | 경기 일정 + 타팀 스코어 입력 |
| `src/components/tournament/TournamentMatchManager.jsx` | 경기관리 (우리팀 기록 + 타팀 스코어) |
| `src/components/tournament/TournamentPlayerRecords.jsx` | 개인기록 탭 |

### Modified Files
| File | Changes |
|------|---------|
| `apps-script/Code.js` | 대회 CRUD + 일정/이벤트로그/선수기록 읽기쓰기 함수 8개 + doPost 라우팅 |
| `src/services/appSync.js` | 대회 관련 API 메서드 8개 추가 |
| `src/components/dashboard/TeamDashboard.jsx` | "대회" 탭 추가, TournamentDashboard 렌더링 |

### Reused (no changes needed)
| File | Reuse |
|------|-------|
| `src/components/game/SoccerRecorder.jsx` | 우리팀 경기 이벤트 기록 |
| `src/components/game/LineupSelector.jsx` | 라인업 선택 |
| `src/components/game/SubstitutionModal.jsx` | 교체 모달 |
| `src/utils/soccerScoring.js` | 포인트 계산, 클린시트 판정 |

---

### Task 1: Tournament Brackets Utility

**Files:**
- Create: `src/utils/tournamentBrackets.js`

- [ ] **Step 1: Create tournamentBrackets.js**

```js
// src/utils/tournamentBrackets.js

/**
 * 풀리그 대진표 생성 (라운드로빈)
 * @param {string[]} teams - 참가팀 목록
 * @returns {Array<{matchNum, round, home, away}>}
 */
export function generateFullLeague(teams) {
  const matches = [];
  let matchNum = 1;
  const n = teams.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      matches.push({
        matchNum: matchNum++,
        round: `${Math.ceil(matchNum / Math.floor(n / 2))}R`,
        home: teams[i],
        away: teams[j],
      });
    }
  }
  // 라운드 재계산: n-1라운드, 각 라운드 n/2 경기
  const perRound = Math.floor(n / 2);
  matches.forEach((m, i) => { m.round = `${Math.floor(i / perRound) + 1}R`; });
  return matches;
}

/**
 * 녹아웃(토너먼트) 대진표 생성
 * @param {string[]} teams - 참가팀 목록 (2의 거듭제곱이 아니면 일부 부전승)
 * @returns {Array<{matchNum, round, home, away}>}
 */
export function generateKnockout(teams) {
  const matches = [];
  let matchNum = 1;
  // 라운드 이름 매핑
  const roundNames = (total) => {
    if (total <= 2) return ["결승"];
    if (total <= 4) return ["준결승", "결승"];
    if (total <= 8) return ["8강", "준결승", "결승"];
    if (total <= 16) return ["16강", "8강", "준결승", "결승"];
    return Array.from({ length: Math.ceil(Math.log2(total)) }, (_, i) => `${i + 1}R`);
  };
  const n = teams.length;
  const rounds = roundNames(n);
  // 1라운드: 팀 쌍 매칭
  const firstRoundPairs = Math.ceil(n / 2);
  for (let i = 0; i < firstRoundPairs; i++) {
    const home = teams[i * 2];
    const away = teams[i * 2 + 1] || "부전승";
    matches.push({ matchNum: matchNum++, round: rounds[0], home, away });
  }
  // 나머지 라운드: 빈 칸 (승자 결정 후 채움)
  let prevCount = firstRoundPairs;
  for (let r = 1; r < rounds.length; r++) {
    const count = Math.ceil(prevCount / 2);
    for (let i = 0; i < count; i++) {
      matches.push({ matchNum: matchNum++, round: rounds[r], home: "", away: "" });
    }
    prevCount = count;
  }
  return matches;
}

/**
 * 수동(자유) 대진 — 빈 일정 생성
 * @param {number} matchCount - 경기 수
 * @returns {Array<{matchNum, round, home, away}>}
 */
export function generateManual(matchCount) {
  return Array.from({ length: matchCount }, (_, i) => ({
    matchNum: i + 1,
    round: "",
    home: "",
    away: "",
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/tournamentBrackets.js
git commit -m "feat(tournament): add bracket generation utility"
```

---

### Task 2: Apps Script — Tournament Functions

**Files:**
- Modify: `apps-script/Code.js`

- [ ] **Step 1: Add tournament functions after the existing soccer functions**

Add these functions at the end of Code.js (before the closing comments), and add routing in `doPost`:

```js
// ═══════════════════════════════════════════════════════════════
// 대회 관리
// ═══════════════════════════════════════════════════════════════

function _createTournament(data) {
  if (!data || !data.id || !data.name) return { success: false, error: "필수 정보 누락" };
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 대회_목록 시트 (없으면 생성)
  var listSheet = ss.getSheetByName("대회_목록");
  if (!listSheet) {
    listSheet = ss.insertSheet("대회_목록");
    listSheet.getRange("A1:H1").setValues([["대회ID","대회명","시작일","종료일","참가팀","대진형태","상태","생성시간"]]);
    listSheet.getRange("A1:H1").setFontWeight("bold");
  }

  // 메타 행 추가
  var lastRow = listSheet.getLastRow();
  listSheet.getRange(lastRow + 1, 1, 1, 8).setValues([[
    data.id, data.name, data.startDate || "", data.endDate || "",
    (data.teams || []).join(","), data.format || "manual", "active", _kstNow()
  ]]);

  // 일정 시트 생성
  var schedSheet = ss.insertSheet("대회_" + data.id + "_일정");
  schedSheet.getRange("A1:I1").setValues([["경기번호","날짜","라운드","홈팀","원정팀","홈스코어","원정스코어","우리팀여부","상태"]]);
  schedSheet.getRange("A1:I1").setFontWeight("bold");

  // 초기 일정 데이터 삽입
  var matches = data.matches || [];
  if (matches.length > 0) {
    var ourTeam = data.ourTeam || "";
    var values = matches.map(function(m) {
      var isOurs = (m.home === ourTeam || m.away === ourTeam) ? "Y" : "N";
      return [m.matchNum, m.date || "", m.round || "", m.home || "", m.away || "", "", "", isOurs, "scheduled"];
    });
    schedSheet.getRange(2, 1, values.length, 9).setValues(values);
  }

  // 이벤트로그 시트 생성
  var eventSheet = ss.insertSheet("대회_" + data.id + "_이벤트로그");
  eventSheet.getRange("A1:G1").setValues([["경기번호","상대팀명","이벤트","선수","관련선수","포지션","입력시간"]]);
  eventSheet.getRange("A1:G1").setFontWeight("bold");

  // 선수기록 시트 생성
  var playerSheet = ss.insertSheet("대회_" + data.id + "_선수기록");
  playerSheet.getRange("A1:J1").setValues([["선수명","전체경기","필드경기","키퍼경기","골","어시","클린시트","실점","자책골","포인트"]]);
  playerSheet.getRange("A1:J1").setFontWeight("bold");

  return { success: true, id: data.id };
}

function _getTournamentList(team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_목록");
  if (!sheet) return { success: true, tournaments: [] };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, tournaments: [] };
  var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  var list = data.filter(function(r) { return r[0]; }).map(function(r) {
    return { id: String(r[0]), name: String(r[1]), startDate: _toDateStr(r[2]), endDate: _toDateStr(r[3]),
      teams: String(r[4]).split(",").map(function(t) { return t.trim(); }).filter(Boolean),
      format: String(r[5]), status: String(r[6]) };
  });
  return { success: true, tournaments: list };
}

function _getTournamentSchedule(tournamentId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_일정");
  if (!sheet) return { success: false, error: "일정 시트 없음" };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, matches: [] };
  var data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  var matches = data.filter(function(r) { return r[0]; }).map(function(r) {
    return { matchNum: Number(r[0]), date: _toDateStr(r[1]), round: String(r[2]),
      home: String(r[3]), away: String(r[4]),
      homeScore: r[5] !== "" ? Number(r[5]) : null, awayScore: r[6] !== "" ? Number(r[6]) : null,
      isOurs: String(r[7]) === "Y", status: String(r[8]) };
  });
  return { success: true, matches: matches };
}

function _updateTournamentMatchScore(tournamentId, matchNum, homeScore, awayScore) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_일정");
  if (!sheet) return { success: false, error: "일정 시트 없음" };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, error: "데이터 없음" };
  var data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  for (var i = 0; i < data.length; i++) {
    if (Number(data[i][0]) === matchNum) {
      sheet.getRange(i + 2, 6).setValue(homeScore);
      sheet.getRange(i + 2, 7).setValue(awayScore);
      sheet.getRange(i + 2, 9).setValue("finished");
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
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_선수기록");
  if (!sheet) return { success: false, error: "선수기록 시트 없음" };
  // 기존 데이터 클리어 후 재작성 (누적이 아닌 전체 갱신)
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
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_선수기록");
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
```

- [ ] **Step 2: Add routing in doPost**

In the `doPost` function, add before `return _errorResponse("Unknown action: " + action);`:

```js
    } else if (action === "createTournament") {
      return _jsonResponse(_createTournament(body.data));
    } else if (action === "getTournamentList") {
      return _jsonResponse(_getTournamentList(requestTeam));
    } else if (action === "getTournamentSchedule") {
      return _jsonResponse(_getTournamentSchedule(body.tournamentId));
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
```

- [ ] **Step 3: Commit**

```bash
git add apps-script/Code.js
git commit -m "feat(tournament): add Apps Script tournament CRUD functions"
```

---

### Task 3: AppSync — Tournament API Methods

**Files:**
- Modify: `src/services/appSync.js`

- [ ] **Step 1: Add tournament methods to AppSync object**

Add before the `verifyAuth` method in the AppSync object:

```js
  // ── 대회 ──

  async createTournament(data) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "createTournament", data: { ...data, team }, authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("대회 생성 실패:", e.message); return null; }
  },

  async getTournamentList() {
    if (!this.enabled()) return [];
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getTournamentList", team, authToken: this._getAuthToken() }),
      });
      const data = await resp.json();
      return data.tournaments || [];
    } catch (e) { console.warn("대회 목록 조회 실패:", e.message); return []; }
  },

  async getTournamentSchedule(tournamentId) {
    if (!this.enabled()) return [];
    try {
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getTournamentSchedule", tournamentId, team: this._getTeam(), authToken: this._getAuthToken() }),
      });
      const data = await resp.json();
      return data.matches || [];
    } catch (e) { console.warn("대회 일정 조회 실패:", e.message); return []; }
  },

  async updateTournamentMatchScore(tournamentId, matchNum, homeScore, awayScore) {
    if (!this.enabled()) return null;
    try {
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "updateTournamentMatchScore", tournamentId, matchNum, homeScore, awayScore, team: this._getTeam(), authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("스코어 업데이트 실패:", e.message); return null; }
  },

  async writeTournamentEventLog(tournamentId, data) {
    if (!this.enabled()) return null;
    try {
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writeTournamentEventLog", tournamentId, data, team: this._getTeam(), authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("대회 이벤트로그 저장 실패:", e.message); return null; }
  },

  async writeTournamentPlayerRecord(tournamentId, data) {
    if (!this.enabled()) return null;
    try {
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writeTournamentPlayerRecord", tournamentId, data, team: this._getTeam(), authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("대회 선수기록 저장 실패:", e.message); return null; }
  },

  async getTournamentPlayerRecords(tournamentId) {
    if (!this.enabled()) return [];
    try {
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getTournamentPlayerRecords", tournamentId, team: this._getTeam(), authToken: this._getAuthToken() }),
      });
      const data = await resp.json();
      return data.players || [];
    } catch (e) { console.warn("대회 선수기록 조회 실패:", e.message); return []; }
  },

  async getTournamentEventLog(tournamentId) {
    if (!this.enabled()) return [];
    try {
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getTournamentEventLog", tournamentId, team: this._getTeam(), authToken: this._getAuthToken() }),
      });
      const data = await resp.json();
      return data.events || [];
    } catch (e) { console.warn("대회 이벤트로그 조회 실패:", e.message); return []; }
  },
```

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/services/appSync.js
git commit -m "feat(tournament): add AppSync tournament API methods"
```

---

### Task 4: CreateTournament Component

**Files:**
- Create: `src/components/tournament/CreateTournament.jsx`

- [ ] **Step 1: Create the component**

This is a form for creating a new tournament: name, dates, teams, format, and schedule generation.

```jsx
// src/components/tournament/CreateTournament.jsx
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { generateFullLeague, generateKnockout, generateManual } from '../../utils/tournamentBrackets';

export default function CreateTournament({ ourTeamName, onSubmit, onCancel }) {
  const { C } = useTheme();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [format, setFormat] = useState("fullLeague");
  const [teamInput, setTeamInput] = useState("");
  const [teams, setTeams] = useState([ourTeamName]);
  const [matchCount, setMatchCount] = useState(6);

  const addTeam = () => {
    const t = teamInput.trim();
    if (t && !teams.includes(t)) { setTeams(prev => [...prev, t]); setTeamInput(""); }
  };

  const removeTeam = (t) => {
    if (t === ourTeamName) return; // 우리팀 제거 불가
    setTeams(prev => prev.filter(x => x !== t));
  };

  const handleSubmit = () => {
    if (!name.trim()) { alert("대회명을 입력하세요."); return; }
    if (teams.length < 2) { alert("참가팀이 2팀 이상이어야 합니다."); return; }
    let matches = [];
    if (format === "fullLeague") matches = generateFullLeague(teams);
    else if (format === "knockout") matches = generateKnockout(teams);
    else matches = generateManual(matchCount);

    const id = "t_" + Date.now();
    onSubmit({ id, name: name.trim(), startDate, endDate, teams, format, matches, ourTeam: ourTeamName });
  };

  const is = {
    input: { padding: "8px 12px", borderRadius: 8, fontSize: 14, background: C.cardLight, color: C.white, border: `1px solid ${C.grayDark}`, width: "100%", boxSizing: "border-box" },
    label: { fontSize: 12, color: C.gray, marginBottom: 4, display: "block" },
    section: { marginBottom: 14 },
  };

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.white, marginBottom: 16 }}>새 대회 만들기</div>

      <div style={is.section}>
        <label style={is.label}>대회명</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="2026 여름 챔피언스컵" style={is.input} />
      </div>

      <div style={{ display: "flex", gap: 8, ...is.section }}>
        <div style={{ flex: 1 }}>
          <label style={is.label}>시작일</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={is.input} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={is.label}>종료일</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={is.input} />
        </div>
      </div>

      <div style={is.section}>
        <label style={is.label}>참가팀 ({teams.length}팀)</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {teams.map(t => (
            <div key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: t === ourTeamName ? `${C.accent}22` : C.cardLight, fontSize: 12, color: t === ourTeamName ? C.accent : C.white, border: t === ourTeamName ? `1px solid ${C.accent}` : "none" }}>
              <span>{t}</span>
              {t !== ourTeamName && <span onClick={() => removeTeam(t)} style={{ fontSize: 10, color: C.red, cursor: "pointer", fontWeight: 700 }}>✕</span>}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={teamInput} onChange={e => setTeamInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addTeam()} placeholder="상대팀 이름" style={{ ...is.input, flex: 1 }} />
          <button onClick={addTeam} style={{ padding: "8px 14px", borderRadius: 8, background: C.accent, color: C.bg, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>추가</button>
        </div>
      </div>

      <div style={is.section}>
        <label style={is.label}>대진 형태</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[{ key: "fullLeague", label: "풀리그" }, { key: "knockout", label: "녹아웃" }, { key: "manual", label: "자유(수동)" }].map(f => (
            <button key={f.key} onClick={() => setFormat(f.key)}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: format === f.key ? C.accent : C.grayDark, color: format === f.key ? C.bg : C.white }}>
              {f.label}
            </button>
          ))}
        </div>
        {format === "manual" && (
          <div style={{ marginTop: 8 }}>
            <label style={is.label}>경기 수</label>
            <input type="number" value={matchCount} onChange={e => setMatchCount(Number(e.target.value) || 1)} min={1} style={{ ...is.input, width: 80 }} />
          </div>
        )}
        {format === "fullLeague" && teams.length >= 2 && (
          <div style={{ marginTop: 6, fontSize: 11, color: C.gray }}>
            {teams.length}팀 풀리그 = {teams.length * (teams.length - 1) / 2}경기
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", background: C.grayDark, color: C.grayLight }}>취소</button>
        <button onClick={handleSubmit} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", background: C.accent, color: C.bg }}>대회 생성</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tournament/CreateTournament.jsx
git commit -m "feat(tournament): add CreateTournament component"
```

---

### Task 5: TournamentStandings Component

**Files:**
- Create: `src/components/tournament/TournamentStandings.jsx`

- [ ] **Step 1: Create the component**

Calculates team standings from schedule match results.

```jsx
// src/components/tournament/TournamentStandings.jsx
import { useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function TournamentStandings({ schedule, ourTeamName }) {
  const { C } = useTheme();

  const standings = useMemo(() => {
    const stats = {};
    const ensure = (name) => {
      if (!stats[name]) stats[name] = { team: name, games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0 };
    };
    for (const m of schedule) {
      if (m.homeScore === null || m.awayScore === null) continue;
      if (!m.home || !m.away) continue;
      ensure(m.home); ensure(m.away);
      stats[m.home].games++; stats[m.away].games++;
      stats[m.home].gf += m.homeScore; stats[m.home].ga += m.awayScore;
      stats[m.away].gf += m.awayScore; stats[m.away].ga += m.homeScore;
      if (m.homeScore > m.awayScore) { stats[m.home].wins++; stats[m.home].points += 3; stats[m.away].losses++; }
      else if (m.awayScore > m.homeScore) { stats[m.away].wins++; stats[m.away].points += 3; stats[m.home].losses++; }
      else { stats[m.home].draws++; stats[m.away].draws++; stats[m.home].points++; stats[m.away].points++; }
    }
    return Object.values(stats).sort((a, b) => (b.points - a.points) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf));
  }, [schedule]);

  if (standings.length === 0) return <div style={{ textAlign: "center", padding: 16, color: C.gray, fontSize: 13 }}>아직 완료된 경기가 없습니다</div>;

  const th = { padding: "6px 3px", textAlign: "center", color: C.gray, borderBottom: `1px solid ${C.grayDarker}`, fontWeight: 600, fontSize: 10 };
  const td = (hl) => ({ padding: "6px 3px", textAlign: "center", borderBottom: `1px solid ${C.grayDarker}`, fontWeight: hl ? 700 : 400, color: hl ? C.white : C.gray, fontSize: 11 });

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 8 }}>팀 순위</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{["#", "팀", "경기", "승", "무", "패", "득", "실", "득실", "승점"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {standings.map((t, i) => (
            <tr key={t.team} style={{ background: t.team === ourTeamName ? `${C.accent}11` : "transparent" }}>
              <td style={td()}>{i + 1}</td>
              <td style={{ ...td(true), textAlign: "left" }}>{t.team}{t.team === ourTeamName && " ★"}</td>
              <td style={td()}>{t.games}</td>
              <td style={td()}>{t.wins}</td>
              <td style={td()}>{t.draws}</td>
              <td style={td()}>{t.losses}</td>
              <td style={td()}>{t.gf}</td>
              <td style={td()}>{t.ga}</td>
              <td style={td()}>{t.gf - t.ga}</td>
              <td style={td(true)}>{t.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tournament/TournamentStandings.jsx
git commit -m "feat(tournament): add TournamentStandings component"
```

---

### Task 6: TournamentSchedule Component

**Files:**
- Create: `src/components/tournament/TournamentSchedule.jsx`

- [ ] **Step 1: Create the component**

Shows all matches, highlights our team's matches, allows score input for other teams' matches.

```jsx
// src/components/tournament/TournamentSchedule.jsx
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function TournamentSchedule({ schedule, ourTeamName, onUpdateScore }) {
  const { C } = useTheme();
  const [editingMatch, setEditingMatch] = useState(null);
  const [editHome, setEditHome] = useState("");
  const [editAway, setEditAway] = useState("");

  const startEdit = (m) => {
    setEditingMatch(m.matchNum);
    setEditHome(m.homeScore !== null ? String(m.homeScore) : "");
    setEditAway(m.awayScore !== null ? String(m.awayScore) : "");
  };

  const saveScore = (matchNum) => {
    const h = parseInt(editHome);
    const a = parseInt(editAway);
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) { alert("올바른 스코어를 입력하세요."); return; }
    onUpdateScore(matchNum, h, a);
    setEditingMatch(null);
  };

  // 날짜별 그룹핑
  const grouped = {};
  schedule.forEach(m => {
    const key = m.date || "미정";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  });

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 10 }}>경기 일정</div>
      {Object.entries(grouped).map(([date, matches]) => (
        <div key={date} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.gray, fontWeight: 600, marginBottom: 4, padding: "4px 0", borderBottom: `1px solid ${C.grayDarker}` }}>{date}</div>
          {matches.map(m => {
            const isOurs = m.home === ourTeamName || m.away === ourTeamName;
            const isFinished = m.homeScore !== null && m.awayScore !== null;
            const isEditing = editingMatch === m.matchNum;
            return (
              <div key={m.matchNum} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", marginBottom: 3,
                background: isOurs ? `${C.accent}11` : C.cardLight, borderRadius: 8, borderLeft: isOurs ? `3px solid ${C.accent}` : "3px solid transparent",
              }}>
                <span style={{ fontSize: 10, color: C.grayDark, minWidth: 30 }}>{m.round}</span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: isOurs ? 700 : 400, color: C.white, textAlign: "right" }}>{m.home || "미정"}</span>
                {isEditing ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 100, justifyContent: "center" }}>
                    <input value={editHome} onChange={e => setEditHome(e.target.value)} style={{ width: 30, padding: "4px", borderRadius: 4, border: `1px solid ${C.grayDark}`, background: C.card, color: C.white, textAlign: "center", fontSize: 13 }} />
                    <span style={{ color: C.gray }}>:</span>
                    <input value={editAway} onChange={e => setEditAway(e.target.value)} style={{ width: 30, padding: "4px", borderRadius: 4, border: `1px solid ${C.grayDark}`, background: C.card, color: C.white, textAlign: "center", fontSize: 13 }} />
                    <button onClick={() => saveScore(m.matchNum)} style={{ padding: "2px 6px", borderRadius: 4, background: C.green, color: C.bg, border: "none", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>OK</button>
                  </div>
                ) : (
                  <div onClick={() => !isOurs && startEdit(m)} style={{ minWidth: 60, textAlign: "center", cursor: isOurs ? "default" : "pointer" }}>
                    {isFinished ? (
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{m.homeScore} : {m.awayScore}</span>
                    ) : (
                      <span style={{ fontSize: 11, color: C.grayDark }}>{isOurs ? "경기관리" : "스코어 입력"}</span>
                    )}
                  </div>
                )}
                <span style={{ flex: 1, fontSize: 12, fontWeight: isOurs ? 700 : 400, color: C.white }}>{m.away || "미정"}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tournament/TournamentSchedule.jsx
git commit -m "feat(tournament): add TournamentSchedule component"
```

---

### Task 7: TournamentMatchManager Component

**Files:**
- Create: `src/components/tournament/TournamentMatchManager.jsx`

- [ ] **Step 1: Create the component**

Manages our team's match recording (reuses SoccerRecorder + LineupSelector) and other teams' score entry.

```jsx
// src/components/tournament/TournamentMatchManager.jsx
import { useState, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import LineupSelector from '../game/LineupSelector';
import SoccerRecorder from '../game/SoccerRecorder';
import { calcSoccerScore, getCleanSheetPlayers, calcSoccerPlayerStats, calcSoccerPlayerPoint, buildEventLogRows } from '../../utils/soccerScoring';
import { generateEventId } from '../../utils/idGenerator';
import AppSync from '../../services/appSync';

export default function TournamentMatchManager({ tournament, schedule, ourTeamName, attendees, gameSettings, onScheduleUpdate }) {
  const { C } = useTheme();
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [phase, setPhase] = useState("list"); // list | lineup | playing | finished
  const [currentMatch, setCurrentMatch] = useState(null); // soccerMatch object for recording
  const [scoreEdit, setScoreEdit] = useState(null); // { matchNum, home, away }

  const ourMatches = schedule.filter(m => m.isOurs && m.status !== "finished");
  const otherMatches = schedule.filter(m => !m.isOurs && m.status !== "finished");
  const finishedMatches = schedule.filter(m => m.status === "finished");

  // 라인업 확정 → 경기 시작
  const handleLineupConfirm = ({ lineup, gk, defenders }) => {
    const opponent = selectedMatch.home === ourTeamName ? selectedMatch.away : selectedMatch.home;
    setCurrentMatch({
      matchIdx: 0, opponent, lineup, gk, defenders,
      events: [], startedAt: Date.now(), ourScore: 0, opponentScore: 0, status: "playing",
    });
    setPhase("playing");
  };

  // 이벤트 추가/삭제
  const handleAddEvent = (event) => {
    setCurrentMatch(prev => {
      const events = [...prev.events, { ...event, id: event.id || generateEventId(), timestamp: event.timestamp || Date.now() }];
      let ourScore = 0, opponentScore = 0;
      for (const ev of events) {
        if (ev.type === "goal") ourScore++;
        else if (ev.type === "owngoal" || ev.type === "opponentGoal") opponentScore++;
      }
      return { ...prev, events, ourScore, opponentScore };
    });
  };

  const handleDeleteEvent = (eventId) => {
    setCurrentMatch(prev => {
      const events = prev.events.filter(e => e.id !== eventId);
      let ourScore = 0, opponentScore = 0;
      for (const ev of events) {
        if (ev.type === "goal") ourScore++;
        else if (ev.type === "owngoal" || ev.type === "opponentGoal") opponentScore++;
      }
      return { ...prev, events, ourScore, opponentScore };
    });
  };

  // 경기 종료 → 스코어 반영 + 이벤트로그 저장
  const handleFinishMatch = async () => {
    const { ourScore, opponentScore } = calcSoccerScore(currentMatch.events);
    const isHome = selectedMatch.home === ourTeamName;
    const homeScore = isHome ? ourScore : opponentScore;
    const awayScore = isHome ? opponentScore : ourScore;

    // 스코어 업데이트
    await AppSync.updateTournamentMatchScore(tournament.id, selectedMatch.matchNum, homeScore, awayScore);

    // 이벤트로그 저장
    const finished = [{ ...currentMatch, status: "finished", matchIdx: selectedMatch.matchNum - 1 }];
    const eventRows = buildEventLogRows(finished, tournament.startDate || new Date().toISOString().slice(0, 10));
    await AppSync.writeTournamentEventLog(tournament.id, { events: eventRows });

    // 선수기록 갱신 (기존 이벤트로그 전체 조회 후 재집계)
    const allEvents = await AppSync.getTournamentEventLog(tournament.id);
    // 간이 집계: 이벤트로그에서 선수별 골/어시 등 추출
    const pStats = {};
    const ensure = (n) => { if (!pStats[n]) pStats[n] = { name: n, games: 0, fieldGames: 0, keeperGames: 0, goals: 0, assists: 0, cleanSheets: 0, conceded: 0, owngoals: 0, point: 0 }; };
    let curMatchNum = null;
    const matchPlayers = {}; // matchNum → Set of players
    for (const e of allEvents) {
      if (e.event === "출전") {
        ensure(e.player);
        if (!matchPlayers[e.matchNum]) matchPlayers[e.matchNum] = new Set();
        matchPlayers[e.matchNum].add(e.player);
        pStats[e.player].games++;
        if (e.position === "GK") pStats[e.player].keeperGames++;
        else pStats[e.player].fieldGames++;
      }
      if (e.event === "골") { ensure(e.player); pStats[e.player].goals++; if (e.relatedPlayer) { ensure(e.relatedPlayer); pStats[e.relatedPlayer].assists++; } }
      if (e.event === "자책골") { ensure(e.player); pStats[e.player].owngoals++; }
      if (e.event === "실점") { if (e.player) { ensure(e.player); pStats[e.player].conceded++; } }
      if (e.event === "교체") { ensure(e.player); if (!matchPlayers[e.matchNum]) matchPlayers[e.matchNum] = new Set(); matchPlayers[e.matchNum].add(e.player); }
    }
    // 포인트 계산
    Object.values(pStats).forEach(p => {
      p.point = p.goals + p.assists + (p.owngoals * (gameSettings?.ownGoalPoint ?? -1)) + (p.cleanSheets * (gameSettings?.cleanSheetPoint ?? 1));
    });
    await AppSync.writeTournamentPlayerRecord(tournament.id, { players: Object.values(pStats) });

    onScheduleUpdate();
    setPhase("finished");
  };

  // 타팀 스코어 입력
  const handleOtherScore = async (matchNum, home, away) => {
    await AppSync.updateTournamentMatchScore(tournament.id, matchNum, home, away);
    onScheduleUpdate();
    setScoreEdit(null);
  };

  // 경기 진행 중
  if (phase === "playing" && currentMatch) {
    return (
      <div>
        <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>제{selectedMatch.matchNum}경기 · {selectedMatch.round}</div>
        <SoccerRecorder match={currentMatch} attendees={attendees} onAddEvent={handleAddEvent} onDeleteEvent={handleDeleteEvent} onFinishMatch={handleFinishMatch} styles={{ card: { background: C.card, borderRadius: 12, padding: 14 } }} />
      </div>
    );
  }

  // 라인업 선택
  if (phase === "lineup" && selectedMatch) {
    const opponent = selectedMatch.home === ourTeamName ? selectedMatch.away : selectedMatch.home;
    return (
      <div>
        <button onClick={() => setPhase("list")} style={{ marginBottom: 10, padding: "6px 14px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>← 돌아가기</button>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 12 }}>vs {opponent} — 라인업</div>
        <LineupSelector attendees={attendees} onConfirm={handleLineupConfirm} styles={{}} />
      </div>
    );
  }

  // 경기 종료 후
  if (phase === "finished") {
    return (
      <div style={{ textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.green, marginBottom: 8 }}>경기 기록 완료</div>
        <button onClick={() => { setPhase("list"); setSelectedMatch(null); setCurrentMatch(null); }}
          style={{ padding: "10px 24px", borderRadius: 10, background: C.accent, color: C.bg, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          돌아가기
        </button>
      </div>
    );
  }

  // 경기 목록
  return (
    <div>
      {ourMatches.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 6 }}>우리팀 경기 (미완료)</div>
          {ourMatches.map(m => {
            const opponent = m.home === ourTeamName ? m.away : m.home;
            return (
              <div key={m.matchNum} onClick={() => { setSelectedMatch(m); setPhase("lineup"); }}
                style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: `${C.accent}11`, borderRadius: 8, marginBottom: 4, cursor: "pointer", borderLeft: `3px solid ${C.accent}` }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.white }}>제{m.matchNum}경기 vs {opponent}</span>
                <span style={{ fontSize: 11, color: C.gray }}>{m.date} · {m.round}</span>
              </div>
            );
          })}
        </div>
      )}

      {otherMatches.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.gray, marginBottom: 6 }}>타팀 경기 (스코어 입력)</div>
          {otherMatches.map(m => (
            <div key={m.matchNum} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: C.cardLight, borderRadius: 8, marginBottom: 3 }}>
              <span style={{ flex: 1, fontSize: 12, color: C.white, textAlign: "right" }}>{m.home}</span>
              {scoreEdit?.matchNum === m.matchNum ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input value={scoreEdit.home} onChange={e => setScoreEdit(p => ({ ...p, home: e.target.value }))} style={{ width: 30, padding: 4, borderRadius: 4, border: `1px solid ${C.grayDark}`, background: C.card, color: C.white, textAlign: "center", fontSize: 13 }} />
                  <span style={{ color: C.gray }}>:</span>
                  <input value={scoreEdit.away} onChange={e => setScoreEdit(p => ({ ...p, away: e.target.value }))} style={{ width: 30, padding: 4, borderRadius: 4, border: `1px solid ${C.grayDark}`, background: C.card, color: C.white, textAlign: "center", fontSize: 13 }} />
                  <button onClick={() => handleOtherScore(m.matchNum, parseInt(scoreEdit.home), parseInt(scoreEdit.away))}
                    style={{ padding: "2px 8px", borderRadius: 4, background: C.green, color: C.bg, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>OK</button>
                  <button onClick={() => setScoreEdit(null)}
                    style={{ padding: "2px 6px", borderRadius: 4, background: C.grayDark, color: C.gray, border: "none", fontSize: 10, cursor: "pointer" }}>취소</button>
                </div>
              ) : (
                <button onClick={() => setScoreEdit({ matchNum: m.matchNum, home: "", away: "" })}
                  style={{ padding: "4px 10px", borderRadius: 6, background: C.grayDarker, color: C.grayLight, border: "none", fontSize: 11, cursor: "pointer" }}>
                  스코어 입력
                </button>
              )}
              <span style={{ flex: 1, fontSize: 12, color: C.white }}>{m.away}</span>
            </div>
          ))}
        </div>
      )}

      {ourMatches.length === 0 && otherMatches.length === 0 && (
        <div style={{ textAlign: "center", padding: 20, color: C.gray, fontSize: 13 }}>모든 경기가 완료되었습니다</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tournament/TournamentMatchManager.jsx
git commit -m "feat(tournament): add TournamentMatchManager component"
```

---

### Task 8: TournamentPlayerRecords Component

**Files:**
- Create: `src/components/tournament/TournamentPlayerRecords.jsx`

- [ ] **Step 1: Create the component**

```jsx
// src/components/tournament/TournamentPlayerRecords.jsx
import { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import AppSync from '../../services/appSync';

export default function TournamentPlayerRecords({ tournamentId }) {
  const { C } = useTheme();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState("point");

  useEffect(() => {
    AppSync.getTournamentPlayerRecords(tournamentId)
      .then(p => setPlayers(p))
      .finally(() => setLoading(false));
  }, [tournamentId]);

  if (loading) return <div style={{ textAlign: "center", padding: 20, color: C.gray }}>불러오는 중...</div>;
  if (players.length === 0) return <div style={{ textAlign: "center", padding: 20, color: C.gray }}>선수 기록이 없습니다</div>;

  const sorted = [...players].sort((a, b) => {
    if (sortKey === "point") return b.point - a.point || b.goals - a.goals;
    if (sortKey === "goals") return b.goals - a.goals;
    if (sortKey === "assists") return b.assists - a.assists;
    return b.point - a.point;
  });

  const th = { padding: "6px 3px", textAlign: "center", color: C.gray, borderBottom: `1px solid ${C.grayDarker}`, fontWeight: 600, fontSize: 10, cursor: "pointer" };
  const td = (hl) => ({ padding: "6px 3px", textAlign: "center", borderBottom: `1px solid ${C.grayDarker}`, fontWeight: hl ? 700 : 400, color: hl ? C.white : C.gray, fontSize: 11 });

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 8 }}>개인 기록</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>선수</th>
            <th style={th}>경기</th>
            <th style={{ ...th, color: sortKey === "goals" ? C.accent : C.gray }} onClick={() => setSortKey("goals")}>골</th>
            <th style={{ ...th, color: sortKey === "assists" ? C.accent : C.gray }} onClick={() => setSortKey("assists")}>어시</th>
            <th style={th}>CS</th>
            <th style={th}>자책</th>
            <th style={{ ...th, color: sortKey === "point" ? C.accent : C.gray }} onClick={() => setSortKey("point")}>포인트</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={p.name}>
              <td style={{ ...td(true), textAlign: "left" }}>{i < 3 && p.point > 0 ? ["🥇","🥈","🥉"][i] + " " : ""}{p.name}</td>
              <td style={td()}>{p.games}</td>
              <td style={td(p.goals > 0)}>{p.goals}</td>
              <td style={td(p.assists > 0)}>{p.assists}</td>
              <td style={td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
              <td style={{ ...td(p.owngoals > 0), color: p.owngoals > 0 ? "#ef4444" : C.gray }}>{p.owngoals}</td>
              <td style={{ ...td(true), fontSize: 13, fontWeight: 800 }}>{p.point}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tournament/TournamentPlayerRecords.jsx
git commit -m "feat(tournament): add TournamentPlayerRecords component"
```

---

### Task 9: TournamentDashboard Component

**Files:**
- Create: `src/components/tournament/TournamentDashboard.jsx`

- [ ] **Step 1: Create the component**

Main container with 4 tabs: 대시보드, 개인기록, 분석, 경기관리.

```jsx
// src/components/tournament/TournamentDashboard.jsx
import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import AppSync from '../../services/appSync';
import TournamentStandings from './TournamentStandings';
import TournamentSchedule from './TournamentSchedule';
import TournamentPlayerRecords from './TournamentPlayerRecords';
import TournamentMatchManager from './TournamentMatchManager';

export default function TournamentDashboard({ tournament, ourTeamName, attendees, gameSettings, onBack }) {
  const { C } = useTheme();
  const [tab, setTab] = useState("dashboard");
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadSchedule = () => {
    AppSync.getTournamentSchedule(tournament.id).then(m => setSchedule(m)).finally(() => setLoading(false));
  };

  useEffect(() => { loadSchedule(); }, [tournament.id]);

  const handleUpdateScore = async (matchNum, homeScore, awayScore) => {
    await AppSync.updateTournamentMatchScore(tournament.id, matchNum, homeScore, awayScore);
    loadSchedule();
  };

  // TOP 선수 (개인기록에서)
  const [topPlayers, setTopPlayers] = useState({ goals: [], assists: [], cs: [] });
  useEffect(() => {
    AppSync.getTournamentPlayerRecords(tournament.id).then(players => {
      const byGoals = [...players].sort((a, b) => b.goals - a.goals).slice(0, 3).filter(p => p.goals > 0);
      const byAssists = [...players].sort((a, b) => b.assists - a.assists).slice(0, 3).filter(p => p.assists > 0);
      const byCS = [...players].sort((a, b) => b.cleanSheets - a.cleanSheets).slice(0, 3).filter(p => p.cleanSheets > 0);
      setTopPlayers({ goals: byGoals, assists: byAssists, cs: byCS });
    });
  }, [tournament.id, tab]);

  const tabStyle = (active) => ({
    flex: 1, padding: "10px 8px", textAlign: "center", fontSize: 13, fontWeight: 700,
    border: "none", cursor: "pointer", background: active ? C.card : "transparent",
    color: active ? C.white : C.gray, borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
  });

  if (loading) return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>불러오는 중...</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button onClick={onBack} style={{ padding: "6px 12px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>← 대회 목록</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.white }}>{tournament.name}</div>
          <div style={{ fontSize: 11, color: C.gray }}>{tournament.startDate} ~ {tournament.endDate} · {tournament.teams.length}팀</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: C.bg, borderBottom: `1px solid ${C.grayDarker}`, marginBottom: 12 }}>
        {[{ key: "dashboard", label: "대시보드" }, { key: "players", label: "개인기록" }, { key: "manage", label: "경기관리" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabStyle(tab === t.key)}>{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "dashboard" && (
        <div style={{ padding: "0 4px" }}>
          <TournamentStandings schedule={schedule} ourTeamName={ourTeamName} />
          <div style={{ marginTop: 16 }}>
            <TournamentSchedule schedule={schedule} ourTeamName={ourTeamName} onUpdateScore={handleUpdateScore} />
          </div>
          {(topPlayers.goals.length > 0 || topPlayers.assists.length > 0) && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 8 }}>개인 TOP</div>
              <div style={{ display: "flex", gap: 8 }}>
                {topPlayers.goals.length > 0 && (
                  <div style={{ flex: 1, background: C.cardLight, borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 10, color: C.gray, marginBottom: 4 }}>득점왕</div>
                    {topPlayers.goals.map((p, i) => (
                      <div key={p.name} style={{ fontSize: 12, color: C.white, fontWeight: i === 0 ? 700 : 400 }}>{p.name} {p.goals}골</div>
                    ))}
                  </div>
                )}
                {topPlayers.assists.length > 0 && (
                  <div style={{ flex: 1, background: C.cardLight, borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 10, color: C.gray, marginBottom: 4 }}>어시왕</div>
                    {topPlayers.assists.map((p, i) => (
                      <div key={p.name} style={{ fontSize: 12, color: C.white, fontWeight: i === 0 ? 700 : 400 }}>{p.name} {p.assists}어시</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "players" && <TournamentPlayerRecords tournamentId={tournament.id} />}

      {tab === "manage" && (
        <TournamentMatchManager
          tournament={tournament} schedule={schedule} ourTeamName={ourTeamName}
          attendees={attendees} gameSettings={gameSettings} onScheduleUpdate={loadSchedule}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tournament/TournamentDashboard.jsx
git commit -m "feat(tournament): add TournamentDashboard component"
```

---

### Task 10: TournamentListTab Component

**Files:**
- Create: `src/components/tournament/TournamentListTab.jsx`

- [ ] **Step 1: Create the component**

Shows tournament list and handles creation. Entry point from TeamDashboard.

```jsx
// src/components/tournament/TournamentListTab.jsx
import { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import AppSync from '../../services/appSync';
import CreateTournament from './CreateTournament';
import TournamentDashboard from './TournamentDashboard';

export default function TournamentListTab({ teamName, ourTeamName, isAdmin, attendees, gameSettings }) {
  const { C } = useTheme();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);

  const loadList = () => {
    setLoading(true);
    AppSync.getTournamentList().then(list => setTournaments(list)).finally(() => setLoading(false));
  };

  useEffect(() => { loadList(); }, []);

  const handleCreate = async (data) => {
    const result = await AppSync.createTournament(data);
    if (result?.success) {
      setCreating(false);
      loadList();
    } else {
      alert("대회 생성 실패: " + (result?.error || "알 수 없는 오류"));
    }
  };

  // 대회 대시보드 진입
  if (selectedTournament) {
    return (
      <TournamentDashboard
        tournament={selectedTournament} ourTeamName={ourTeamName}
        attendees={attendees} gameSettings={gameSettings}
        onBack={() => { setSelectedTournament(null); loadList(); }}
      />
    );
  }

  // 대회 생성 폼
  if (creating) {
    return (
      <div style={{ padding: "0 16px" }}>
        <CreateTournament ourTeamName={ourTeamName} onSubmit={handleCreate} onCancel={() => setCreating(false)} />
      </div>
    );
  }

  // 대회 목록
  const active = tournaments.filter(t => t.status === "active");
  const finished = tournaments.filter(t => t.status === "finished");

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>대회</div>
        {isAdmin && (
          <button onClick={() => setCreating(true)}
            style={{ padding: "6px 14px", borderRadius: 8, background: C.accent, color: C.bg, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            + 새 대회
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 20, color: C.gray }}>불러오는 중...</div>
      ) : tournaments.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: C.gray }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🏆</div>
          <div style={{ fontSize: 13 }}>등록된 대회가 없습니다</div>
          {isAdmin && <div style={{ fontSize: 11, marginTop: 4 }}>"+ 새 대회" 버튼으로 대회를 만들어보세요</div>}
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: C.gray, fontWeight: 600, marginBottom: 6 }}>진행중</div>
              {active.map(t => (
                <div key={t.id} onClick={() => setSelectedTournament(t)}
                  style={{ padding: "12px 14px", background: C.card, borderRadius: 10, marginBottom: 6, cursor: "pointer", borderLeft: `3px solid ${C.green}` }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{t.startDate} ~ {t.endDate} · {t.teams.length}팀 · {t.format}</div>
                </div>
              ))}
            </div>
          )}
          {finished.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: C.gray, fontWeight: 600, marginBottom: 6 }}>완료</div>
              {finished.map(t => (
                <div key={t.id} onClick={() => setSelectedTournament(t)}
                  style={{ padding: "12px 14px", background: C.cardLight, borderRadius: 10, marginBottom: 6, cursor: "pointer", opacity: 0.7 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.grayLight }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: C.grayDark, marginTop: 2 }}>{t.startDate} ~ {t.endDate}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tournament/TournamentListTab.jsx
git commit -m "feat(tournament): add TournamentListTab component"
```

---

### Task 11: TeamDashboard Integration

**Files:**
- Modify: `src/components/dashboard/TeamDashboard.jsx`

- [ ] **Step 1: Import TournamentListTab**

At the top of the file, add:
```js
import TournamentListTab from '../tournament/TournamentListTab';
```

- [ ] **Step 2: Add "대회" tab to the tab list**

Find the tab list array (around line 561-565):
```js
{[
  { key: "records", label: "대시보드" },
  { key: "roster", label: "개인기록" },
  { key: "analytics", label: "분석" },
  { key: "games", label: "경기관리", badge: pendingGames.length > 0 },
].map(tab => (
```

Change to:
```js
{[
  { key: "records", label: "대시보드" },
  { key: "roster", label: "개인기록" },
  { key: "analytics", label: "분석" },
  { key: "games", label: "경기관리", badge: pendingGames.length > 0 },
  activeSport === "축구" && { key: "tournament", label: "대회" },
].filter(Boolean).map(tab => (
```

- [ ] **Step 3: Add tournament tab content rendering**

Find where tab content is rendered (around line 578-588), and add after the `games` tab rendering:

```jsx
        {activeTab === "tournament" && (
          <TournamentListTab
            teamName={teamName} ourTeamName={teamName}
            isAdmin={activeEntry?.role === "관리자"}
            attendees={members.map(m => m.name)}
            gameSettings={getSettings(teamName)}
          />
        )}
```

Also add `import { getSettings } from '../../config/settings';` at the top if not already imported (check first — it's likely already there).

- [ ] **Step 4: Verify build**

Run: `npx vite build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/TeamDashboard.jsx
git commit -m "feat(tournament): add tournament tab to TeamDashboard"
```

---

## Self-Review Checklist

### Spec Coverage
| Spec Requirement | Task |
|-----------------|------|
| 대회 생성 (대회명, 기간, 참가팀, 대진형태) | Task 4 (CreateTournament) |
| 대진 형태: 풀리그/녹아웃/자유 | Task 1 (tournamentBrackets) + Task 4 |
| 구글시트 자동 생성 (목록/일정/이벤트로그/선수기록) | Task 2 (_createTournament) |
| Firebase 메타 저장 | Task 2 (Apps Script) — 구글시트에 저장, Firebase는 추후 |
| 대회 목록 (진행중/완료) | Task 10 (TournamentListTab) |
| 팀 순위표 (전체 참가팀) | Task 5 (TournamentStandings) |
| 경기 일정 표시 | Task 6 (TournamentSchedule) |
| 타팀 경기 스코어 수동 입력 | Task 6 + Task 7 |
| 우리팀 경기 상세 기록 (SoccerRecorder 재사용) | Task 7 (TournamentMatchManager) |
| 개인기록 탭 | Task 8 (TournamentPlayerRecords) |
| 개인 TOP (득점왕/어시왕) | Task 9 (TournamentDashboard dashboard tab) |
| 4탭 구조 (대시보드/개인기록/경기관리) | Task 9 |
| TeamDashboard에 "대회" 탭 추가 | Task 11 |
| 이벤트로그 로우데이터 | Task 7 (buildEventLogRows 재사용) |
| 선수기록 집계 | Task 7 (writeTournamentPlayerRecord) |

### Note
- 분석 탭은 1차 범위에서 제외 (기존 PlayerAnalytics는 리그 포인트로그 기반이라 대회 이벤트로그와 구조가 다름). 대회 데이터가 쌓인 후 추가하는 것이 합리적.
- Firebase 저장은 구글시트 CRUD로 대체 (구글시트가 이미 persistent storage 역할). 실시간 게임 상태 저장이 필요하면 추후 추가.

### Type Consistency
- `tournament` object: `{ id, name, startDate, endDate, teams: [], format, status }` — consistent across Tasks 2, 3, 9, 10
- `schedule` match: `{ matchNum, date, round, home, away, homeScore, awayScore, isOurs, status }` — consistent across Tasks 2, 5, 6, 7, 9
- `playerRecord`: `{ name, games, fieldGames, keeperGames, goals, assists, cleanSheets, conceded, owngoals, point }` — consistent across Tasks 2, 7, 8
- `buildEventLogRows` from soccerScoring.js — reused in Task 7
