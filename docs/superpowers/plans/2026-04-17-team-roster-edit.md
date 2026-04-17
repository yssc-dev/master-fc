# 경기 중 팀 명단 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 경기 화면 `팀명단` 모달 상단에 `팀 수정` 버튼을 추가하고, 클릭 시 기존 팀 편성 화면을 편집 모드로 재진입시켜 선수 추가/제거만 허용한다. 완료/취소 시 경기 화면으로 복귀하며, 과거 경기 기록과 스케줄은 그대로 유지.

**Architecture:** 기존 `phase === "teamBuild"` 화면을 재활용. `teamEditMode` 플래그와 `teamEditSnapshot`을 리듀서 상태에 추가. 편집 모드일 때만 팀 편성 화면에 제약(팀 이름/색/재배치 차단)과 미배정 풀 확장(불참 시즌 선수 + 수기 입력) 및 완료/취소 버튼을 조건부 렌더. 스케줄/경기기록은 불변.

**Tech Stack:** React + useReducer. `src/App.jsx`, `src/hooks/useGameReducer.js`.

**Spec:** `docs/superpowers/specs/2026-04-17-team-roster-edit-design.md`

---

## Task 1: 리듀서 — 상태와 액션 3종 추가

**Files:**
- Modify: `src/hooks/useGameReducer.js:4-47` (initialState)
- Modify: `src/hooks/useGameReducer.js:205` (MOVE_PLAYER 바로 뒤에 새 case 3개 삽입)

- [ ] **Step 1: initialState에 편집 모드 필드 2개 추가**

Run: `grep -n 'soccerFormation: null' src/hooks/useGameReducer.js`
Expected: `46:  soccerFormation: null, // ...` 한 줄.

`src/hooks/useGameReducer.js` 라인 46의 `soccerFormation` 선언 바로 위 (라인 44~45 사이, `// 축구 전용` 주석 바로 위) 에 다음 2줄 삽입:

**Before (라인 42~46):**
```js
  pushState: null,
  // 축구 전용
  soccerMatches: [],
  currentMatchIdx: -1,
  opponents: [],
  soccerFormation: null, // { formation, assignments, positionMap, subs, gk, viewState, selectedOpponent }
```

**After:**
```js
  pushState: null,
  // 경기 중 팀 명단 수정
  teamEditMode: false,
  teamEditSnapshot: null,
  // 축구 전용
  soccerMatches: [],
  currentMatchIdx: -1,
  opponents: [],
  soccerFormation: null, // { formation, assignments, positionMap, subs, gk, viewState, selectedOpponent }
```

주의: `teamEditMode`와 `teamEditSnapshot`은 **Firebase에 저장되지 않는 transient 상태**. `RESTORE_STATE` 케이스(라인 55~93)에 추가하지 말 것.

- [ ] **Step 2: MOVE_PLAYER 다음에 새 액션 3개 삽입**

**찾기:** `src/hooks/useGameReducer.js:197-205` 의 `MOVE_PLAYER` 케이스가 끝나는 `return { ...state, teams, gks };` 와 그 다음 `case 'START_MATCHES':` 사이.

라인 205의 닫는 괄호 `}` 직후, 다음 case 앞에 아래 3개 케이스 삽입:

```js
    case 'ENTER_TEAM_EDIT': {
      return {
        ...state,
        teamEditMode: true,
        teamEditSnapshot: {
          teams: state.teams.map(t => [...t]),
          attendees: [...state.attendees],
          gks: { ...state.gks },
        },
        phase: 'teamBuild',
        draftMode: 'free',
        matchModal: null,
        moveSource: null,
        editingTeamName: null,
      };
    }
    case 'EXIT_TEAM_EDIT_SAVE': {
      // GK 정리: 각 팀에서 빠진 선수가 GK로 지정돼 있으면 해제
      const newGks = { ...state.gks };
      state.teams.forEach((team, i) => {
        if (newGks[i] && !team.includes(newGks[i])) delete newGks[i];
      });
      return {
        ...state,
        teamEditMode: false,
        teamEditSnapshot: null,
        gks: newGks,
        phase: 'match',
        moveSource: null,
        editingTeamName: null,
      };
    }
    case 'EXIT_TEAM_EDIT_CANCEL': {
      const snap = state.teamEditSnapshot;
      const restored = snap
        ? { teams: snap.teams, attendees: snap.attendees, gks: snap.gks }
        : {};
      return {
        ...state,
        ...restored,
        teamEditMode: false,
        teamEditSnapshot: null,
        phase: 'match',
        moveSource: null,
        editingTeamName: null,
      };
    }
```

주의:
- `ENTER_TEAM_EDIT` 에서 `draftMode: 'free'`로 전환: 편집 모드는 자유 편성 UX 재활용.
- snapshot은 깊은 복사 필수 (`teams.map(t => [...t])`) — 원본 배열을 나중에 mutate하지 않지만, 방어적으로.
- `matchModal: null` 로 모달 닫음.

- [ ] **Step 3: 리듀서 로드 확인**

Run: `node -e "require('./src/hooks/useGameReducer.js')"` 
Expected: **실행 안 됨 (ESM), 무시**. 대신 빌드로 확인:

Run: `npm run build`
Expected: `dist/` 생성, syntax error 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/hooks/useGameReducer.js
git commit -m "feat: 팀 명단 수정 리듀서 액션 추가 (ENTER/SAVE/CANCEL)"
```

---

## Task 2: App.jsx — state 구조분해 + 팀명단 모달 상단에 `팀 수정` 버튼

**Files:**
- Modify: `src/App.jsx:29-35` (state destructure)
- Modify: `src/App.jsx:849-870` (teamRoster modal)

- [ ] **Step 1: state에서 `teamEditMode` 구조분해 추가**

Run: `grep -n 'matchModal, matchModal_sortKey' src/App.jsx`
Expected: `31:    matchModal, matchModal_sortKey, ... ` 형태 한 줄.

해당 라인 (대략 라인 29~35의 구조분해 블록) 에서 `matchModal,` 뒤에 `teamEditMode,` 를 추가.

**찾아 교체** (`src/App.jsx`):

**Before:**
```js
    matchModal, matchModal_sortKey, playerSortMode, pushState,
```

**After:**
```js
    matchModal, matchModal_sortKey, playerSortMode, pushState, teamEditMode,
```

- [ ] **Step 2: teamRoster 모달 상단에 `팀 수정` 버튼 추가**

**찾기:** `src/App.jsx:849-870` 의 `matchModal === "teamRoster"` 블록. Modal 내부 `<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>` 바로 **위에** 버튼 영역을 삽입.

**Before (라인 849-851):**
```jsx
        {matchModal === "teamRoster" && (
          <Modal onClose={() => set('matchModal', null)} title="팀 명단">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
```

**After:**
```jsx
        {matchModal === "teamRoster" && (
          <Modal onClose={() => set('matchModal', null)} title="팀 명단">
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <button onClick={() => dispatch({ type: 'ENTER_TEAM_EDIT' })}
                style={{ ...s.btnSm(C.orange, C.bg), fontSize: 12, fontWeight: 700 }}>
                팀 수정
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
```

주의:
- 다른 "팀 편성" 버튼들과 동일한 `s.btnSm(C.orange, C.bg)` 스타일 사용 (코드베이스 패턴).
- `dispatch` 는 이미 컴포넌트 스코프 내 사용 중 (라인 384, 429 등 참고).

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 에러 없음.

- [ ] **Step 4: 수동 확인 (dev server)**

Run: `npm run dev` (이미 떠있으면 생략)
브라우저에서:
1. 경기 화면 진입 (대진표 모드 아무 경기)
2. 상단 "팀명단" 버튼 클릭 → 모달 오픈
3. 모달 상단 우측에 **"팀 수정"** 버튼 보임
4. 클릭 → 팀 편성 화면으로 전환됨 확인 (다음 task에서 편집 모드 UI 적용 예정이라 현재는 일반 자유편성 화면으로 보여도 OK — 단, `teams`/`attendees`/`gks`는 동일해야 함)

Expected: phase가 teamBuild로 바뀌고, 기존 팀 명단 그대로 보임.

- [ ] **Step 5: 커밋**

```bash
git add src/App.jsx
git commit -m "feat: 팀명단 모달 상단에 팀 수정 버튼 추가"
```

---

## Task 3: App.jsx — 편집 모드 UI 조건부 렌더 (teamBuild phase)

**Files:**
- Modify: `src/App.jsx:411-414` (unassignedPlayers useMemo 보강)
- Modify: `src/App.jsx:676-797` (teamBuild phase 전체)

- [ ] **Step 1: 편집 모드 전용 미배정 풀 계산**

Run: `grep -n 'const unassignedPlayers = useMemo' src/App.jsx`
Expected: `411:  const unassignedPlayers = useMemo(() => {`

**Before (라인 411-414):**
```jsx
  const unassignedPlayers = useMemo(() => {
    const assigned = new Set(teams.flat());
    return attendees.filter(p => !assigned.has(p));
  }, [teams, attendees]);
```

**After:**
```jsx
  const unassignedPlayers = useMemo(() => {
    const assigned = new Set(teams.flat());
    return attendees.filter(p => !assigned.has(p));
  }, [teams, attendees]);

  const absentSeasonPool = useMemo(() => {
    if (!teamEditMode) return [];
    const assigned = new Set(teams.flat());
    return seasonPlayers
      .map(p => p.name)
      .filter(n => !attendees.includes(n) && !assigned.has(n));
  }, [teamEditMode, teams, attendees, seasonPlayers]);
```

주의: `seasonPlayers`는 이미 라인 29의 구조분해에서 가져옴. `absentSeasonPool`은 편집 모드가 아닐 때 빈 배열 → 일반 편성 플로우에는 영향 없음.

- [ ] **Step 2: teamBuild 헤더 subtitle 편집 모드 표시**

**Before (라인 682-685):**
```jsx
        <div style={s.header}>
          <div style={s.title}>⚽ 팀 편성</div>
          <div style={s.subtitle}>{draftMode === "snake" ? "스네이크 드래프트" : "자유 편성"} · {teamCount}팀 · {attendees.length}명</div>
        </div>
```

**After:**
```jsx
        <div style={s.header}>
          <div style={s.title}>⚽ {teamEditMode ? "팀 명단 수정" : "팀 편성"}</div>
          <div style={s.subtitle}>{teamEditMode ? "경기 진행 중 · 편집 모드" : `${draftMode === "snake" ? "스네이크 드래프트" : "자유 편성"} · ${teamCount}팀 · ${attendees.length}명`}</div>
        </div>
```

- [ ] **Step 3: 초기화 버튼 숨김 + 편집 모드 안내**

**Before (라인 687-692):**
```jsx
        <div style={s.section}>
          <div style={{ ...s.row, marginBottom: 12 }}>
            {draftMode === "snake" && <button onClick={reshuffleTeams} style={s.btnSm(C.grayDark)}>재배치</button>}
            {draftMode === "free" && <button onClick={() => dispatch({ type: 'SET_FIELDS', fields: { teams: Array.from({ length: teamCount }, () => []), teamNames: Array.from({ length: teamCount }, (_, i) => `팀 ${i + 1}`), gks: {} } })} style={s.btnSm(C.grayDark)}>초기화</button>}
            <span style={{ fontSize: 11, color: C.gray }}>전력: {teams.map(t => teamPower(t, seasonPlayers)).join(" / ")}</span>
          </div>
```

**After:**
```jsx
        <div style={s.section}>
          <div style={{ ...s.row, marginBottom: 12 }}>
            {!teamEditMode && draftMode === "snake" && <button onClick={reshuffleTeams} style={s.btnSm(C.grayDark)}>재배치</button>}
            {!teamEditMode && draftMode === "free" && <button onClick={() => dispatch({ type: 'SET_FIELDS', fields: { teams: Array.from({ length: teamCount }, () => []), teamNames: Array.from({ length: teamCount }, (_, i) => `팀 ${i + 1}`), gks: {} } })} style={s.btnSm(C.grayDark)}>초기화</button>}
            <span style={{ fontSize: 11, color: C.gray }}>전력: {teams.map(t => teamPower(t, seasonPlayers)).join(" / ")}</span>
          </div>
```

- [ ] **Step 4: 미배정 풀 확장 (불참 시즌 + 수기 입력)**

**찾기:** 라인 694-708 의 `draftMode === "free" && unassignedPlayers.length > 0 &&` 블록.

**Before (라인 694-708):**
```jsx
          {draftMode === "free" && unassignedPlayers.length > 0 && (
            <div style={{ ...s.card, border: `2px solid ${C.accent}44`, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 8 }}>미배정 선수 ({unassignedPlayers.length}명) → 아래 팀을 선택 후 클릭</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {[...unassignedPlayers].sort((a, b) => getPlayerPoint(b, seasonPlayers) - getPlayerPoint(a, seasonPlayers)).map(p => {
                  const pd = getPlayerData(p, seasonPlayers);
                  return (
                    <div key={p} onClick={() => freeAddPlayer(p)} style={{ ...s.chip(false), cursor: "pointer", padding: "6px 10px", fontSize: 12 }}>
                      <span>{p}</span><span style={{ fontSize: 10, opacity: 0.6 }}>{pd.point}p</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
```

**After:**
```jsx
          {draftMode === "free" && (unassignedPlayers.length > 0 || teamEditMode) && (
            <div style={{ ...s.card, border: `2px solid ${C.accent}44`, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 8 }}>미배정 선수 ({unassignedPlayers.length}명) → 아래 팀을 선택 후 클릭</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {[...unassignedPlayers].sort((a, b) => getPlayerPoint(b, seasonPlayers) - getPlayerPoint(a, seasonPlayers)).map(p => {
                  const pd = getPlayerData(p, seasonPlayers);
                  return (
                    <div key={p} onClick={() => freeAddPlayer(p)} style={{ ...s.chip(false), cursor: "pointer", padding: "6px 10px", fontSize: 12 }}>
                      <span>{p}</span><span style={{ fontSize: 10, opacity: 0.6 }}>{pd.point}p</span>
                    </div>
                  );
                })}
              </div>
              {teamEditMode && absentSeasonPool.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginTop: 10, marginBottom: 6 }}>불참 시즌 선수 ({absentSeasonPool.length}명)</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {[...absentSeasonPool].sort((a, b) => getPlayerPoint(b, seasonPlayers) - getPlayerPoint(a, seasonPlayers)).map(p => {
                      const pd = getPlayerData(p, seasonPlayers);
                      return (
                        <div key={p} onClick={() => { dispatch({ type: 'SET_FIELDS', fields: { attendees: [...attendees, p] } }); freeAddPlayer(p); }}
                          style={{ ...s.chip(false), cursor: "pointer", padding: "6px 10px", fontSize: 12, opacity: 0.85 }}>
                          <span>{p}</span><span style={{ fontSize: 10, opacity: 0.6 }}>{pd.point}p</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {teamEditMode && (
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <input style={{ ...s.input, flex: 1, fontSize: 12, padding: "6px 8px" }} placeholder="새 선수 이름 (게스트)"
                    value={newPlayer} onChange={e => set('newPlayer', e.target.value)}
                    onKeyDown={e => {
                      if (e.key !== "Enter") return;
                      const name = newPlayer.trim();
                      if (!name || attendees.includes(name) || teams.flat().includes(name)) { set('newPlayer', ""); return; }
                      dispatch({ type: 'SET_FIELDS', fields: { attendees: [...attendees, name], newPlayer: "" } });
                      freeAddPlayer(name);
                    }} />
                  <button onClick={() => {
                    const name = newPlayer.trim();
                    if (!name || attendees.includes(name) || teams.flat().includes(name)) { set('newPlayer', ""); return; }
                    dispatch({ type: 'SET_FIELDS', fields: { attendees: [...attendees, name], newPlayer: "" } });
                    freeAddPlayer(name);
                  }} style={s.btnSm(C.green, C.bg)}>추가</button>
                </div>
              )}
            </div>
          )}
```

주의:
- `newPlayer` state는 이미 initialState에 존재(라인 14) — 재사용.
- `freeAddPlayer(name)`은 현재 선택된 `freeSelectTeam`에 추가 (라인 393-399). 편집 모드에서도 자유 편성과 동일하게 동작하므로 유저가 **먼저 팀을 선택**해야 함. 이는 기존 자유 편성 UX와 동일.
- 시즌에 없는 게스트는 `getPlayerData`가 `{ point: 0 }`를 반환 → 0p 표시 자동 처리.

- [ ] **Step 5: 팀 이름 편집 불가 + 색상 피커 숨김**

**찾기:** 라인 729-745 의 팀 헤더 영역.

**Before (라인 729-745):**
```jsx
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {editingTeamName === tIdx ? (
                      <input autoFocus style={{ ...s.input, width: 100, padding: "4px 8px", fontSize: 14, fontWeight: 700 }} value={teamNames[tIdx]}
                        onChange={e => { const c = [...teamNames]; c[tIdx] = e.target.value; set('teamNames', c); }}
                        onBlur={() => set('editingTeamName', null)} onKeyDown={e => e.key === "Enter" && set('editingTeamName', null)} />
                    ) : (
                      <span style={{ fontWeight: 700, fontSize: 14, cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); set('editingTeamName', tIdx); }}>{teamNames[tIdx]}</span>
                    )}
                    <span style={{ fontSize: 11, color: C.gray }}>전력 {teamPower(team, seasonPlayers)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 3 }}>
                    {TEAM_COLORS.map((tc, ci) => (
                      <div key={ci} onClick={(e) => { e.stopPropagation(); const c = [...teamColorIndices]; c[tIdx] = ci; set('teamColorIndices', c); }}
                        style={{ width: 16, height: 16, borderRadius: "50%", background: tc.bg, border: teamColorIndices[tIdx] === ci ? `2px solid ${C.white}` : `1px solid ${C.grayDark}`, cursor: "pointer" }} />
                    ))}
                  </div>
                </div>
```

**After:**
```jsx
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {!teamEditMode && editingTeamName === tIdx ? (
                      <input autoFocus style={{ ...s.input, width: 100, padding: "4px 8px", fontSize: 14, fontWeight: 700 }} value={teamNames[tIdx]}
                        onChange={e => { const c = [...teamNames]; c[tIdx] = e.target.value; set('teamNames', c); }}
                        onBlur={() => set('editingTeamName', null)} onKeyDown={e => e.key === "Enter" && set('editingTeamName', null)} />
                    ) : (
                      <span style={{ fontWeight: 700, fontSize: 14, cursor: teamEditMode ? "default" : "pointer" }}
                        onClick={(e) => { if (teamEditMode) return; e.stopPropagation(); set('editingTeamName', tIdx); }}>{teamNames[tIdx]}</span>
                    )}
                    <span style={{ fontSize: 11, color: C.gray }}>전력 {teamPower(team, seasonPlayers)}</span>
                  </div>
                  {!teamEditMode && (
                    <div style={{ display: "flex", gap: 3 }}>
                      {TEAM_COLORS.map((tc, ci) => (
                        <div key={ci} onClick={(e) => { e.stopPropagation(); const c = [...teamColorIndices]; c[tIdx] = ci; set('teamColorIndices', c); }}
                          style={{ width: 16, height: 16, borderRadius: "50%", background: tc.bg, border: teamColorIndices[tIdx] === ci ? `2px solid ${C.white}` : `1px solid ${C.grayDark}`, cursor: "pointer" }} />
                      ))}
                    </div>
                  )}
                </div>
```

- [ ] **Step 6: 하단 "경기 시작" → "완료/취소"로 교체 (편집 모드에서만)**

**찾기:** 라인 791-794.

**Before (라인 791-794):**
```jsx
        <div style={s.bottomBar}>
          <button onClick={() => set('phase', 'setup')} style={s.btn(C.grayDark)}>이전</button>
          <button onClick={startMatches} style={{ ...s.btn(C.green), flex: 1, opacity: teams.some(t => t.length < 1) ? 0.5 : 1 }}>경기 시작</button>
        </div>
```

**After:**
```jsx
        <div style={s.bottomBar}>
          {teamEditMode ? (
            <>
              <button onClick={() => dispatch({ type: 'EXIT_TEAM_EDIT_CANCEL' })} style={s.btn(C.grayDark)}>취소</button>
              <button onClick={() => {
                if (teams.some(t => t.length < 1)) { alert("모든 팀에 최소 1명"); return; }
                dispatch({ type: 'EXIT_TEAM_EDIT_SAVE' });
              }} style={{ ...s.btn(C.green), flex: 1, opacity: teams.some(t => t.length < 1) ? 0.5 : 1 }}>완료</button>
            </>
          ) : (
            <>
              <button onClick={() => set('phase', 'setup')} style={s.btn(C.grayDark)}>이전</button>
              <button onClick={startMatches} style={{ ...s.btn(C.green), flex: 1, opacity: teams.some(t => t.length < 1) ? 0.5 : 1 }}>경기 시작</button>
            </>
          )}
        </div>
```

- [ ] **Step 7: PhaseIndicator 감춤 (편집 모드일 때)**

**찾기:** 라인 686 `<PhaseIndicator activeIndex={1} />`.

**Before:**
```jsx
        <PhaseIndicator activeIndex={1} />
```

**After:**
```jsx
        {!teamEditMode && <PhaseIndicator activeIndex={1} />}
```

이유: PhaseIndicator는 전체 플로우(참석자→팀편성→경기→집계)를 보여주는데, 경기 중 임시 편집 모드에서는 맥락이 어긋남.

- [ ] **Step 8: 빌드 확인**

Run: `npm run build`
Expected: 에러 없음.

- [ ] **Step 9: 수동 테스트 (사용자가 직접)**

사용자가 브라우저에서:

**Case 1 — 제거:**
1. 대진표 모드 경기 R1 확정
2. 팀명단 → 팀 수정 → A팀 선수 한 명 ✕ → 미배정 풀로 이동 → 완료
3. R2 대진에서 해당 선수 없음 확인

**Case 2 — 시즌 불참자 추가:**
1. 팀명단 → 팀 수정 → "불참 시즌 선수" 섹션에서 한 명 클릭 → B팀 클릭 → 완료
2. B팀 명단에 포함 확인, attendees에 추가 확인 (개인기록 모달에서 노출)

**Case 3 — 게스트 수기 추가:**
1. 팀명단 → 팀 수정 → 팀 선택 → "새 선수 이름" 입력 → Enter → 완료
2. 해당 팀에 0p로 추가 확인

**Case 4 — GK 제거 자동 정리:**
1. GK 지정된 팀 선수 제거 → 완료
2. 다음 라운드에서 해당 팀 GK 미지정 상태 확인

**Case 5 — 취소:**
1. 팀 수정 → 여러 변경 → 취소
2. 경기 화면 복귀, teams/attendees/gks 변경 전 상태

**Case 6 — 회귀 (일반 플로우):**
1. 새 경기 시작 → 참석자 → 팀편성 (자유/스네이크 모두) → 경기 시작
2. 기존과 동일하게 동작 확인 (초기화/재배치/팀 이름/색/경기 시작 버튼)

Expected: 전 케이스 기존과 동일 + 편집 모드 동작.

- [ ] **Step 10: 커밋**

```bash
git add src/App.jsx
git commit -m "feat: 팀 편성 화면 편집 모드 UI (완료/취소, 불참자 초대, 게스트 입력)"
```

---

## Task 4: 최종 리뷰

**Files:**
- None (review only)

- [ ] **Step 1: diff 통합 확인**

Run: `git log --oneline -4 && echo --- && git diff HEAD~3..HEAD --stat`
Expected:
- 최근 3개 커밋: Task 1/2/3 각 하나씩
- 변경 파일: `src/App.jsx`, `src/hooks/useGameReducer.js` 2개

- [ ] **Step 2: 상태 clean 확인**

Run: `git status`
Expected: clean (또는 `.claude/` 만 untracked).

- [ ] **Step 3: 편집 모드 상태 persistence 확인**

Run: `grep -n 'teamEditMode\|teamEditSnapshot' src/hooks/useGameReducer.js`
Expected: `initialState`의 2줄 + 3개 `case` 내부 참조만 있고, `RESTORE_STATE` 블록(라인 55~93)에는 **없어야 함** (transient 상태 유지 규칙).

Run: `grep -n 'teamEditMode\|teamEditSnapshot' src/App.jsx`
Expected: state 구조분해 1회 + teamBuild phase 내 여러 참조. `useMemo` dependency에 포함된 `gameState` (라인 215 근처)에 포함되지 않음을 확인.

---

## 완료 기준

- [x] 팀명단 모달 상단에 `팀 수정` 버튼 노출
- [x] 클릭 시 팀 편성 화면 재진입, 제약(팀 이름/색/재배치/초기화 차단) 적용
- [x] 미배정 풀에 불참 시즌 선수 + 수기 입력(0p 게스트) 추가 UI
- [x] 완료 시 반영 + GK 자동 정리
- [x] 취소 시 스냅샷 복원
- [x] 과거 라운드 기록(`completedMatches`, `allEvents`) 불변
- [x] 스케줄(`schedule`) 불변
- [x] Firebase/시트 동기화 경로 변경 없음 (autoSave는 기존대로 동작)
- [x] 3개 커밋 (리듀서 / 진입점 / 편집 UI)
