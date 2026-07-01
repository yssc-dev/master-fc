# 축구 라인업 정정 + 교체 삭제 되돌리기 + 카드 버튼 설계

- 날짜: 2026-07-01
- 대상: `src/hooks/useGameReducer.js`, `src/components/game/SoccerMatchView.jsx`, `src/components/game/FormationRecorder.jsx`, `src/components/game/PlayerActionMenu.jsx`, 신규 `LineupCorrectionModal`
- 상태: 설계(구현 전). 브레인스토밍 승인 대기.

## 배경 / 문제

축구 기록에서 발견된 갭(현재 로직 점검 결과):

**정상 동작(무변경):**
- 선발 11 선택 → `출전`, 나머지 → `후보/미출전` (FormationSetup, 경기 생성 시).
- 골/어시는 **출전(피치) 선수만** — `handlePlayerTap`이 피치 탭으로만 발생, 벤치는 탭 불가(구조적 보장).
- 교체: 후보↔출전(`handleSubIn`, sub 이벤트) + 출전↔출전(`handleSwap`, 위치교대).

**갭:**
- **G1 — 교체(sub) 이벤트 삭제 시 배치 미복구:** `DELETE_SOCCER_EVENT`(reducer)는 이벤트만 filter, `assignments`/`subs`/`gk`를 되돌리지 않음. → 교체 후 이벤트를 지우면 피치엔 남고 로그엔 안 잡히는 orphan 발생(장주성 케이스의 원인).
- **G2 — 선발 오기입 정정 수단 없음:** `lineup`은 생성 후 불변(`UPDATE_SOCCER_MATCH_FORMATION` 화이트리스트에 없음). "b를 선발로 잘못 넣었는데 실제로 a가 뛰었다"를 고치려면 교체밖에 없고, 그건 가짜 sub 이벤트를 남김. 팩트는 **a=출전, b=미출전**(둘 다 뛴 게 아님).
- **G3 — 옐로/퇴장 버튼이 과대:** `PlayerActionMenu`가 6버튼 균등 그리드. 옐로·레드는 거의 안 씀.

## 목표

1. **라인업 정정(G2):** 선발 오기입을 교체가 아닌 로스터 정정으로 고친다(sub 이벤트 없음, b의 이벤트는 a로 이관).
2. **교체 삭제 되돌리기(G1):** sub 이벤트 삭제 시 그 교체를 되돌린다(orphan 재발 방지).
3. **카드 버튼 축소(G3).**
4. 위 정합으로 `출전(=lineup∪교체투입)`·통계가 배치와 일치 유지. 장주성 케이스는 라인업 정정으로 해결.

## 비목표

- 풋살 모드 일체.
- 이미 마감(시트 전송)된 경기의 시트 소급(로그_선수경기는 재전송으로).
- 경기 스쿼드에 아예 없던 선수(attendee 아님)를 정정 대상 a로 투입(스쿼드 편집은 범위 밖).
- redCard/yellowCard 이벤트 삭제 시 복구(이번엔 sub만; 필요 시 후속).

---

## 설계 ① — 라인업 정정 (G2)

### UI
- 매치 노드(진행중·과거, 휴식/새경기 제외)의 **`상대팀 변경` 버튼 옆에 `🔁 라인업 변경` 버튼**. 표시 조건은 `canChangeOpponent`와 동일(opponent 있는 매치 노드).
- 클릭 → 신규 `LineupCorrectionModal`:
  - **출전** 목록 = 그 경기에 뛴 걸로 기록된 선수 = `lineup ∪ 교체투입(sub playerIn)`.
  - **미출전** 목록 = 스쿼드 중 안 뛴 선수 = `(경기 attendees) − 출전`. (경기 attendees = 생성 시 `lineup ∪ subs`.)
  - 흐름: 출전 `b` 탭 → "이 자리에 실제로 뛴 선수" → 미출전 `a` 선택 → 확인 → 정정 dispatch.
  - "교체와 다름: b는 안 뛴 걸로, a가 뛴 걸로 기록을 정정합니다(이벤트도 a로 이관)" 안내 문구.
  - **마감 후 가드(B-I2):** `gameFinalized`면 상대팀 변경과 동일한 confirm("이미 시트 전송됨 — 최종집계의 '수정 후 재전송' 필요") 후 진행.
  - **버튼 스타일은 FormationRecorder sub 모달과 동일 패턴 — 별도 추상화 불필요(간결 유지).**
- **진행중 노드 반영(B-Crit/C-Imp):** `FormationRecorder`는 uncontrolled(key remount로만 재시드). 진행중 경기 정정 후 레코더가 stale하면 **이후 골이 정정 전 이름(b)으로 기록**돼 2차 오염. → `SoccerMatchView`에 `correctionSeq` 상태를 두고 진행중 노드 `key={currentMatch.matchIdx + '-' + correctionSeq}`, 정정 dispatch 성공 후 `setCorrectionSeq(s=>s+1)`로 **강제 remount**(정정 결과 재시드).

### 리듀서 신규 액션 `CORRECT_SOCCER_LINEUP { matchIdx, out, in }`
- **매치 식별: 논리 `m.matchIdx === matchIdx`**(SET_SOCCER_MATCH_OPPONENT과 동일, 배열 index 아님 — A-4). 모달은 `node.matchIdx` 전달.
- `out`(b, 잘못 기록) → `in`(a, 실제 뛴 선수)로 매치 전체에서 b를 a로 치환하고 b를 벤치로:

1. `lineup`: `map(n => n === b ? a : n)`.
2. **`defenders`: `map(n => n === b ? a : n)`** ← **누락 금지(A-1/E-I-1: getCleanSheetPlayers·레거시 reconstructFormation이 defenders를 직접 사용).**
3. `assignments`: 값이 b인 슬롯 → a.
4. `positionMap`: `delete [b]`; **role 가드 — `newPositionMap[a] = positionMap[b] ?? positionMap[a]`**(B-I1: orphan 케이스처럼 b의 role이 이미 없으면 a의 기존 role 보존, undefined 덮어쓰기 금지).
5. `gk`: `gk === b`면 → a.
6. `subs`(벤치): a 제거(있으면), b 추가(없으면).
7. **events 이관:** 순수 헬퍼 **`remapPlayerInSoccerEvents(events, b, a)`**(C-Minor: utils로 분리, 단위테스트 — 필드 누락=데이터 손상) — `goal.player`/`goal.assist`, `owngoal.player`, `opponentGoal.currentGk`, `sub.playerIn`/`sub.playerOut`, `redCard.player`/`yellowCard.player`, `gkChange.playerOut`/`gkChange.playerIn`.
8. **sub 이벤트 신규 생성 없음.** score 불변(방어적 재계산 가능).

**정합성 검증(장주성 orphan, out=장치광 in=장주성):** lineup 장치광→장주성 ✓ · assignments엔 이미 장주성(치환할 장치광 없음) ✓ · positionMap[장치광] 이미 삭제됨 → 가드로 장주성 role 유지 ✓ · defenders에 장치광 있으면 장주성으로 ✓ · subs엔 장치광 유지 ✓ → 출전=장주성, 미출전=장치광.

**엣지(A-3):** b가 실제 sub의 playerOut(벤치로 나감)이었던 경우 정정 후 subs 정합이 어긋날 수 있음 → 드묾(정정은 '뛰지도 않은 오기입 b'에 적용). 표준 케이스(b=순수 오기입 선발) 보장, 필요 시 후속.

### 교체와의 구분
- 교체(`handleSubIn`): sub 이벤트 생성, 타임라인 표시, 둘 다 뜀(b는 lineup 유지).
- 정정(`CORRECT_SOCCER_LINEUP`): 이벤트 없음, 조용한 로스터 교정, b는 미출전.

---

## 설계 ② — 교체 삭제 되돌리기 (G1)

**전제:** sub 이벤트에 **`posIdx`(교체가 일어난 슬롯)를 저장**한다(현재 미저장 → `handleSubIn`이 `subOut.posIdx`를 이벤트에 실음). 이래야 원 슬롯을 확실히 식별·복원.

`DELETE_SOCCER_EVENT`에서 삭제 대상이 `type === "sub"`(`{ playerOut, playerIn, position, posIdx }`)면:
- **깨끗이 되돌릴 수 있을 때만 복원:** `assignments[posIdx] === playerIn`(그 sub 이후 그 슬롯이 안 바뀜)이면 →
  - `assignments[posIdx] = playerOut`; `positionMap`: `delete [playerIn]`, `[playerOut] = position`; `subs`: `playerOut` 제거·`playerIn` 추가; `gk`: `position === "GK"`면 `gk = playerOut`.
- **얽혀서 안전하지 않으면**(그 슬롯이 이후 교체/위치교대/퇴장으로 바뀜 → `assignments[posIdx] !== playerIn`): **배치 미변경**, 이벤트만 삭제 + 안내("이 교체는 이후 변경과 얽혀 배치를 자동 복원할 수 없습니다. 라인업 변경으로 정정하세요"). → **A-2의 GK 3명 등 오염 원천 차단.**
- **UX 고지(E-I-2):** 삭제 전 confirm "교체를 삭제하면 그 교체가 되돌려집니다(배치 복원)" — 기존 '이벤트만 정리' 기대와 달라 명시.
- score 재계산 유지. 대상은 sub만(goal/card 삭제는 기존대로).
- **레거시 posIdx 부재:** posIdx 없는 기존 sub 이벤트는 '안전하지 않음'으로 취급(배치 미변경 + 안내).

---

## 설계 ③ — 카드 버튼 축소 (G3)

`PlayerActionMenu`(현재 2열 6버튼 균등): 골·어시·자책·교체는 **2열 큰 버튼** 유지, **옐로·레드는 아래 별도 행에 작은 버튼**(폭 절반·낮은 높이·작은 fontSize)으로 분리(B-M1 확정). 오탭 위험 감소.

---

## 변경 파일 요약

| 파일 | 변경 |
| --- | --- |
| `src/hooks/useGameReducer.js` | `CORRECT_SOCCER_LINEUP`(논리 matchIdx, defenders 포함, positionMap 가드); `DELETE_SOCCER_EVENT`에 posIdx 기반 안전 sub 되돌리기 |
| `src/utils/soccerScoring.js`(또는 신규 util) | `remapPlayerInSoccerEvents(events, from, to)` 순수 헬퍼 + 단위테스트 |
| `src/components/game/FormationRecorder.jsx` | `handleSubIn`이 sub 이벤트에 `posIdx` 저장 |
| `src/components/game/SoccerMatchView.jsx` | `라인업 변경` 버튼 + `LineupCorrectionModal`; 진행중 노드 `correctionSeq` 강제 remount; gameFinalized 가드 |
| `src/components/game/LineupCorrectionModal.jsx` | 신규 — 출전/미출전 + 정정 선택 |
| `src/components/game/PlayerActionMenu.jsx` | 옐로/레드 별도 행 작은 버튼 |
| `src/SoccerApp.jsx` | `correctSoccerLineup` 핸들러 + prop 전달 |

## 엣지 케이스

- 정정 `in`(a)이 이미 출전 상태이거나 `out`(b)이 미출전이면 모달에서 선택 불가(목록 분리로 방지).
- b가 GK였고 a로 정정 → gk=a, 이후 실점/클린시트 귀속 a로(getMatchGks/currentGk 이관 반영).
- 정정 후 `출전`/통계(keeperGames/클린시트)가 a 기준으로 재집계(라이브 집계라 자동).
- 교체 되돌리기: 슬롯이 이후 변경된 chained 케이스는 배치 미변경 + 안내(오염 방지). posIdx 없는 레거시 sub도 동일.
- 멀티탭/동기화: **lineup은 이미 동기화 대상**(`firebaseSyncDiff` diffStateToWrites가 events 외 전 필드 write, normalizeSoccerMatch가 lineup 포함 — E 확인). 추가 배선 불필요.

## 테스트

- 순수 헬퍼 `remapPlayerInSoccerEvents`: 골/어시/currentGk/sub/카드/gkChange 각 필드 b→a 치환, 무관 이벤트 불변.
- 리듀서 `CORRECT_SOCCER_LINEUP`: lineup/**defenders**/assignments/positionMap/gk/subs/events b→a + b를 subs로, 타 경기 무변경. **DF-정정 클린시트**(defenders 갱신 검증). **orphan 케이스(positionMap[b] 부재 시 a role 보존)**. GK 정정.
- 리듀서 `DELETE_SOCCER_EVENT`(sub): posIdx 슬롯 미변경 시 배치/subs/gk 복원; 슬롯 변경(chained) 시 배치 미변경. 비-sub 삭제 기존대로.
- 집계 회귀: 정정 후 `calcSoccerPlayerStats`가 a에 경기/골/**클린시트(DF/GK)** 귀속, b 미포함.
- 수동 QA: 라인업 변경으로 장주성 케이스 정정 → 출전(11)에 장주성·장치광 미출전, 통계 반영. **진행중 정정 시 피치 즉시 반영(remount).**

---

## Adversarial review 반영 (2026-07-01, 4렌즈)

판정 **ISSUES FOUND**(0 Critical live, Important 6, 조작 0). 반영:
1. 진행중 정정 후 FormationRecorder 강제 remount(레코더 stale→2차 오염 방지) — B-Crit/C-Imp.
2. `defenders` b→a 치환 추가(클린시트 오귀속) — A/E 3렌즈.
3. 교체 삭제 되돌리기: sub에 posIdx 저장 + 슬롯 미변경 시에만 복원, 아니면 안내(GK 3명 오염 차단) — A-2.
4. positionMap role 가드(orphan 케이스 undefined 덮어쓰기 방지) — B-I1.
5. 삭제-되돌리기 confirm 고지 — E-I-2. 6. 마감 후 정정 gameFinalized 가드 — B-I2.
7. remapPlayerInSoccerEvents 헬퍼 분리+테스트 / 논리 matchIdx / 카드 레이아웃 확정.
긍정: lineup 동기화 이미 됨, 풋살 무관, 4개 배치연산 분리 정당.

## 범위 밖 (재확인)

- 마감 시트 소급, 스쿼드 밖 선수 투입, 카드 이벤트 삭제 복구, 풋살.
