# 축구 라인업 변경 — 포메이션 피치 편집기 재설계

**작성일:** 2026-07-01
**상태:** 승인됨(설계) — 구현 대기

## 배경 / 문제

직전에 배포한 **라인업 변경**(선발 오기입 정정) 기능은 `🔁 라인업 변경` 버튼 →
`LineupCorrectionModal`(출전/미출전 선수 **버튼 리스트** 2-step: 잘못 기록된 출전 b 탭 →
실제 뛴 미출전 a 탭 → 확인)로 동작한다.

사용자는 이 버튼-리스트 모달 UX를 거부하고, **경기 생성 시 쓰는 포지션 지정 화면
(FormationSetup)의 피치 인터랙션을 재사용**해 달라고 요청했다:

> "라인업변경 버튼 누르면 이 포메이션 화면에서, 변경할 사람을 바꾸는 거야.
>  자리를 바꾸든, 후보랑 바꾸든."

즉 라인업 변경 = **피치에서 직접 편집**: 출전 선수끼리 **자리 바꾸기**, 또는 출전 선수를
**후보(미출전)와 바꾸기**.

## 목표

`🔁 라인업 변경`을 버튼 모달이 아니라 **전체화면 포메이션 피치 편집기**로 바꾼다.
피치에서 두 가지 편집을 직접 수행하고, 각 편집은 즉시 그 경기에 반영된다. 기존
`LineupCorrectionModal`은 폐기한다.

## 핵심 의미 결정 (사용자 확정)

피치에서 **출전 선수 ↔ 미출전(후보) 선수**를 바꾸는 것은 **정정(correction)**이다:

- 바뀌어 나가는 출전 선수 = **실제로 안 뛴 것**(→ 미출전/subs).
- 후보에서 들어오는 선수 = **실제로 뛴 것**.
- 나가는 선수의 골·어시 등 이벤트는 **들어오는 선수로 이관**한다.
- **sub(교체) 이벤트는 남기지 않는다** (둘 다 뛴 게 아니므로).

이는 기존 `CORRECT_SOCCER_LINEUP` 리듀서의 의미와 정확히 같으므로 **그대로 재사용**한다.
(진짜 교체 = 둘 다 뜀은 진행중 레코더의 기존 `교체` 기능이 담당한다. 이 편집기의 범위 아님.)

## 아키텍처

### 두 편집 연산 → 기존/신규 리듀서 op에 1:1 매핑

| 피치 동작 | 의미 | 리듀서 op | 이벤트 |
|---|---|---|---|
| 출전 A 탭 → 출전 B 탭 | **자리 바꾸기**(위치 교대) | `SWAP_SOCCER_LINEUP_POSITIONS` (신규) | 없음 (GK 관여 시 `gkChange` 배경만) |
| 출전 A 탭 → 미출전 C 탭 | **후보랑 바꾸기**(정정) | `CORRECT_SOCCER_LINEUP` (기존, 재사용) | 없음, A의 이벤트→C 이관 |

각 동작이 **리듀서 op 하나에 1:1** 매핑되므로:
- 여러 명 동시 변경 시 이벤트 짝짓기 모호성 **없음**(전체 rebuild+diff 방식의 함정 회피).
- 실제 sub 이력을 **건드리지 않음**(각 op는 외과적).
- 검증·테스트된 `CORRECT_SOCCER_LINEUP`을 **그대로 재사용**.

### 컴포넌트: `LineupEditView` (신규, 전체화면)

`FormationSetup`의 레이아웃(제목 + ←완료, `FormationPitch`, 후보 칩, 안내 문구)을 본떠
**편집 모드**로 만든 신규 컴포넌트. `FormationSetup` 자체는 "빈 상태에서 11명 배치 후
확정" 흐름이라 그대로 쓰기 부적합 → 재사용 대상은 **`FormationPitch`(탭 UI)** 와
칩/레이아웃 패턴이다.

**Props:**
```
{
  formation,        // 그 경기의 포메이션 키 (예: "4-4-2")
  assignments,      // slotIdx → name (현재 배치)
  bench,            // string[] 미출전(후보) 선수
  onSwapPositions,  // (aIdx, bIdx) => void   위치 교대
  onCorrect,        // (out, in) => void       정정(후보 교체)
  onBack,           // () => void              ←완료
}
```
부모(`SoccerMatchView`)는 매 렌더마다 `soccerMatches.find(m => m.matchIdx === lineupEditIdx)`
→ `reconstructFormation`으로 위 props를 다시 만들어 내려준다. 각 dispatch 후
`soccerMatches`가 갱신되면 편집기는 **최신 배치로 재렌더**된다(스냅샷 아님).

**로컬 상태:** `anchor` = 선택된 **출전 슬롯** `{ idx, name }` 또는 `null`.

**인터랙션 FSM** (`FormationPitch`의 `onPlayerTap(idx, name)` / 후보 칩 `onClick(name)`):
- 피치 출전 선수 탭:
  - `anchor === null` → 그 선수를 anchor로 선택(하이라이트).
  - `anchor.idx === idx` → 선택 해제.
  - 다른 출전 슬롯 → `onSwapPositions(anchor.idx, idx)` 위치 교대, anchor 해제.
- 후보 칩 탭:
  - `anchor === null` → 무시(안내 문구 "먼저 바꿀 출전 선수를 탭하세요").
  - anchor 있음 → confirm 후 `onCorrect(anchor.name, C)`, anchor 해제. **confirm 문구는
    anchor(A)의 이관 대상 이벤트(goal/assist/owngoal에 A가 등장) 유무로 분기:**
    - 있으면: `"{A} → {C} 정정: {A}의 골·어시 기록이 {C}로 이관됩니다. 계속?"`
    - 없으면: `"{A} → {C} 정정: {A}를 미출전 처리하고 {C}를 출전으로 바꿉니다. 계속?"`
    - (참고: 이 confirm은 **정정 전용**. 진행중 레코더의 정식 교체(sub)는 기록 이관이 없어 미표시.)
- 하이라이트: `FormationPitch highlightIdx={anchor?.idx}`.
- 후보 칩은 `anchor` 있을 때 활성(강조), 없을 때 흐리게 + 안내.
- `anchor` 있는데 `bench`가 비었으면(모두 출전/교체됨) "미출전 선수 없음 — 자리 교대만 가능"
  안내(정정 경로가 왜 비활성인지 명시). `onBack`은 anchor가 있어도 그냥 닫음(별도 확인 프롬프트 없음).

### 신규 리듀서: `SWAP_SOCCER_LINEUP_POSITIONS`

과거/임의 경기의 두 출전 슬롯을 교대. 진행중 레코더의 `handleSwap`은 `currentMatchIdx`
전용이라 과거 경기용 경로가 없으므로 신규가 필요하다. **논리 matchIdx로 매칭**(격리).

**전제(중요):** 편집기 진입 시 레거시 경기는 이미 modern으로 승격됨(아래 "SoccerMatchView 변경"의
formation 승격 참조) → 리듀서 도달 시 `m.formation`/`m.assignments`/`m.positionMap` 존재를 가정.
승격이 없으면 `m.assignments`가 null이라 `swapFormationSlots`가 슬롯 null 가드로 **조용히 no-op**
되어 교대가 유실된다(피치는 재구성된 fabricated 배치를 보여주므로 사용자는 실패를 알 수 없음).
그래도 `swapFormationSlots` 자체 가드는 방어로 유지.

```
action: { type, matchIdx, aIdx, bIdx }   // gkChange id/ts는 리듀서 내부 생성(액션에 안 실음)

reducer:
  m 찾기 (m.matchIdx === matchIdx)
  positions = FORMATIONS[m.formation]?.positions
  res = swapFormationSlots({ assignments: m.assignments, positionMap: m.positionMap,
                             gk: m.gk, positions }, aIdx, bIdx)   // 순수 헬퍼 재사용
  // 교대로 역할(DF↔MF/GK 등)이 바뀔 수 있으므로 defenders를 positionMap에서 재계산.
  //  getCleanSheetPlayers가 match.defenders를 직접 쓰므로(soccerScoring:92) 미갱신 시 클린시트 오귀속.
  defenders = Object.entries(res.positionMap).filter(([, r]) => r === "DF").map(([n]) => n)
  next = { ...m, assignments: res.assignments, positionMap: res.positionMap,
           gk: res.gk, defenders }
  if (res.gk !== m.gk):
    // GK가 바뀌면 무실점 경기도 두 GK를 집계(keeperGames/클린시트)에서 알 수 있게
    // 배경 gkChange 이벤트 추가 (라이브 handleSwap과 동일). 실점 귀속은 opponentGoal.currentGk.
    next.events = [...(m.events||[]), { type:"gkChange", playerOut:m.gk, playerIn:res.gk,
                                        id: generateEventId(), timestamp: Date.now() }]
  return 그 경기만 교체한 soccerMatches
```

- `swapFormationSlots`는 순수 헬퍼(기존) → 그대로 재사용.
- 스코어 재계산 불필요(교대는 골 이벤트 무변경, gkChange는 스코어 무관).
- gkChange의 id/timestamp는 **리듀서 내부**에서 `generateEventId()`/`Date.now()`로 생성
  (액션 최소화). `useGameReducer`에 `generateEventId` import 추가.
- defenders 재계산은 이 신규 SWAP 리듀서와 **라이브 `handleSwap` 양쪽 모두** 수행(아래
  "라이브 위치교대 defenders 수정" 참조) — 위치교대의 defenders 미갱신 갭을 한 번에 정정.

### 데이터 흐름 (SoccerApp 배선)

```
swapSoccerLineupPositions(matchIdx, aIdx, bIdx):
  dispatch({ type:'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx, aIdx, bIdx })
// correctSoccerLineup 은 기존 그대로 재사용
```
`SoccerMatchView`에 `onSwapLineupPositions` prop 추가 전달(기존 `onCorrectLineup` 옆).

### `SoccerMatchView` 변경

- `import LineupCorrectionModal` 및 관련 렌더 **삭제**. `lineupModalIdx` → `lineupEditIdx`로 대체.
- **`correctionSeq` 완전 제거**: 편집기는 전체화면 조기반환이라 진입 시 `FormationRecorder`가
  언마운트되고, ←완료 복귀 시 새로 마운트되며 `reconstructFormation`(편집 반영분)으로 자연히
  재시드된다. 강제 remount용 `correctionSeq` state/키 접미사(`matchIdx + '-' + correctionSeq`)는
  불필요 → 삭제(단순화). (모달 시절엔 레코더가 뒤에 계속 마운트돼 있어 강제 remount가 필요했음.)
  `FormationRecorder key`는 `currentMatch.matchIdx`로 단순화.
- `openLineupModal` → `openLineupEditor` (Critical/Important 반영):
  ```
  const openLineupEditor = () => {
    if (!node) return;
    if (navLocked) return;                        // ★B: goalFlow 입력 중 진입 차단
    if (gameFinalized && !confirm("…재전송…")) return;   // 기존 가드 유지
    if (!(node.formation && node.assignments && node.positionMap))  // ★A: 레거시 승격
      onUpdateMatchFormation?.(node.matchIdx, reconstructFormation(node));
    setLineupEditIdx(node.matchIdx);
  };
  ```
  - **★A 레거시 승격**: 레거시 경기(`formation/assignments/positionMap` null)는 `SWAP` 리듀서가
    raw `m.assignments`(null)을 읽어 no-op 되므로, 진입 시 `handleReopenMatch`(:147-149)와 동일하게
    `UPDATE_SOCCER_MATCH_FORMATION(reconstructFormation)`으로 modern 승격 후 연다.
    (dispatch + `setLineupEditIdx`는 같은 핸들러 → React 18 배치 → 다음 렌더에 승격분을 읽음.)
  - **★B navLocked 가드**: 전체화면 편집기는 레코더를 언마운트하므로 goalFlow(2탭 골입력, 레코더
    로컬 state) 활성 중 진입하면 골 유실. `navLocked`(=`onFlowActiveChange`) 중 진입 차단 +
    `🔁 라인업 변경` 버튼도 `navLocked` 시 `disabled`. (상대팀 변경은 오버레이라 무관 — 그대로.)
- **전체화면 편집기 조기 반환**(formation/editRoster 서브플로우와 동일하게 `return (<div>)` **이전**
  위치 — RoundNav/노드/레코더와 동시 렌더 금지): `lineupEditIdx !== null`이면
  `soccerMatches.find(m => m.matchIdx === lineupEditIdx)`로 찾아 `reconstructFormation` →
  `<LineupEditView>` 렌더. 미발견 시 안전 반환(`setLineupEditIdx(null)`).
  ```
  onSwapPositions={(aIdx,bIdx) => onSwapLineupPositions?.(m.matchIdx, aIdx, bIdx)}
  onCorrect={(out,inn) => onCorrectLineup?.(m.matchIdx, out, inn)}
  onBack={() => setLineupEditIdx(null)}
  ```
- 편집기 props는 매 렌더 `reconstructFormation(m)` + 아래 계산에서 파생:
  - `assignments = fm.assignments`, `formation = fm.formation`.
  - **★B `bench = fm.subs.filter(n => !played.includes(n))`** — 여기서
    `played = [...new Set([...(m.lineup||[]), ...(m.events||[]).filter(e=>e.type==="sub").map(e=>e.playerIn)])]`.
    **`fm.subs`를 그대로 넘기면 안 됨** — `reconstructFormation`의 `curSubs`는 교체로 빠진(뛴)
    선수도 포함(:107)하므로, 그 선수를 정정 대상(in)으로 고르면 `CORRECT_SOCCER_LINEUP`이
    `lineup`에 중복(:935)을 만들어 데이터가 깨진다. 기존 과거경기 요약의 `benchNeverPlayed`
    계산(SoccerMatchView 현행 :278-282)과 **동일**하게 재사용한다.

### 라이브 위치교대 defenders 수정 (동반 수정, 사용자 요청)

진행중 레코더의 위치교대 `FormationRecorder.handleSwap`(:135-154)도 `swapFormationSlots` 후
`onStateChange({ formation, assignments, positionMap, gk })`로 전파하는데, **`defenders`를 빼먹어**
DF↔MF/GK 교대 시 `match.defenders`가 스테일 → getCleanSheetPlayers 오귀속(신규 SWAP과 동일 갭).

수정:
- `handleSwap`에서 `defenders = Object.entries(res.positionMap).filter(([,r])=>r==="DF").map(([n])=>n)`
  계산해 `onStateChange({ formation, assignments, positionMap, gk, defenders })`로 함께 전달.
- `UPDATE_SOCCER_MATCH_FORMATION` 화이트리스트에 `"defenders"` 추가(:913). **안전:** 루프가
  `patch[k] !== undefined`일 때만 적용하므로, defenders를 안 넘기는 기존 호출부
  (`handleSubIn`/`handleFormationChange`/reconstructFormation 승격)는 무영향.
- 테스트: GK/DF 슬롯 관여 위치교대 후 UPDATE_SOCCER_MATCH_FORMATION에 defenders가 반영되는지.

## 삭제 대상

- `src/components/game/LineupCorrectionModal.jsx`
- `src/components/game/__tests__/LineupCorrectionModal.test.jsx`

## 범위 밖 (YAGNI)

- **포메이션(4-4-2 등) 자체 변경**: 편집기에서 formation picker 없음. 자리 교대·후보 교체만.
- **진짜 교체(sub, 둘 다 뜀)**: 진행중 레코더의 기존 교체 기능이 담당.
- **레드카드로 생긴 빈 슬롯**: 편집기는 빈 슬롯 탭 무시(희귀 케이스, 별도 처리 안 함).
- **여러 정정 한 번에 확정(rebuild+diff)**: 채택 안 함(이벤트 짝짓기 모호). 동작별 즉시 반영.

## 불변식 / 안전 (유지)

- 두 리듀서 op 모두 **논리 matchIdx 매칭** → 타 경기 데이터 무변경(격리).
- `CORRECT_SOCCER_LINEUP`은 `defenders`까지 치환(getCleanSheetPlayers가 직접 사용) — 재사용이므로 보존됨.
- `SWAP_SOCCER_LINEUP_POSITIONS`는 **defenders를 positionMap에서 재계산**(클린시트 정합) +
  GK 교대 시 `gkChange` 배경 이벤트로 keeper 집계 정합 유지.
- 레거시 경기는 **편집기 진입 시 modern 승격** → SWAP no-op 방지(raw assignments null 회피).
- goalFlow 활성(`navLocked`) 중엔 편집기 진입 차단 → 레코더 언마운트로 인한 골 유실 방지.
- `bench`(정정 후보)는 **뛴(교체 out) 선수 제외** → CORRECT의 lineup 중복 방지.
- `gkChange`는 타임라인/시트 미표시(기존 필터 유지: soccerScoring:187, remap:243).
- 풋살 모드 무영향(축구 전용 경로).
- `gameFinalized` 경기 편집 시 재전송 안내 confirm(기존).

## 테스트 전략

기존 하네스(vitest + jsdom, `react-dom/server` SSR 스모크, RTL 없음)를 따른다.

**리듀서 (`useGameReducer` 테스트):**
- `SWAP_SOCCER_LINEUP_POSITIONS`: 두 필드 선수 슬롯 교대 → assignments/positionMap 반영, 타 경기 무변경.
- GK 슬롯 관여 교대 → `gk` 갱신 + `gkChange` 이벤트 1건 추가(playerOut/playerIn 정확).
- 非GK 교대 → `gkChange` 미추가, events 길이 불변.
- **DF↔MF 교대 → `defenders`가 positionMap 반영(새 DF만 포함, 이전 DF 빠짐)** → getCleanSheetPlayers 정합.
- `m.formation` 없음/`aIdx===bIdx` → no-op(안전, 방어).
- 논리 matchIdx: 배열 index와 다른 경기에도 정확 매칭, 인접 경기 격리.
- (회귀) `CORRECT_SOCCER_LINEUP` 기존 테스트 유지 — 재사용 확인.

**통합 (SoccerMatchView 진입 로직):**
- 레거시 경기(formation null) 진입 → `UPDATE_SOCCER_MATCH_FORMATION` 승격 dispatch 발생(SWAP 정상화 전제).
- `navLocked=true`일 때 `openLineupEditor` no-op(진입 차단) + 버튼 disabled.
- `bench` 계산: 교체로 빠진(뛴) 선수가 정정 후보에서 제외됨(중복 방지 회귀).

**컴포넌트 (`LineupEditView` SSR 스모크):**
- ThemeProvider로 렌더 시 throw 없음(피치 + 후보 칩 마운트). — SSR 한계상 탭 인터랙션·confirm은 수동 QA.

**통합:**
- `SoccerMatchView`에서 `LineupCorrectionModal` import/렌더 제거 후에도 렌더 스모크 통과.

## 성공 기준

- `🔁 라인업 변경` → 버튼 리스트가 아니라 포메이션 피치 편집기 등장.
- 출전끼리 탭-탭 → 자리 교대(이벤트 무변경, GK면 gkChange).
- 출전 탭 → 후보 탭 → confirm → 정정(나간 선수 미출전, 기록 이관, sub 이벤트 없음).
- 과거·진행중 경기 모두 동작. 타 경기 데이터 불변. 풋살 무영향.
- 전체 테스트 통과.
