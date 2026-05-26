# 축구 경기 당일 플로우 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 축구(축구) 모드의 경기 당일 플로우를 재설계 — 상대팀을 구글시트에서 자동 수집, 초기세팅에서 참석팀·참석명단 구성, 경기 사이 명단 수정, 경기별 출전 스냅샷, 스쿼드 탭-탭 배치, 헤더 대비 수정.

**Architecture:** 기존 RTDB 자식노드 diff/subscribe 동기화 위에 얹는다. `state.opponents`를 "오늘 참석팀"으로 재정의(이미 동기화됨), 시트에서 받은 마스터 후보는 `opponentSuggestions`(비동기화 로컬). 명단 선택 UI는 `AttendeeSelector`로 추출해 setup·경기중 공용. 순수 로직(시트 파서, 리듀서)은 vitest TDD, UI는 Playwright 검증.

**Tech Stack:** React 19, Vite, vitest(jsdom), Playwright, Firebase RTDB, Google Sheets gviz CSV.

**Spec:** `docs/superpowers/specs/2026-05-26-soccer-matchday-flow-design.md`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/services/sheetService.js` | `parseSoccerOpponents(text)` 신규(순수) + `fetchSheetData` 반환에 `opponents` 추가 |
| `src/services/__tests__/sheetService.opponents.test.js` | 파서 단위 테스트 (신규) |
| `src/hooks/useGameReducer.js` | `CREATE_SOCCER_MATCH`에 `subs` 저장 |
| `src/hooks/__tests__/useGameReducer.soccer.test.js` | 리듀서 subs 테스트 (신규) |
| `src/components/game/AttendeeSelector.jsx` | 명단 선택 UI 추출 (신규, 공용) |
| `src/SoccerApp.jsx` | 로드(opponentSuggestions)·setup 재구성·핸들러·autoSync deps·헤더 색 |
| `src/components/game/OpponentSelector.jsx` | 오늘 참석팀 노출 + 삭제/이름변경 + 즉석추가 |
| `src/components/game/SoccerMatchView.jsx` | 명단수정 진입점 + subs 전달 + 참석팀 prop |
| `src/components/game/FormationSetup.jsx` | 탭-탭 양끝 선택 + 선수목록 상시 |
| `src/components/game/FormationPitch.jsx` | 선수 선택 시 빈 슬롯 힌트 글로우 |
| `src/components/common/SettingsScreen.jsx` | "상대팀 관리" 섹션 제거 |

**구현 순서(의존)**: Task 1→2(시트) → 3(리듀서) → 4(앱 로드/동기화) → 5→6(명단 UI/세팅) → 7→8(참석팀/경기선택) → 9→10(스쿼드) → 11(설정정리) → 12(헤더) → 13(통합검증).

---

## Task 1: 상대팀 시트 파서 (순수 함수, TDD)

**Files:**
- Modify: `src/services/sheetService.js` (add export `parseSoccerOpponents`, reuse existing `parseCSVLine`)
- Test: `src/services/__tests__/sheetService.opponents.test.js` (create)

대시보드 CSV에서 "상대팀명" 헤더를 자동 탐지해 팀명+경기수를 뽑는다. 헤더 텍스트는 "vs 상대팀명"일 수 있으므로 `includes('상대팀명')`로 매칭. 경기수는 같은 헤더 행에서 "경기" 열을 찾고, 없으면 헤더 바로 다음 열로 폴백. 경기수 내림차순 정렬.

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/sheetService.opponents.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseSoccerOpponents } from '../sheetService.js';

// 대시보드 CSV 모사: 0~5열은 선수 데이터, 6열부터 상대팀 표(vs 상대팀명 | 경기 | 승 | 무 | 패 | 득점 | 실점)
const CSV = [
  ',,,,,,,,,,,,,',                                   // row0 잡음
  ',,,,,,,,,,,,,',                                   // row1 잡음
  'ppg,순위,등번호,이름,경기수,골,vs 상대팀명,경기,승,무,패,득점,실점', // row2 헤더
  '1.2,1,10,김철수,5,3,한울,31,22,7,2,71,18',         // row3
  '1.0,2,7,이영희,28,6,시청,3,3,0,0,12,2',            // row4
  ',,,,,,아이콘,28,6,13,9,29,36',                      // row5 (선수열은 비고 상대팀만)
  ',,,,,,,,,,,,,',                                    // row6 상대팀 끝 → 중단
  '0.5,9,3,박지성,10,1,,,,,,,'                         // row7 (상대팀열 비어있어 안 읽힘)
].join('\n');

describe('parseSoccerOpponents', () => {
  it('상대팀명 헤더를 자동탐지해 팀명+경기수를 경기수순으로 반환', () => {
    expect(parseSoccerOpponents(CSV)).toEqual([
      { name: '한울', games: 31 },
      { name: '아이콘', games: 28 },
      { name: '시청', games: 3 },
    ]);
  });

  it('헤더가 없으면 빈 배열', () => {
    expect(parseSoccerOpponents('a,b,c\n1,2,3')).toEqual([]);
  });

  it('빈 문자열도 안전하게 빈 배열', () => {
    expect(parseSoccerOpponents('')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/__tests__/sheetService.opponents.test.js`
Expected: FAIL — `parseSoccerOpponents is not a function` / not exported.

- [ ] **Step 3: Implement the parser**

In `src/services/sheetService.js`, add after the existing `parseSoccerCSV` function (around line 93, before `export async function fetchSheetData`):

```js
// 대시보드의 "vs 상대팀명" 표에서 상대팀명 + 경기수 추출 (경기수순 정렬)
export function parseSoccerOpponents(text) {
  if (!text) return [];
  const lines = text.split('\n');
  // "상대팀명" 포함 헤더 셀 탐지
  let hRow = -1, hCol = -1;
  for (let i = 0; i < lines.length; i++) {
    const f = parseCSVLine(lines[i]);
    const idx = f.findIndex(c => c.replace(/\s/g, '').includes('상대팀명'));
    if (idx >= 0) { hRow = i; hCol = idx; break; }
  }
  if (hRow < 0) return [];
  // 같은 헤더 행에서 "경기" 열 탐지 (hCol 이후), 없으면 hCol+1
  const hf = parseCSVLine(lines[hRow]);
  let gamesCol = -1;
  for (let c = hCol + 1; c < hf.length; c++) {
    if (hf[c].trim() === '경기') { gamesCol = c; break; }
  }
  if (gamesCol < 0) gamesCol = hCol + 1;
  const out = [];
  const seen = new Set();
  for (let i = hRow + 1; i < lines.length; i++) {
    const f = parseCSVLine(lines[i]);
    const name = (f[hCol] || '').trim();
    if (!name) break;                  // 상대팀 열이 비면 표 끝
    if (name.includes('상대팀명')) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, games: parseInt(f[gamesCol]) || 0 });
  }
  return out.sort((a, b) => b.games - a.games);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/__tests__/sheetService.opponents.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/sheetService.js src/services/__tests__/sheetService.opponents.test.js
git commit -m "feat(soccer): 대시보드 상대팀 표 파서 추가"
```

---

## Task 2: `fetchSheetData` 반환에 opponents 추가

**Files:**
- Modify: `src/services/sheetService.js:104,121` (within `fetchSheetData`)

축구 모드일 때만 상대팀을 파싱해 반환에 포함.

- [ ] **Step 1: 파싱 호출 + 반환 추가**

In `fetchSheetData` (`src/services/sheetService.js`), change the final return (line 121). Find:

```js
  return { lastUpdated: new Date().toISOString().slice(0, 10), players, keepers, seasonCrova: {}, seasonGoguma: {} };
```

Replace with:

```js
  const opponents = mode === "축구" ? parseSoccerOpponents(text) : [];

  return { lastUpdated: new Date().toISOString().slice(0, 10), players, keepers, opponents, seasonCrova: {}, seasonGoguma: {} };
```

(`text` and `mode` are already in scope from earlier in the function.)

- [ ] **Step 2: Verify build/tests still green**

Run: `npx vitest run`
Expected: PASS (no regressions; existing tests unaffected).

- [ ] **Step 3: Commit**

```bash
git add src/services/sheetService.js
git commit -m "feat(soccer): fetchSheetData가 상대팀 목록 반환"
```

---

## Task 3: 리듀서 — `CREATE_SOCCER_MATCH`에 subs 저장 (TDD)

**Files:**
- Modify: `src/hooks/useGameReducer.js:765-779`
- Test: `src/hooks/__tests__/useGameReducer.soccer.test.js` (create)

각 경기가 출전 가능 스쿼드(선발 `lineup` + 후보 `subs`)를 온전히 스냅샷하도록 `subs`를 match 객체에 저장. 누락 시 `[]` 방어.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useGameReducer.soccer.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

describe('gameReducer — CREATE_SOCCER_MATCH subs 스냅샷', () => {
  it('subs를 match 객체에 저장한다', () => {
    const s = withState({ soccerMatches: [] });
    const next = gameReducer(s, {
      type: 'CREATE_SOCCER_MATCH',
      opponent: '한울',
      lineup: ['A', 'B', 'C'],
      gk: 'A',
      defenders: ['B'],
      subs: ['X', 'Y'],
    });
    const m = next.soccerMatches[0];
    expect(m.subs).toEqual(['X', 'Y']);
    expect(m.lineup).toEqual(['A', 'B', 'C']);
    expect(m.opponent).toBe('한울');
    expect(m.status).toBe('playing');
    expect(next.currentMatchIdx).toBe(0);
  });

  it('subs 미전달 시 빈 배열로 방어', () => {
    const s = withState({ soccerMatches: [] });
    const next = gameReducer(s, {
      type: 'CREATE_SOCCER_MATCH', opponent: '시청', lineup: [], gk: '', defenders: [],
    });
    expect(next.soccerMatches[0].subs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useGameReducer.soccer.test.js`
Expected: FAIL — `m.subs` is `undefined`.

- [ ] **Step 3: Implement**

In `src/hooks/useGameReducer.js`, change `CREATE_SOCCER_MATCH` (lines 765-779):

```js
    case 'CREATE_SOCCER_MATCH': {
      const { opponent, lineup, gk, defenders, subs } = action;
      const newMatch = {
        matchIdx: state.soccerMatches.length,
        opponent, lineup, gk, defenders,
        subs: subs || [],
        events: [],
        startedAt: Date.now(),
        ourScore: 0, opponentScore: 0,
        status: "playing",
      };
      return {
        ...state,
        soccerMatches: [...state.soccerMatches, newMatch],
        currentMatchIdx: state.soccerMatches.length,
      };
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/useGameReducer.soccer.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGameReducer.js src/hooks/__tests__/useGameReducer.soccer.test.js
git commit -m "feat(soccer): 경기별 후보(subs) 스냅샷 저장"
```

---

## Task 4: SoccerApp — opponentSuggestions 로드, 자동진입/설정저장 정리, autoSync deps

**Files:**
- Modify: `src/SoccerApp.jsx` (lines ~28, 80-97, 150-152, 206-213, 413)

`state.opponents`를 "오늘 참석팀"으로 쓰고, 시트 상대팀은 `opponentSuggestions`(로컬 상태)로. sheetSync 자동진입 제거(attendees는 prefill 유지). settings.opponents 영구저장 제거. autoSync deps에 attendees 추가. line 413 폴백 정리.

- [ ] **Step 1: opponentSuggestions 상태 추가**

In `src/SoccerApp.jsx`, near other `useState`/reducer usage (the component uses a reducer `state`; add a sibling `useState` right after `const { state, dispatch } = useGameReducer();` or equivalent — find where `state` is obtained, add below it):

```js
  const [opponentSuggestions, setOpponentSuggestions] = useState([]); // 시트에서 받은 상대팀 후보 (비동기화)
```

(Ensure `useState` is imported — it already is, since other state exists.)

- [ ] **Step 2: _loadAllData — suggestions 세팅 + 자동진입 제거**

In `_loadAllData` (lines ~80-96), replace this block:

```js
      const opponents = gameSettings.opponents || [];
      if (opponents.length > 0) dispatch({ type: 'SET_OPPONENTS', opponents });

      // 시트 연동 시 참석자 로드 → 바로 경기 진입
      if (gameMode === "sheetSync" && attendanceData && attendanceData.attendees.length > 0) {
        dispatch({
          type: 'SET_FIELDS',
          fields: { attendees: attendanceData.attendees, matchMode: "soccer", courtCount: 1, phase: "match" },
        });
      }
```

with:

```js
      // 상대팀 후보: 구글시트 대시보드에서 (settings 영구저장 대신 시트가 소스)
      if (sheetData?.opponents?.length > 0) setOpponentSuggestions(sheetData.opponents);

      // 시트 연동 시 참석자는 미리 채우되, setup 화면에 머문다 (자동 경기진입 제거)
      if (gameMode === "sheetSync" && attendanceData && attendanceData.attendees.length > 0) {
        dispatch({
          type: 'SET_FIELDS',
          fields: { attendees: attendanceData.attendees, matchMode: "soccer", courtCount: 1 },
        });
      }
```

- [ ] **Step 3: addOpponent — settings 영구저장 제거, 오늘 참석팀만 갱신**

Replace `addOpponent` (lines 206-213):

```js
  // 오늘 참석팀에 추가 (시트가 마스터 소스이므로 settings 영구저장 안 함)
  const addOpponent = (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    if ((state.opponents || []).includes(trimmed)) return;
    dispatch({ type: 'SET_OPPONENTS', opponents: [...(state.opponents || []), trimmed] });
  };
  const removeOpponent = (name) => {
    dispatch({ type: 'SET_OPPONENTS', opponents: (state.opponents || []).filter(n => n !== name) });
  };
  const renameOpponent = (oldName, newName) => {
    const trimmed = (newName || "").trim();
    if (!trimmed) return;
    dispatch({ type: 'SET_OPPONENTS', opponents: (state.opponents || []).map(n => n === oldName ? trimmed : n) });
  };
  // setup에서 오늘 참석팀 토글 (후보 칩 탭)
  const toggleTodayOpponent = (name) => {
    const list = state.opponents || [];
    dispatch({ type: 'SET_OPPONENTS', opponents: list.includes(name) ? list.filter(n => n !== name) : [...list, name] });
  };
```

(Note: `getEffectiveSettings`/`saveSettings` imports may now be unused in this file — leave the imports; they may be used by `handleFinalize`/`settingsSnapshot`. Do not remove without grep.)

- [ ] **Step 4: autoSync deps에 attendees 추가**

Change the autoSync `useEffect` deps (line 152):

```js
  }, [state.soccerMatches, phase, state.currentMatchIdx, state.soccerFormation, state.opponents, attendees]);
```

- [ ] **Step 5: line 413 폴백 정리**

Find the `SoccerMatchView` render (line ~413):

```js
            attendees={attendees} opponents={state.opponents || gameSettings.opponents || []}
```

Replace with (also pass suggestions + new handlers — these props are wired in Task 7/8):

```js
            attendees={attendees} opponents={state.opponents || []}
            opponentSuggestions={opponentSuggestions}
            onRemoveOpponent={removeOpponent} onRenameOpponent={renameOpponent}
```

- [ ] **Step 6: Verify app boots (no runtime errors)**

Run: `npm run dev` (background) then open http://localhost:5173, log in to 하버FC 축구 모드, create 새 경기.
Expected: setup 화면이 뜨고(시트연동이어도 자동 진입 안 함), 콘솔 에러 없음. (`onRemoveOpponent` 등은 아직 SoccerMatchView가 안 받지만 prop 전달만으론 에러 없음.)

- [ ] **Step 7: Commit**

```bash
git add src/SoccerApp.jsx
git commit -m "feat(soccer): 상대팀 시트소스화 + 자동진입 제거 + autoSync attendees deps"
```

---

## Task 5: AttendeeSelector 컴포넌트 추출

**Files:**
- Create: `src/components/game/AttendeeSelector.jsx`
- Modify: `src/SoccerApp.jsx` setup 렌더(lines 311-339)에서 이 컴포넌트 사용

setup 인라인 명단 UI를 재사용 가능한 컴포넌트로 추출(경기 사이 명단수정에서도 씀).

- [ ] **Step 1: 컴포넌트 생성**

Create `src/components/game/AttendeeSelector.jsx`:

```jsx
import { useTheme } from '../../hooks/useTheme';

// 참석명단 선택 UI (setup·경기중 명단수정 공용)
// props: attendees(string[]), sortedPlayers([{name,point,games}]), playerSortMode,
//   onSyncSheet, onToggle(name), onSetAll(names), onClear, onToggleSort,
//   onAddManual(name), newPlayer, onNewPlayerChange, attendanceLoading, styles(s)
export default function AttendeeSelector({
  attendees, sortedPlayers, playerSortMode,
  onSyncSheet, onToggle, onSetAll, onClear, onToggleSort,
  onAddManual, newPlayer, onNewPlayerChange, attendanceLoading, styles: s,
}) {
  const { C } = useTheme();
  const addManual = () => {
    const name = (newPlayer || "").trim();
    if (name && !attendees.includes(name)) onAddManual(name);
  };
  return (
    <div>
      <div style={{ ...s.row, marginBottom: 10, flexWrap: "wrap" }}>
        <button onClick={onSyncSheet} disabled={attendanceLoading} style={{ ...s.btnSm("#22c55e"), opacity: attendanceLoading ? 0.6 : 1 }}>
          {attendanceLoading ? "연동 중..." : "📋 시트에서 불러오기"}
        </button>
        <button onClick={() => onSetAll(sortedPlayers.filter(p => p.games > 0).map(p => p.name))} style={s.btnSm(C.grayDark)}>활동선수 전체</button>
        <button onClick={onClear} style={s.btnSm(C.grayDark)}>초기화</button>
        <button onClick={onToggleSort} style={s.btnSm(C.accentDim, C.white)}>
          {playerSortMode === "point" ? "포인트순" : "이름순"}
        </button>
      </div>
      <div style={s.card}>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {sortedPlayers.map(p => (
            <div key={p.name} onClick={() => onToggle(p.name)} style={s.chip(attendees.includes(p.name))}>
              <span>{p.name}</span><span style={{ fontSize: 10, opacity: 0.7 }}>{p.point}p</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input style={s.input} placeholder="새 선수 이름" value={newPlayer || ""}
          onChange={e => onNewPlayerChange(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") addManual(); }} />
        <button onClick={addManual} style={s.btn(C.green)}>추가</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: SoccerApp setup에서 사용**

In `src/SoccerApp.jsx`, add import near other game component imports:

```js
import AttendeeSelector from './components/game/AttendeeSelector';
```

Replace the setup-phase attendee block (lines 313-338, from the `<div style={{ ...s.row...}}>` through the manual-add `</div>`) with:

```jsx
          <AttendeeSelector
            attendees={attendees} sortedPlayers={sortedPlayers} playerSortMode={playerSortMode}
            onSyncSheet={syncAttendance}
            onToggle={(name) => dispatch({ type: 'TOGGLE_ATTENDEE', name })}
            onSetAll={(names) => dispatch({ type: 'SET_ATTENDEES', attendees: names })}
            onClear={() => set('attendees', [])}
            onToggleSort={() => set('playerSortMode', playerSortMode === "point" ? "name" : "point")}
            onAddManual={(name) => dispatch({ type: 'SET_FIELDS', fields: { attendees: [...attendees, name], newPlayer: "" } })}
            newPlayer={newPlayer} onNewPlayerChange={(v) => set('newPlayer', v)}
            attendanceLoading={attendanceLoading} styles={s}
          />
```

(Keep the outer `<div style={s.section}>` and the `👥 참석자 선택` sectionTitle above it.)

- [ ] **Step 3: Verify setup renders identically**

Run dev server, open 축구 setup. Expected: 명단 칩/버튼/추가 입력이 이전과 동일하게 동작 (시트 불러오기, 전체, 초기화, 정렬, 칩 토글, 수동추가). 콘솔 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/AttendeeSelector.jsx src/SoccerApp.jsx
git commit -m "refactor(soccer): 참석명단 UI를 AttendeeSelector로 추출"
```

---

## Task 6: 초기세팅에 "참석팀" 섹션 추가

**Files:**
- Modify: `src/SoccerApp.jsx` setup 렌더 (참석자 섹션 아래에 참석팀 섹션 삽입)

`opponentSuggestions` 칩으로 오늘 참석팀 토글 + 즉석 추가/삭제/이름변경.

- [ ] **Step 1: 참석팀 섹션 추가**

In `src/SoccerApp.jsx`, immediately after the closing `</div>` of the `👥 참석자 선택` section (the `<div style={s.section}>...</div>` block), insert a new section:

```jsx
        <div style={s.section}>
          <div style={s.sectionTitle}>🆚 참석팀 <span style={{ fontSize: 12, fontWeight: 400, color: C.gray }}>({(state.opponents || []).length}팀)</span></div>
          <div style={s.card}>
            <div style={{ fontSize: 12, color: C.gray, marginBottom: 8 }}>오늘 온 상대팀을 고르세요 (시트의 자주 붙은 팀 순)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {opponentSuggestions.map(o => (
                <div key={o.name} onClick={() => toggleTodayOpponent(o.name)} style={s.chip((state.opponents || []).includes(o.name))}>
                  <span>{o.name}</span>
                </div>
              ))}
              {opponentSuggestions.length === 0 && (
                <span style={{ fontSize: 12, color: C.gray }}>시트에 상대팀 기록이 없습니다. 아래에서 직접 추가하세요.</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={s.input} placeholder="새 상대팀 직접 추가" value={newOpponentSetup}
                onChange={e => setNewOpponentSetup(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { addOpponent(newOpponentSetup); setNewOpponentSetup(""); } }} />
              <button onClick={() => { addOpponent(newOpponentSetup); setNewOpponentSetup(""); }} style={s.btn(C.green)}>추가</button>
            </div>
            {(state.opponents || []).filter(n => !opponentSuggestions.some(o => o.name === n)).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {(state.opponents || []).filter(n => !opponentSuggestions.some(o => o.name === n)).map(name => (
                  <div key={name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 999, background: C.cardLight, fontSize: 13, color: C.white }}>
                    <span>{name}</span>
                    <button onClick={() => removeOpponent(name)} style={{ background: "transparent", border: "none", color: C.red, cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }} aria-label={`${name} 제거`}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
```

- [ ] **Step 2: setup용 입력 상태 추가**

Add near `opponentSuggestions` state (Task 4 Step 1):

```js
  const [newOpponentSetup, setNewOpponentSetup] = useState("");
```

- [ ] **Step 3: Verify 참석팀 동작**

Run dev server, 축구 setup. Expected:
- 시트 후보 칩들이 경기수순으로 표시되고, 탭하면 선택(하이라이트) 토글.
- "새 상대팀 직접 추가"로 시트에 없는 팀 추가 → 아래 즉석추가 목록에 ✕와 함께 표시, ✕로 삭제.
- 콘솔 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add src/SoccerApp.jsx
git commit -m "feat(soccer): 초기세팅에 참석팀(오늘 상대팀) 섹션 추가"
```

---

## Task 7: OpponentSelector — 오늘 참석팀 노출 + 삭제/이름변경 + 즉석추가

**Files:**
- Modify: `src/components/game/OpponentSelector.jsx`
- Modify: `src/components/game/SoccerMatchView.jsx` (props 전달)

경기 화면의 상대팀 선택은 이제 **오늘 참석팀(state.opponents)**만 노출. 편집 모드에서 삭제/이름변경. 즉석추가는 추가+바로 선택.

- [ ] **Step 1: OpponentSelector 재작성**

Replace entire `src/components/game/OpponentSelector.jsx`:

```jsx
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

// props: opponents(string[] = 오늘 참석팀), onSelect, onAddOpponent, onRemoveOpponent, onRenameOpponent, styles
export default function OpponentSelector({ opponents, onSelect, onAddOpponent, onRemoveOpponent, onRenameOpponent, styles: s }) {
  const { C } = useTheme();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [renaming, setRenaming] = useState(null); // 이름변경 중인 팀명
  const [renameValue, setRenameValue] = useState("");

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    if (opponents.includes(name)) { alert("이미 등록된 상대팀입니다."); return; }
    onAddOpponent(name);
    onSelect(name);
    setNewName("");
    setAdding(false);
  };

  const commitRename = (oldName) => {
    const v = renameValue.trim();
    if (v && v !== oldName) onRenameOpponent?.(oldName, v);
    setRenaming(null); setRenameValue("");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 12, color: C.gray }}>상대팀 선택</div>
        {opponents.length > 0 && (
          <button onClick={() => { setEditMode(e => !e); setRenaming(null); }}
            style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: editMode ? C.accent : C.grayDark, color: editMode ? C.bg : C.gray, border: "none", cursor: "pointer" }}>
            {editMode ? "완료" : "편집"}
          </button>
        )}
      </div>
      {adding ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder="새 상대팀 이름"
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 14, background: C.cardLight, color: C.white, border: `1px solid ${C.grayDark}` }} />
          <button onClick={handleAdd} style={{ padding: "8px 14px", borderRadius: 8, background: C.green, color: C.bg, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>추가</button>
          <button onClick={() => { setAdding(false); setNewName(""); }} style={{ padding: "8px 14px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 13, cursor: "pointer" }}>취소</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {opponents.map(name => (
            renaming === name ? (
              <input key={name} autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => e.key === "Enter" && commitRename(name)} onBlur={() => commitRename(name)}
                style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, background: C.cardLight, color: C.white, border: `1px solid ${C.accent}`, width: 120 }} />
            ) : (
              <div key={name} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "8px 10px 8px 16px", borderRadius: 8, background: C.cardLight, color: C.white, border: `1px solid ${C.grayDark}`, fontSize: 13, fontWeight: 600 }}>
                <span onClick={() => editMode ? (setRenaming(name), setRenameValue(name)) : onSelect(name)} style={{ cursor: "pointer" }}>{name}</span>
                {editMode && (
                  <button onClick={() => onRemoveOpponent?.(name)} style={{ background: "transparent", border: "none", color: C.red, cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }} aria-label={`${name} 제거`}>✕</button>
                )}
              </div>
            )
          ))}
          {!editMode && (
            <button onClick={() => setAdding(true)}
              style={{ padding: "8px 16px", borderRadius: 8, background: `${C.accent}20`, color: C.accent, border: `1px dashed ${C.accent}`, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              + 새 상대팀
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: SoccerMatchView가 새 props 전달**

In `src/components/game/SoccerMatchView.jsx`, add to the component props destructure (line 10-15) `onRemoveOpponent, onRenameOpponent,` and update the `<OpponentSelector>` usage (line 204):

```jsx
        <OpponentSelector opponents={opponents} onSelect={handleOpponentSelect} onAddOpponent={onAddOpponent}
          onRemoveOpponent={onRemoveOpponent} onRenameOpponent={onRenameOpponent} styles={s} />
```

(`SoccerApp.jsx` already passes `onRemoveOpponent`/`onRenameOpponent` from Task 4 Step 5. Also confirm `onAddOpponent={addOpponent}` is still wired in SoccerApp's `<SoccerMatchView>` render — it is, unchanged.)

- [ ] **Step 3: Verify 경기 화면 상대팀**

Run dev server. setup에서 참석팀 2~3개 고르고 경기 시작 → 경기 생성 화면.
Expected:
- 오늘 참석팀만 칩으로 노출(전체 시트목록 아님).
- "편집" → 칩에 ✕(삭제), 칩 탭하면 이름변경 인라인 입력. "완료"로 빠져나옴.
- 일반 모드에서 칩 탭 → 스쿼드 화면 진입. "+새 상대팀" → 추가+바로 진입.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/OpponentSelector.jsx src/components/game/SoccerMatchView.jsx
git commit -m "feat(soccer): 경기선택을 오늘 참석팀 기준으로 + 삭제/이름변경"
```

---

## Task 8: SoccerMatchView — 경기 사이 "명단 수정" + subs 전달

**Files:**
- Modify: `src/components/game/SoccerMatchView.jsx`
- Modify: `src/SoccerApp.jsx` (`<SoccerMatchView>`에 명단수정용 props 전달)

경기 선택 화면에 "명단 수정" 진입점. `AttendeeSelector` 재사용. 포메이션 확정 시 `subs` 전달.

- [ ] **Step 1: handleFormationConfirm이 subs 전달**

In `src/components/game/SoccerMatchView.jsx`, change `handleFormationConfirm` (line 57-66) `onCreateMatch` call:

```js
    onCreateMatch({ opponent: selectedOpponent, lineup, gk, defenders, subs });
```

(`subs` is already destructured from the formation confirm payload at line 57.)

- [ ] **Step 2: 명단수정 진입점 + 편집 뷰**

In `src/components/game/SoccerMatchView.jsx`:

a) Add imports at top:
```jsx
import AttendeeSelector from './AttendeeSelector';
```

b) Extend props (line 10-15) to receive roster-edit wiring:
```jsx
  onRemoveOpponent, onRenameOpponent,
  sortedPlayers, playerSortMode, rosterHandlers,
```
where `rosterHandlers` bundles `{ onSyncSheet, onToggle, onSetAll, onClear, onToggleSort, onAddManual, newPlayer, onNewPlayerChange, attendanceLoading }`.

c) Add a local `viewState` value `"editRoster"`. In the default (selectOpponent) return block (line 200's `<div style={{ ...s.card }}>`), add a "명단 수정" button right after the `경기 생성`/`제N경기` title line (after line 203):

```jsx
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button onClick={() => setViewState("editRoster")}
            style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: C.grayDark, color: C.white, border: "none", cursor: "pointer" }}>
            👥 명단 수정 ({attendees.length})
          </button>
        </div>
```

d) Add an early-return branch for the edit view (place before the final `return` of the default view, e.g. right after the `viewState === "formation"` block at line 180):

```jsx
  if (viewState === "editRoster") {
    return (
      <div>
        <button onClick={() => setViewState("selectOpponent")} style={{ marginBottom: 10, padding: "6px 14px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>← 완료</button>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 4 }}>참석명단 수정</div>
        <div style={{ fontSize: 11, color: C.gray, marginBottom: 10 }}>변경은 다음 경기부터 반영됩니다. (진행/종료된 경기는 그대로)</div>
        <AttendeeSelector
          attendees={attendees} sortedPlayers={sortedPlayers || []} playerSortMode={playerSortMode}
          {...rosterHandlers} styles={s} />
      </div>
    );
  }
```

- [ ] **Step 3: SoccerApp가 props 전달**

In `src/SoccerApp.jsx` `<SoccerMatchView ...>` render (around line 413), add:

```jsx
            sortedPlayers={sortedPlayers} playerSortMode={playerSortMode}
            rosterHandlers={{
              onSyncSheet: syncAttendance,
              onToggle: (name) => dispatch({ type: 'TOGGLE_ATTENDEE', name }),
              onSetAll: (names) => dispatch({ type: 'SET_ATTENDEES', attendees: names }),
              onClear: () => set('attendees', []),
              onToggleSort: () => set('playerSortMode', playerSortMode === "point" ? "name" : "point"),
              onAddManual: (name) => dispatch({ type: 'SET_FIELDS', fields: { attendees: [...attendees, name], newPlayer: "" } }),
              newPlayer, onNewPlayerChange: (v) => set('newPlayer', v),
              attendanceLoading,
            }}
```

- [ ] **Step 4: Verify 명단수정 + 스냅샷**

Run dev server. 경기 생성 화면 → "명단 수정" → 선수 토글/추가 → "완료". 다음 경기 스쿼드에서 변경된 명단이 반영되는지 확인. 이전에 종료한 경기의 출전선수는 불변.
멀티탭: 다른 탭에서도 명단 변경이 전파되는지(autoSync deps에 attendees 추가됨) 확인.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/SoccerMatchView.jsx src/SoccerApp.jsx
git commit -m "feat(soccer): 경기 사이 명단 수정 + subs 스냅샷 전달"
```

---

## Task 9: FormationSetup — 탭-탭 양끝 선택 + 선수목록 상시 노출

**Files:**
- Modify: `src/components/game/FormationSetup.jsx`

선수 목록을 피치 아래 상시 노출. 선수 탭→하이라이트, 빈 슬롯 탭→배치. 양끝 선택(슬롯 먼저든 선수 먼저든). 점유 슬롯: 선택선수 있으면 스왑, 없으면 해제.

- [ ] **Step 1: 핸들러/상태 교체**

In `src/components/game/FormationSetup.jsx`, replace the state + handlers (lines 8-27) :

```jsx
  const [formation, setFormation] = useState("4-4-2");
  const [assignments, setAssignments] = useState({});
  const [selectingPos, setSelectingPos] = useState(null);   // 선택된 빈 슬롯
  const [selectedPlayer, setSelectedPlayer] = useState(null); // 선택된 선수

  const formData = FORMATIONS[formation];
  const assignedNames = new Set(Object.values(assignments));
  const unassigned = selectedPlayers.filter(n => !assignedNames.has(n)).sort((a, b) => a.localeCompare(b, "ko"));
  const assignedCount = Object.keys(assignments).length;
  const canStart = assignedCount === 11;

  // 빈 슬롯 탭
  const handleEmptyTap = (posIdx) => {
    if (selectedPlayer) {
      setAssignments(prev => ({ ...prev, [posIdx]: selectedPlayer }));
      setSelectedPlayer(null);
      setSelectingPos(null);
    } else {
      setSelectingPos(prev => prev === posIdx ? null : posIdx);
    }
  };
  // 점유 슬롯 탭: 선택선수 있으면 스왑(기존선수 후보로), 없으면 해제
  const handlePlayerTap = (posIdx) => {
    if (selectedPlayer) {
      setAssignments(prev => ({ ...prev, [posIdx]: selectedPlayer }));
      setSelectedPlayer(null);
      setSelectingPos(null);
    } else {
      setAssignments(prev => { const next = { ...prev }; delete next[posIdx]; return next; });
    }
  };
  // 선수 칩 탭: 슬롯이 선택돼 있으면 배치, 아니면 선수 선택 토글
  const handlePlayerChip = (name) => {
    if (selectingPos !== null) {
      setAssignments(prev => ({ ...prev, [selectingPos]: name }));
      setSelectingPos(null);
      setSelectedPlayer(null);
    } else {
      setSelectedPlayer(prev => prev === name ? null : name);
    }
  };
```

- [ ] **Step 2: formation 변경 핸들러 정리**

Update `handleFormationChange` (line 27) to also clear `selectedPlayer`:

```jsx
  const handleFormationChange = (key) => { setFormation(key); setAssignments({}); setSelectingPos(null); setSelectedPlayer(null); };
```

- [ ] **Step 3: 렌더 — 선수목록 상시 노출 + 힌트 prop**

Replace the render section from `<FormationPitch ...>` (line 54) through the bench line (line 67) with:

```jsx
      <FormationPitch positions={formData.positions} assignments={assignments}
        onPlayerTap={handlePlayerTap} onEmptyTap={handleEmptyTap}
        highlightIdx={selectingPos} pendingPlayer={selectedPlayer} />
      <div style={{ marginTop: 12, padding: 12, background: C.card, borderRadius: 10, border: `1px solid ${selectedPlayer ? C.accent : C.grayDark}` }}>
        <div style={{ fontSize: 12, color: selectedPlayer ? C.accent : C.gray, fontWeight: 700, marginBottom: 8 }}>
          {selectedPlayer ? `${selectedPlayer} → 배치할 위치를 탭하세요` : selectingPos !== null ? `${formData.positions[selectingPos].role} 자리에 넣을 선수를 탭하세요` : `후보 (${unassigned.length}) — 선수를 탭한 뒤 위치를 탭`}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {unassigned.map(name => (
            <button key={name} onClick={() => handlePlayerChip(name)}
              style={{ padding: "8px 12px", borderRadius: 8, border: selectedPlayer === name ? `2px solid ${C.accent}` : "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: selectedPlayer === name ? `${C.accent}30` : C.grayDarker, color: C.white }}>{name}</button>
          ))}
          {unassigned.length === 0 && <span style={{ fontSize: 12, color: C.gray }}>모든 선수 배치 완료</span>}
        </div>
      </div>
```

(Removes the old conditional `selectingPos !== null` panel and the separate 후보 line — now unified into one always-visible list.)

- [ ] **Step 4: Verify 탭-탭**

Run dev server, 스쿼드 화면.
Expected:
- 후보 목록이 항상 보임.
- 선수 탭 → 강조 → 빈 슬롯 탭 → 배치.
- 빈 슬롯 탭 → 강조 → 선수 탭 → 배치 (역방향도 됨).
- 점유 슬롯 탭(선수 미선택) → 후보로 복귀.
- 선수 선택 후 점유 슬롯 탭 → 스왑.
- 11명 채우면 "경기 시작" 활성.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/FormationSetup.jsx
git commit -m "feat(soccer): 스쿼드 탭-탭 양끝 선택 + 선수목록 상시 노출"
```

---

## Task 10: FormationPitch — 선수 선택 시 빈 슬롯 힌트 글로우

**Files:**
- Modify: `src/components/game/FormationPitch.jsx`

`pendingPlayer`가 있을 때 빈 슬롯을 은은히 글로우해 "여기 놓으세요" 힌트.

- [ ] **Step 1: prop 추가 + 빈 슬롯 글로우**

In `src/components/game/FormationPitch.jsx`, add `pendingPlayer` to props (line 4):

```jsx
export default function FormationPitch({ positions, assignments = {}, onPlayerTap, onEmptyTap, highlightIdx, pendingPlayer, size = 340 }) {
```

Then in the inner circle style (lines 31-39), make empty slots glow when a player is pending. Change the `border` and `boxShadow` lines:

```jsx
              border: isHighlight ? "3px solid #fff" : (!hasPlayer && pendingPlayer) ? `2px solid ${C.accent}` : `2px solid ${hasPlayer ? roleColor : "rgba(255,255,255,0.3)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 800, color: "#fff",
              boxShadow: isHighlight ? "0 0 12px rgba(255,255,255,0.5)" : (!hasPlayer && pendingPlayer) ? `0 0 8px ${C.accent}88` : hasPlayer ? `0 2px 6px ${roleColor}44` : "none",
```

- [ ] **Step 2: Verify 힌트**

Run dev server, 스쿼드 화면. 후보 선수 하나 탭 → 빈 슬롯들이 액센트 색으로 은은히 글로우되는지 확인. 슬롯 채우거나 선택 해제하면 글로우 사라짐.
(FormationRecorder도 같은 FormationPitch를 쓰지만 `pendingPlayer`를 안 넘기므로 영향 없음 — 회귀 확인.)

- [ ] **Step 3: Commit**

```bash
git add src/components/game/FormationPitch.jsx
git commit -m "feat(soccer): 선수 선택 시 빈 슬롯 힌트 글로우"
```

---

## Task 11: SettingsScreen — "상대팀 관리" 섹션 제거

**Files:**
- Modify: `src/components/common/SettingsScreen.jsx` (lines ~393-440 섹션 + 관련 미사용 상태)

시트가 상대팀 소스가 되었으므로 설정의 수동 CRUD 섹션 제거.

- [ ] **Step 1: 섹션 제거**

In `src/components/common/SettingsScreen.jsx`, delete the entire `<div style={ss.section}>` block containing `상대팀 관리` (from the `<div className="app-section-label">상대팀 관리</div>` parent section through its closing `</div>`). Confirm the exact block boundaries by reading around lines 393-445 before deleting.

- [ ] **Step 2: 미사용 상태 정리**

Search the file for `newOpponent` (the `useState` and `setNewOpponent`). If now unused after removal, delete its `useState` declaration. Run:

```bash
grep -n "newOpponent" src/components/common/SettingsScreen.jsx
```

If no remaining references, remove the `const [newOpponent, setNewOpponent] = useState(...)` line.

- [ ] **Step 3: Verify 설정화면**

Run dev server → 설정 화면 진입. Expected: "상대팀 관리" 섹션이 사라졌고, 다른 설정 항목은 정상. 콘솔/빌드 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add src/components/common/SettingsScreen.jsx
git commit -m "refactor(soccer): 설정의 상대팀 관리 섹션 제거 (시트가 소스)"
```

---

## Task 12: 헤더 버튼 대비 수정

**Files:**
- Modify: `src/SoccerApp.jsx` (lines 304, 305, 306, 358)

하드코딩 흰색 → 테마 토큰. light 테마에서도 보이게.

- [ ] **Step 1: match phase 홈 버튼 (line 358)**

Replace:

```jsx
            <button onClick={onBackToMenu} style={{ position: "absolute", left: 16, background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>홈</button>
```

with:

```jsx
            <button onClick={onBackToMenu} style={{ position: "absolute", left: 16, background: C.headerBtnBg, color: C.headerBtnColor, border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>홈</button>
```

- [ ] **Step 2: setup phase 헤더(line 304-306)**

Replace the user-name span + 메뉴/로그아웃 buttons:

```jsx
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{authUser.name} · {teamContext?.team}</span>
              {onBackToMenu && <button onClick={onBackToMenu} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", border: "none", cursor: "pointer" }}>메뉴</button>}
              <button onClick={onLogout} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", border: "none", cursor: "pointer" }}>로그아웃</button>
```

with:

```jsx
              <span style={{ fontSize: 11, color: C.headerBtnDimColor }}>{authUser.name} · {teamContext?.team}</span>
              {onBackToMenu && <button onClick={onBackToMenu} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: C.headerBtnBg, color: C.headerBtnDimColor, border: "none", cursor: "pointer" }}>메뉴</button>}
              <button onClick={onLogout} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: C.headerBtnBg, color: C.headerBtnDimColor, border: "none", cursor: "pointer" }}>로그아웃</button>
```

- [ ] **Step 3: Verify 대비**

Run dev server (light 테마 기본). Expected: 경기 진행 화면의 "홈" 버튼 글씨가 또렷하게 보임. setup 헤더의 메뉴/로그아웃/사용자명도 또렷. 다크 테마(설정에서 토글)에서도 정상.

- [ ] **Step 4: Commit**

```bash
git add src/SoccerApp.jsx
git commit -m "fix(soccer): 헤더 홈/메뉴 버튼 대비 (하드코딩 흰색 → 테마 토큰)"
```

---

## Task 13: 통합 검증 (Playwright + 라이브 시트 파싱)

**Files:** 없음 (검증 전용; 발견된 버그는 해당 Task로 돌아가 수정)

REQUIRED SUB-SKILL: `playwright-verify-and-fix`.

- [ ] **Step 1: 라이브 시트 상대팀 파싱 확인**

dev server 실행, 하버FC 축구 새 경기. setup의 "참석팀" 섹션에 실제 시트의 상대팀(시청/아이콘/터틀파크/한울 등)이 **경기수 순**으로 뜨는지 확인. 안 뜨면 → Task 1의 `parseSoccerOpponents` 컬럼 탐지를 실제 CSV에 맞게 조정(브라우저에서 `대시보드` CSV를 직접 떠 컬럼 위치 확인: gviz URL은 `constants.js`의 `csvUrlBySheet`).

- [ ] **Step 2: 전체 플로우 E2E**

순서대로 확인:
1. setup: 시트연동이어도 자동진입 안 함 / 명단 시트불러오기+수동 / 참석팀 선택·추가·삭제.
2. 경기 시작 → 경기 생성: 오늘 참석팀만 노출 / 편집(삭제·이름변경) / 즉석추가.
3. 스쿼드: 탭-탭 양방향 + 스왑 + 힌트 글로우 + 11명 시작.
4. 골 이벤트 입력(기존) 정상.
5. 경기 종료 → 다음 경기 → "명단 수정"으로 명단 바꾸고 → 새 경기 스쿼드에 반영, 과거 경기 스냅샷 불변.
6. 헤더 홈/메뉴 버튼 또렷.

- [ ] **Step 3: 멀티탭 동기화 확인**

같은 게임을 두 탭에서 열고: 참석팀 변경 / 명단 변경 / 스쿼드 배치 / 골 이벤트가 양 탭에 전파되는지. (특히 명단 변경 — autoSync deps 수정이 효과 있는지.)

- [ ] **Step 4: 콘솔 에러 0 확인**

브라우저 콘솔에 에러/경고(특히 React key/prop) 없는지. 있으면 수정 후 재확인.

- [ ] **Step 5: 전체 단위 테스트 그린**

Run: `npx vitest run`
Expected: 전체 PASS (신규 2개 파일 포함, 기존 회귀 없음).

- [ ] **Step 6: 최종 커밋(검증 중 수정분 있으면)**

```bash
git add -A
git commit -m "test(soccer): 경기 당일 플로우 통합 검증 및 수정"
```

---

## Self-Review (작성자 체크)

**Spec coverage:**
- 상대팀 시트 소스 → Task 1,2. ✓
- 참석팀=오늘 subset(state.opponents 재정의) → Task 4,6,7. ✓
- 초기세팅 항상 표시 + 명단(시트+수동) → Task 4(자동진입 제거), 5,6. ✓
- 경기선택을 참석팀 기준 → Task 7. ✓
- 경기 사이 명단 수정 → Task 8. ✓
- 경기별 subs 스냅샷 → Task 3,8. ✓
- 스쿼드 탭-탭 → Task 9,10. ✓
- 헤더 홈 색 → Task 12. ✓
- 동기화 버그(attendees deps) → Task 4 Step 4. ✓
- SettingsScreen 상대팀 제거 → Task 11. ✓
- AttendeeSelector 추출 → Task 5. ✓

**Type/이름 일관성:** `parseSoccerOpponents`(Task1) ↔ fetchSheetData(Task2) ↔ opponentSuggestions(Task4,6). `subs`(Task3 리듀서) ↔ handleFormationConfirm(Task8) ↔ FormationSetup onConfirm(기존). `pendingPlayer`(Task9→Task10). `rosterHandlers` 키(Task8 ↔ AttendeeSelector props Task5) 일치 확인.

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. TBD 없음.
