# 밀어내기 대전 (Push Match) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 대진표/자유대진 방식에 "밀어내기" 경기 모드를 추가한다. 1구장에서 승리팀이 잔류하고, 시스템이 다음 대진을 자동 제안하며, 관리자가 변경 가능한 방식.

**Architecture:** `matchMode: "push"` 를 추가하고, 대진 자동 제안 로직을 순수 함수 `src/utils/pushMatch.js`에 분리. 새 뷰 컴포넌트 `PushMatchView.jsx`가 출전횟수 대시보드 + 대진 변경 + CourtRecorder 통합. reducer에 `pushState` 및 `CONFIRM_PUSH_ROUND` 액션 추가. 기존 순위/포인트/finalize 로직은 변경 없이 재사용.

**Tech Stack:** React 19, Vite, Firebase Realtime DB, Google Apps Script

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/utils/pushMatch.js` | Create | 대진 자동 제안 알고리즘 (순수 함수) |
| `src/components/game/PushMatchView.jsx` | Create | 밀어내기 전용 UI (대시보드 + 대진 + CourtRecorder) |
| `src/hooks/useGameReducer.js` | Modify | pushState 초기값, CONFIRM_PUSH_ROUND 액션, RESTORE_STATE에 pushState 복원 |
| `src/App.jsx` | Modify | setup UI에 "밀어내기" 버튼, match phase에서 PushMatchView 렌더, startMatches에서 pushState 초기화, formatMatchId에 P 패턴 추가, allRoundsComplete에 push 모드 처리, 헤더 subtitle에 push 모드 표시 |

---

### Task 1: 대진 자동 제안 유틸리티 — `src/utils/pushMatch.js`

**Files:**
- Create: `src/utils/pushMatch.js`

이 파일은 밀어내기 대전의 핵심 로직을 순수 함수로 제공한다.

- [ ] **Step 1: `calcNextPushMatch` 함수 작성**

이 함수는 현재 pushState와 직전 경기 결과를 받아, 갱신된 pushState(다음 대진 제안 포함)를 반환한다.

```js
// src/utils/pushMatch.js

/**
 * 밀어내기 초기 pushState를 생성한다.
 * @param {number} teamCount - 팀 수
 * @returns {object} 초기 pushState
 */
export function createInitialPushState(teamCount) {
  const teamPlayCounts = {};
  const teamTotalGoals = {};
  for (let i = 0; i < teamCount; i++) {
    teamPlayCounts[i] = 0;
    teamTotalGoals[i] = 0;
  }
  return {
    winStreak: null,
    teamPlayCounts,
    teamTotalGoals,
    lastLoser: null,
    forcedRest: null,
    suggestedMatch: { home: 0, away: 1 },
  };
}

/**
 * 경기 결과를 반영하여 다음 pushState(다음 대진 제안 포함)를 계산한다.
 *
 * @param {object} prevState - 현재 pushState
 * @param {object} matchResult - { homeIdx, awayIdx, homeScore, awayScore }
 * @param {number} teamCount - 총 팀 수
 * @param {string[]} teamNames - 팀 이름 배열 (정렬 기준용)
 * @returns {object} 갱신된 pushState
 */
export function calcNextPushMatch(prevState, matchResult, teamCount, teamNames) {
  const { homeIdx, awayIdx, homeScore, awayScore } = matchResult;

  // 1. 출전횟수, 득점 갱신
  const teamPlayCounts = { ...prevState.teamPlayCounts };
  const teamTotalGoals = { ...prevState.teamTotalGoals };
  teamPlayCounts[homeIdx] = (teamPlayCounts[homeIdx] || 0) + 1;
  teamPlayCounts[awayIdx] = (teamPlayCounts[awayIdx] || 0) + 1;
  teamTotalGoals[homeIdx] = (teamTotalGoals[homeIdx] || 0) + homeScore;
  teamTotalGoals[awayIdx] = (teamTotalGoals[awayIdx] || 0) + awayScore;

  // 2. 승패 판정
  let winnerIdx = null;
  let loserIdx = null;
  if (homeScore > awayScore) { winnerIdx = homeIdx; loserIdx = awayIdx; }
  else if (awayScore > homeScore) { winnerIdx = awayIdx; loserIdx = homeIdx; }
  // 무승부면 둘 다 null

  // 3. 연승 처리
  let winStreak = null;
  let forcedRest = null;
  let stayTeam = null; // 잔류하는 팀

  if (winnerIdx !== null && getScore(winnerIdx) >= 2) {
    // 승리팀 득점 >= 2: 잔류
    const prevStreak = prevState.winStreak;
    const isSameTeam = prevStreak && prevStreak.teamIdx === winnerIdx;
    const newCount = isSameTeam ? prevStreak.count + 1 : 1;

    if (newCount >= 3) {
      // 3연승: 강제 휴식
      winStreak = null;
      forcedRest = winnerIdx;
      stayTeam = null; // 둘 다 빠짐
    } else {
      winStreak = { teamIdx: winnerIdx, count: newCount };
      stayTeam = winnerIdx;
    }
  }
  // 그 외 (무승부, 1:0 등): winStreak = null, stayTeam = null

  // 4. 다음 대진 후보 결정
  const excluded = new Set();
  if (loserIdx !== null) excluded.add(loserIdx);
  if (forcedRest !== null) excluded.add(forcedRest);
  // 무승부/1:0일때 두 팀 다 제외
  if (stayTeam === null && forcedRest === null) {
    excluded.add(homeIdx);
    excluded.add(awayIdx);
  }

  let candidates = [];
  for (let i = 0; i < teamCount; i++) {
    if (i === stayTeam) continue; // 잔류팀은 후보에서 제외 (이미 확정)
    if (!excluded.has(i)) candidates.push(i);
  }

  // 엣지 케이스: 후보 부족 시 제한 완화
  const needed = stayTeam !== null ? 1 : 2;
  if (candidates.length < needed) {
    // lastLoser 제한 해제
    if (loserIdx !== null) excluded.delete(loserIdx);
    candidates = [];
    for (let i = 0; i < teamCount; i++) {
      if (i === stayTeam) continue;
      if (!excluded.has(i)) candidates.push(i);
    }
  }
  if (candidates.length < needed) {
    // forcedRest 제한도 해제
    if (forcedRest !== null) excluded.delete(forcedRest);
    candidates = [];
    for (let i = 0; i < teamCount; i++) {
      if (i === stayTeam) continue;
      if (!excluded.has(i)) candidates.push(i);
    }
  }
  if (candidates.length < needed) {
    // 모든 제한 해제 (3팀 무승부 등)
    candidates = [];
    for (let i = 0; i < teamCount; i++) {
      if (i === stayTeam) continue;
      candidates.push(i);
    }
  }

  // 5. 우선순위 정렬: 출전횟수 적은 순 → 다득점 순 → 팀이름순
  candidates.sort((a, b) => {
    const playDiff = (teamPlayCounts[a] || 0) - (teamPlayCounts[b] || 0);
    if (playDiff !== 0) return playDiff;
    const goalDiff = (teamTotalGoals[b] || 0) - (teamTotalGoals[a] || 0);
    if (goalDiff !== 0) return goalDiff;
    return (teamNames[a] || "").localeCompare(teamNames[b] || "", "ko");
  });

  // 6. 대진 구성
  let suggestedMatch;
  if (stayTeam !== null) {
    suggestedMatch = { home: stayTeam, away: candidates[0] };
  } else {
    suggestedMatch = { home: candidates[0], away: candidates[1] };
  }

  return {
    winStreak,
    teamPlayCounts,
    teamTotalGoals,
    lastLoser: loserIdx,
    forcedRest,
    suggestedMatch,
  };

  // 헬퍼: homeIdx/awayIdx에서 해당 팀 점수를 반환
  function getScore(idx) {
    return idx === homeIdx ? homeScore : awayScore;
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/utils/pushMatch.js
git commit -m "feat: 밀어내기 대진 자동 제안 유틸리티 추가"
```

---

### Task 2: Reducer에 pushState 추가 — `src/hooks/useGameReducer.js`

**Files:**
- Modify: `src/hooks/useGameReducer.js`

- [ ] **Step 1: initialState에 pushState 기본값 추가**

`useGameReducer.js`의 `initialState` 객체에 다음 필드를 추가한다. `playerSortMode: "point"` 뒤에 추가:

```js
  pushState: null,  // 밀어내기 모드 전용 상태 (pushMatch.js의 createInitialPushState로 초기화)
```

- [ ] **Step 2: RESTORE_STATE에 pushState 복원 추가**

`RESTORE_STATE` case 내에서, `if (s.earlyFinish != null)` 블록 뒤에 추가:

```js
      if (s.pushState != null) updates.pushState = s.pushState;
```

- [ ] **Step 3: START_MATCHES 액션에 pushState 초기화 추가**

`START_MATCHES` case의 반환 객체에 `pushState` 필드를 추가. `action.pushState`가 있으면 사용, 없으면 null:

```js
    case 'START_MATCHES': {
      const { schedule, pushState: initPushState } = action;
      return {
        ...state,
        schedule: schedule || [],
        currentRoundIdx: 0,
        completedMatches: [],
        allEvents: [],
        isExtraRound: false,
        viewingRoundIdx: 0,
        confirmedRounds: {},
        matchModal: null,
        phase: "match",
        pushState: initPushState || null,
      };
    }
```

- [ ] **Step 4: CONFIRM_PUSH_ROUND 액션 추가**

`FINISH_MATCH` case 뒤에 새 case 추가:

```js
    case 'CONFIRM_PUSH_ROUND': {
      const { matchResult, newPushState } = action;
      return {
        ...state,
        completedMatches: [...state.completedMatches, matchResult],
        gksHistory: { ...state.gksHistory, [state.completedMatches.length]: { ...state.gks } },
        gks: {},
        pushState: newPushState,
      };
    }
```

- [ ] **Step 5: gameState에 pushState 포함 (자동저장용)**

이 변경은 `App.jsx`에서 할 것이므로 여기서는 스킵. reducer 변경만 커밋.

- [ ] **Step 6: 커밋**

```bash
git add src/hooks/useGameReducer.js
git commit -m "feat: reducer에 pushState 및 CONFIRM_PUSH_ROUND 액션 추가"
```

---

### Task 3: PushMatchView 컴포넌트 — `src/components/game/PushMatchView.jsx`

**Files:**
- Create: `src/components/game/PushMatchView.jsx`

- [ ] **Step 1: PushMatchView 컴포넌트 작성**

```jsx
// src/components/game/PushMatchView.jsx
import { useState } from 'react';
import { TEAM_COLORS } from '../../config/constants';
import { useTheme } from '../../hooks/useTheme';
import { calcMatchScore } from '../../utils/scoring';
import { calcNextPushMatch } from '../../utils/pushMatch';
import CourtRecorder from './CourtRecorder';

export default function PushMatchView({
  teams, teamNames, teamColorIndices, gks, allEvents,
  onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent,
  onConfirmPushRound, completedMatches, attendees, onGkChange,
  pushState, styles: s,
}) {
  const { C } = useTheme();
  // 관리자가 대진을 변경할 수 있도록 로컬 상태로 관리
  const [currentMatch, setCurrentMatch] = useState(
    pushState?.suggestedMatch || { home: 0, away: 1 }
  );
  const [editingMatch, setEditingMatch] = useState(false);
  const [editSelection, setEditSelection] = useState({ home: null, away: null });

  // pushState가 변경되면 (경기 확정 후) 제안 대진으로 리셋
  // completedMatches.length를 키로 사용
  const [lastMatchCount, setLastMatchCount] = useState(completedMatches.length);
  if (completedMatches.length !== lastMatchCount) {
    setLastMatchCount(completedMatches.length);
    if (pushState?.suggestedMatch) {
      setCurrentMatch(pushState.suggestedMatch);
    }
  }

  const matchId = `P${completedMatches.length + 1}_C0`;
  const homeIdx = currentMatch.home;
  const awayIdx = currentMatch.away;

  const matchInfo = {
    homeIdx, awayIdx, matchId,
    homeTeam: teamNames[homeIdx], awayTeam: teamNames[awayIdx],
    homeGk: gks[homeIdx] || null, awayGk: gks[awayIdx] || null,
    homeColor: TEAM_COLORS[teamColorIndices[homeIdx]],
    awayColor: TEAM_COLORS[teamColorIndices[awayIdx]],
    homePlayers: teams[homeIdx],
    awayPlayers: teams[awayIdx],
  };

  const handleConfirmRound = () => {
    const evts = allEvents.filter(e => e.matchId === matchId);
    const homeScore = calcMatchScore(evts, matchId, matchInfo.homeTeam);
    const awayScore = calcMatchScore(evts, matchId, matchInfo.awayTeam);

    const result = {
      matchId, homeIdx, awayIdx,
      homeTeam: matchInfo.homeTeam, awayTeam: matchInfo.awayTeam,
      homeGk: gks[homeIdx] || "", awayGk: gks[awayIdx] || "",
      homeScore, awayScore,
      court: "", mercenaries: [], isExtra: false,
    };

    const msg = `${matchInfo.homeTeam} ${homeScore}:${awayScore} ${matchInfo.awayTeam}`;
    if (!confirm(msg + "\n\n경기결과를 확정하시겠습니까?")) return;

    const newPushState = calcNextPushMatch(
      pushState, { homeIdx, awayIdx, homeScore, awayScore },
      teams.length, teamNames
    );

    onConfirmPushRound(result, newPushState);
  };

  const handleStartEdit = () => {
    setEditSelection({ home: currentMatch.home, away: currentMatch.away });
    setEditingMatch(true);
  };

  const handleConfirmEdit = () => {
    if (editSelection.home === null || editSelection.away === null || editSelection.home === editSelection.away) return;
    setCurrentMatch({ home: editSelection.home, away: editSelection.away });
    setEditingMatch(false);
  };

  // 연승 정보
  const streakInfo = pushState?.winStreak;

  // 대진 변경 모달
  if (editingMatch) {
    return (
      <div>
        <div style={{ fontSize: 13, color: C.gray, marginBottom: 8 }}>대진 변경</div>
        <div style={s.card}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6, textAlign: "center" }}>홈팀</div>
              {teamNames.map((name, idx) => (
                <button key={idx} onClick={() => setEditSelection(prev => ({ ...prev, home: idx }))}
                  style={{ ...s.matchBtn(editSelection.home === idx ? TEAM_COLORS[teamColorIndices[idx]] : null), width: "100%", marginBottom: 4, opacity: editSelection.away === idx ? 0.3 : 1 }}>
                  {name}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", color: C.gray, fontSize: 18, fontWeight: 900 }}>VS</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6, textAlign: "center" }}>원정팀</div>
              {teamNames.map((name, idx) => (
                <button key={idx} onClick={() => setEditSelection(prev => ({ ...prev, away: idx }))}
                  style={{ ...s.matchBtn(editSelection.away === idx ? TEAM_COLORS[teamColorIndices[idx]] : null), width: "100%", marginBottom: 4, opacity: editSelection.home === idx ? 0.3 : 1 }}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => setEditingMatch(false)} style={s.btn(C.grayDark)}>취소</button>
            <button onClick={handleConfirmEdit}
              disabled={editSelection.home === null || editSelection.away === null || editSelection.home === editSelection.away}
              style={{ ...s.btnFull(C.green), flex: 1, opacity: (editSelection.home !== null && editSelection.away !== null && editSelection.home !== editSelection.away) ? 1 : 0.4 }}>
              확인
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* 상단: 팀별 출전횟수 대시보드 */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {teamNames.map((name, idx) => {
          const isPlaying = idx === homeIdx || idx === awayIdx;
          const isResting = pushState?.forcedRest === idx;
          const color = TEAM_COLORS[teamColorIndices[idx]];
          return (
            <div key={idx} style={{
              flex: 1, minWidth: 60, background: C.card, borderRadius: 8, padding: "6px 4px",
              textAlign: "center", borderTop: `3px solid ${color?.bg || C.accent}`,
              opacity: isPlaying ? 1 : 0.6,
              outline: isPlaying ? `2px solid ${color?.bg || C.accent}` : "none",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: color?.bg || C.white, marginBottom: 2 }}>
                {name}
              </div>
              <div style={{ fontSize: 10, color: C.gray }}>
                {pushState?.teamPlayCounts?.[idx] || 0}경기
              </div>
              <div style={{ fontSize: 10, color: C.gray }}>
                {pushState?.teamTotalGoals?.[idx] || 0}골
              </div>
              {isResting && (
                <div style={{ fontSize: 9, color: C.orange, fontWeight: 700, marginTop: 2 }}>휴식</div>
              )}
            </div>
          );
        })}
      </div>

      {/* 중단: 대진 + 연승 정보 */}
      <div style={{ ...s.card, marginBottom: 12, textAlign: "center" }}>
        <div style={{ fontSize: 12, color: C.gray, marginBottom: 4 }}>
          {completedMatches.length + 1}경기
          {streakInfo && (
            <span style={{ marginLeft: 8, color: C.orange, fontWeight: 700 }}>
              {teamNames[streakInfo.teamIdx]} {streakInfo.count}연승 중
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: TEAM_COLORS[teamColorIndices[homeIdx]]?.bg || C.white }}>
            {teamNames[homeIdx]}
          </span>
          <span style={{ fontSize: 14, color: C.gray, fontWeight: 900 }}>VS</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: TEAM_COLORS[teamColorIndices[awayIdx]]?.bg || C.white }}>
            {teamNames[awayIdx]}
          </span>
        </div>
        <button onClick={handleStartEdit} style={{ ...s.btnSm(C.grayDark, C.white), fontSize: 11 }}>
          대진 변경
        </button>
      </div>

      {/* 하단: 경기 기록 */}
      <CourtRecorder
        key={`push_${completedMatches.length}_${homeIdx}_${awayIdx}`}
        matchInfo={matchInfo}
        homePlayers={matchInfo.homePlayers}
        awayPlayers={matchInfo.awayPlayers}
        allEvents={allEvents}
        onRecordEvent={onRecordEvent}
        onUndoEvent={onUndoEvent}
        onDeleteEvent={onDeleteEvent}
        onEditEvent={onEditEvent}
        onFinish={() => {}}
        onGkChange={onGkChange}
        styles={s}
        courtLabel=""
        attendees={attendees}
      />

      {/* 경기 확정 버튼 */}
      <div style={{ marginTop: 12 }}>
        <button onClick={handleConfirmRound} style={{ ...s.btnFull(C.accent, C.bg) }}>
          경기 확정
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/game/PushMatchView.jsx
git commit -m "feat: PushMatchView 밀어내기 전용 컴포넌트 추가"
```

---

### Task 4: App.jsx 통합 — Setup, Match, Finalize 수정

**Files:**
- Modify: `src/App.jsx`

이 태스크에서 App.jsx의 여러 지점을 수정한다.

- [ ] **Step 1: import 추가**

파일 상단 import 섹션에 추가 (line 18 `FreeMatchView` import 뒤):

```js
import PushMatchView from './components/game/PushMatchView';
import { createInitialPushState } from './utils/pushMatch';
```

- [ ] **Step 2: state 구조분해에 pushState 추가**

`App.jsx` line 33 (기존 `playerSortMode` 뒤)에 `pushState`를 추가:

```js
    matchModal, matchModal_sortKey, playerSortMode, pushState,
```

기존:
```js
    matchModal, matchModal_sortKey, playerSortMode,
```

- [ ] **Step 3: gameState(자동저장)에 pushState 추가**

`App.jsx`의 `gameState` useMemo (line 192-200 근처)에서 `pushState`를 추가:

기존:
```js
    phase, teams, teamNames, teamColorIndices, gks, gksHistory, allEvents,
    completedMatches, schedule, currentRoundIdx, viewingRoundIdx, confirmedRounds, attendees,
    teamCount, courtCount, matchMode, isExtraRound, splitPhase, rotations, earlyFinish,
```

변경:
```js
    phase, teams, teamNames, teamColorIndices, gks, gksHistory, allEvents,
    completedMatches, schedule, currentRoundIdx, viewingRoundIdx, confirmedRounds, attendees,
    teamCount, courtCount, matchMode, isExtraRound, splitPhase, rotations, earlyFinish, pushState,
```

useMemo 의존성 배열에도 `pushState` 추가:

기존:
```js
  }), [phase, teams, teamNames, teamColorIndices, gks, gksHistory, allEvents, completedMatches, schedule, currentRoundIdx, viewingRoundIdx, confirmedRounds, attendees, teamCount, courtCount, matchMode, isExtraRound, splitPhase, rotations, earlyFinish, authUser, gameId]);
```

변경:
```js
  }), [phase, teams, teamNames, teamColorIndices, gks, gksHistory, allEvents, completedMatches, schedule, currentRoundIdx, viewingRoundIdx, confirmedRounds, attendees, teamCount, courtCount, matchMode, isExtraRound, splitPhase, rotations, earlyFinish, pushState, authUser, gameId]);
```

- [ ] **Step 4: autoSave useEffect 의존성에 pushState 추가**

기존 (line 226 근처):
```js
  }, [allEvents, completedMatches, currentRoundIdx, phase, gks]);
```

변경:
```js
  }, [allEvents, completedMatches, currentRoundIdx, phase, gks, pushState]);
```

- [ ] **Step 5: allRoundsComplete에 push 모드 추가**

기존 (line 272-280):
```js
  const allRoundsComplete = useMemo(() => {
    if (matchMode === "schedule" && schedule.length > 0) {
      const lastIdx = schedule.length - 1;
      return confirmedRounds[lastIdx] === true;
    }
    if (matchMode === "free") return phase === "summary";
    return false;
  }, [matchMode, schedule, confirmedRounds, phase]);
```

변경:
```js
  const allRoundsComplete = useMemo(() => {
    if (matchMode === "schedule" && schedule.length > 0) {
      const lastIdx = schedule.length - 1;
      return confirmedRounds[lastIdx] === true;
    }
    if (matchMode === "free" || matchMode === "push") return phase === "summary";
    return false;
  }, [matchMode, schedule, confirmedRounds, phase]);
```

- [ ] **Step 6: confirmPushRound 핸들러 추가**

`finishMatch` 함수 (line 339) 뒤에 추가:

```js
  const confirmPushRound = (matchResult, newPushState) => {
    dispatch({ type: 'CONFIRM_PUSH_ROUND', matchResult, newPushState });
  };
```

- [ ] **Step 7: startMatches에서 push 모드 처리**

기존 `startMatches` 함수 (line 388-399):
```js
  const startMatches = () => {
    if (teams.some(t => t.length < 1)) { alert("모든 팀에 최소 1명"); return; }
    let sched = null;
    if (matchMode === "schedule") {
      if (courtCount === 2) {
        if (teamCount === 4) sched = generate4Team2Court();
        else if (teamCount === 5) sched = generate5Team2Court();
        else if (teamCount === 6) { sched = generate6Team2Court().firstHalf; set('splitPhase', 'first'); }
      } else sched = generate1Court(teamCount, rotations);
    }
    dispatch({ type: 'START_MATCHES', schedule: sched });
  };
```

변경:
```js
  const startMatches = () => {
    if (teams.some(t => t.length < 1)) { alert("모든 팀에 최소 1명"); return; }
    let sched = null;
    let initPushState = null;
    if (matchMode === "schedule") {
      if (courtCount === 2) {
        if (teamCount === 4) sched = generate4Team2Court();
        else if (teamCount === 5) sched = generate5Team2Court();
        else if (teamCount === 6) { sched = generate6Team2Court().firstHalf; set('splitPhase', 'first'); }
      } else sched = generate1Court(teamCount, rotations);
    } else if (matchMode === "push") {
      initPushState = createInitialPushState(teamCount);
    }
    dispatch({ type: 'START_MATCHES', schedule: sched, pushState: initPushState });
  };
```

- [ ] **Step 8: Setup UI에 밀어내기 버튼 추가**

기존 경기 모드 선택 (line 570-574):
```jsx
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>경기 모드</div>
              <div style={s.row}>
                <button onClick={() => set('matchMode', 'schedule')} style={s.btn(matchMode === "schedule" ? C.accent : C.grayDark, matchMode === "schedule" ? C.bg : C.white)}>대진표</button>
                <button onClick={() => set('matchMode', 'free')} style={s.btn(matchMode === "free" ? C.accent : C.grayDark, matchMode === "free" ? C.bg : C.white)}>자유대진</button>
              </div>
            </div>
```

변경:
```jsx
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>경기 모드</div>
              <div style={s.row}>
                <button onClick={() => set('matchMode', 'schedule')} style={s.btn(matchMode === "schedule" ? C.accent : C.grayDark, matchMode === "schedule" ? C.bg : C.white)}>대진표</button>
                <button onClick={() => set('matchMode', 'free')} style={s.btn(matchMode === "free" ? C.accent : C.grayDark, matchMode === "free" ? C.bg : C.white)}>자유대진</button>
                <button onClick={() => { set('matchMode', 'push'); set('courtCount', 1); }} style={s.btn(matchMode === "push" ? C.accent : C.grayDark, matchMode === "push" ? C.bg : C.white)}>밀어내기</button>
              </div>
            </div>
```

- [ ] **Step 9: 밀어내기 모드일 때 구장 수 선택 비활성화**

기존 구장 수 선택 (line 565-568):
```jsx
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>구장 수</div>
              <div style={s.row}>{[1, 2].map(n => <button key={n} onClick={() => set('courtCount', n)} style={s.btn(courtCount === n ? C.accent : C.grayDark, courtCount === n ? C.bg : C.white)}>{n}코트</button>)}</div>
            </div>
```

변경:
```jsx
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>구장 수</div>
              <div style={s.row}>{[1, 2].map(n => <button key={n} onClick={() => { if (matchMode !== "push") set('courtCount', n); }} disabled={matchMode === "push"} style={{ ...s.btn(courtCount === n ? C.accent : C.grayDark, courtCount === n ? C.bg : C.white), opacity: matchMode === "push" && n !== 1 ? 0.3 : 1 }}>{n}코트</button>)}</div>
            </div>
```

- [ ] **Step 10: Match phase 헤더 subtitle에 push 모드 표시**

기존 (line 758):
```js
            <div style={s.subtitle}>{matchMode === "schedule" ? `${allRoundsComplete ? "전체 라운드 완료" : `라운드 ${currentRoundIdx + 1}/${schedule.length}`}` : `자유대전 · ${completedMatches.length}매치`}</div>
```

변경:
```js
            <div style={s.subtitle}>{matchMode === "schedule" ? `${allRoundsComplete ? "전체 라운드 완료" : `라운드 ${currentRoundIdx + 1}/${schedule.length}`}` : matchMode === "push" ? `밀어내기 · ${completedMatches.length}경기` : `자유대전 · ${completedMatches.length}매치`}</div>
```

- [ ] **Step 11: Match phase 헤더에 경기마감 버튼 push 모드 지원**

기존 (line 770-771):
```jsx
            {(allRoundsComplete || matchMode === "free") && (
              <button onClick={() => set('phase', 'summary')} style={{ ...s.btnSm(C.green, C.bg), fontSize: 11, fontWeight: 700 }}>경기마감</button>
            )}
```

변경:
```jsx
            {(allRoundsComplete || matchMode === "free" || matchMode === "push") && (
              <button onClick={() => set('phase', 'summary')} style={{ ...s.btnSm(C.green, C.bg), fontSize: 11, fontWeight: 700 }}>경기마감</button>
            )}
```

단, push 모드에서는 최소 1경기 이상 진행해야 경기마감이 가능하도록:

변경 (최종):
```jsx
            {(allRoundsComplete || matchMode === "free" || (matchMode === "push" && completedMatches.length > 0)) && (
              <button onClick={() => set('phase', 'summary')} style={{ ...s.btnSm(C.green, C.bg), fontSize: 11, fontWeight: 700 }}>경기마감</button>
            )}
```

- [ ] **Step 12: Match phase 본문에 PushMatchView 렌더링**

기존 (line 853-868):
```jsx
        <div style={s.section}>
          {matchMode === "schedule" && schedule.length > 0 && !isExtraRound ? (
            <ScheduleMatchView schedule={schedule} currentRoundIdx={currentRoundIdx}
              viewingRoundIdx={viewingRoundIdx} setViewingRoundIdx={(v) => set('viewingRoundIdx', v)}
              confirmedRounds={confirmedRounds} onConfirmRound={confirmRound}
              teams={teams} teamNames={teamNames} teamColorIndices={teamColorIndices} gks={gks} gksHistory={gksHistory || {}}
              courtCount={courtCount} allEvents={allEvents} onRecordEvent={recordMatchEvent}
              onUndoEvent={undoMatchEvent} onDeleteEvent={deleteEvent} onEditEvent={editEvent}
              completedMatches={completedMatches} attendees={attendees} onGkChange={handleGkChange} splitPhase={splitPhase} styles={s} />
          ) : (
            <FreeMatchView teams={teams} teamNames={teamNames} teamColorIndices={teamColorIndices} gks={gks}
              courtCount={courtCount} allEvents={allEvents} onRecordEvent={recordMatchEvent}
              onUndoEvent={undoMatchEvent} onDeleteEvent={deleteEvent} onEditEvent={editEvent}
              onFinishMatch={finishMatch} completedMatches={completedMatches}
              attendees={attendees} onGkChange={handleGkChange} styles={s} isExtraRound={isExtraRound} />
          )}
        </div>
```

변경:
```jsx
        <div style={s.section}>
          {matchMode === "push" ? (
            <PushMatchView teams={teams} teamNames={teamNames} teamColorIndices={teamColorIndices} gks={gks}
              allEvents={allEvents} onRecordEvent={recordMatchEvent}
              onUndoEvent={undoMatchEvent} onDeleteEvent={deleteEvent} onEditEvent={editEvent}
              onConfirmPushRound={confirmPushRound} completedMatches={completedMatches}
              attendees={attendees} onGkChange={handleGkChange} pushState={pushState} styles={s} />
          ) : matchMode === "schedule" && schedule.length > 0 && !isExtraRound ? (
            <ScheduleMatchView schedule={schedule} currentRoundIdx={currentRoundIdx}
              viewingRoundIdx={viewingRoundIdx} setViewingRoundIdx={(v) => set('viewingRoundIdx', v)}
              confirmedRounds={confirmedRounds} onConfirmRound={confirmRound}
              teams={teams} teamNames={teamNames} teamColorIndices={teamColorIndices} gks={gks} gksHistory={gksHistory || {}}
              courtCount={courtCount} allEvents={allEvents} onRecordEvent={recordMatchEvent}
              onUndoEvent={undoMatchEvent} onDeleteEvent={deleteEvent} onEditEvent={editEvent}
              completedMatches={completedMatches} attendees={attendees} onGkChange={handleGkChange} splitPhase={splitPhase} styles={s} />
          ) : (
            <FreeMatchView teams={teams} teamNames={teamNames} teamColorIndices={teamColorIndices} gks={gks}
              courtCount={courtCount} allEvents={allEvents} onRecordEvent={recordMatchEvent}
              onUndoEvent={undoMatchEvent} onDeleteEvent={deleteEvent} onEditEvent={editEvent}
              onFinishMatch={finishMatch} completedMatches={completedMatches}
              attendees={attendees} onGkChange={handleGkChange} styles={s} isExtraRound={isExtraRound} />
          )}
        </div>
```

- [ ] **Step 13: formatMatchId에 Push 패턴 추가**

기존 `formatMatchId` (line 479-484):
```js
    const formatMatchId = (mid) => {
      const p = mid?.match(/^R(\d+)_C(\d+)$/);
      if (!p) return mid || "";
      const court = courtCount === 2 ? (p[2] === "0" ? "A구장" : "B구장") : `매치${+p[2]+1}`;
      return `${p[1]}라운드 ${court}`;
    };
```

변경:
```js
    const formatMatchId = (mid) => {
      const pPush = mid?.match(/^P(\d+)_C0$/);
      if (pPush) return `${pPush[1]}경기`;
      const pFree = mid?.match(/^F(\d+)_C(\d+)$/);
      if (pFree) {
        const court = courtCount === 2 ? (pFree[2] === "0" ? "A구장" : "B구장") : "";
        return `${pFree[1]}경기${court ? " " + court : ""}`;
      }
      const p = mid?.match(/^R(\d+)_C(\d+)$/);
      if (!p) return mid || "";
      const court = courtCount === 2 ? (p[2] === "0" ? "A구장" : "B구장") : `매치${+p[2]+1}`;
      return `${p[1]}라운드 ${court}`;
    };
```

- [ ] **Step 14: 경기방식 모달(gameFormat)에 밀어내기 설명 추가**

기존 (line 830):
```js
                <div>{teamCount}팀 · {courtCount}코트 · {matchMode === "schedule" ? "대진표" : "자유대진"}{matchMode === "schedule" && courtCount === 1 ? ` · ${rotations}회전` : ""}</div>
```

변경:
```js
                <div>{teamCount}팀 · {courtCount}코트 · {matchMode === "schedule" ? "대진표" : matchMode === "push" ? "밀어내기" : "자유대진"}{matchMode === "schedule" && courtCount === 1 ? ` · ${rotations}회전` : ""}</div>
```

기존 (line 836):
```js
                  {matchMode === "free" && "매 라운드 직접 대진 선택"}
```

변경:
```js
                  {matchMode === "free" && "매 라운드 직접 대진 선택"}
                  {matchMode === "push" && "승리팀 잔류, 패배팀 교체 · 2골 이상 승리 시 연장 · 3연승 후 휴식"}
```

- [ ] **Step 15: 커밋**

```bash
git add src/App.jsx src/components/game/PushMatchView.jsx src/utils/pushMatch.js src/hooks/useGameReducer.js
git commit -m "feat: 밀어내기 대전 모드 통합 — setup/match/finalize"
```

---

### Task 5: 빌드 검증 및 수동 테스트

**Files:** (변경 없음)

- [ ] **Step 1: 빌드 성공 확인**

```bash
cd /Users/rh/Desktop/python_dev/footsal_webapp && npm run build
```

Expected: 에러 없이 빌드 완료

- [ ] **Step 2: 수동 테스트 시나리오**

로컬에서 `npm run dev`로 실행 후 다음을 확인:

1. Setup에서 "밀어내기" 버튼 클릭 → 구장 수 1코트 고정 확인
2. 4팀 선택 → 참석자 선택 → 팀 편성 → 경기 시작
3. 출전횟수 대시보드에 모든 팀 표시 확인
4. 첫 경기: 1번팀 vs 2번팀 자동 제안 확인
5. 대진 변경 버튼으로 팀 변경 가능 확인
6. 골 기록 후 경기 확정 → 다음 대진 자동 제안 확인
7. 2골 이상 승리 → 승리팀 잔류 확인
8. 1:0 또는 무승부 → 두 팀 다 교체 확인
9. 3연승 → 강제 휴식 확인
10. 게임 마감 → 순위/크로바/고구마 정상 계산 확인
11. 시트 기록 시 matchId "1경기", "2경기" 형식 확인

- [ ] **Step 3: 문제 있으면 수정 후 커밋**

```bash
git add -A
git commit -m "fix: 밀어내기 모드 수정사항"
```
