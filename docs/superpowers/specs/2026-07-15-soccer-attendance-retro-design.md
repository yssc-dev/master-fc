# 축구 모드 — 당일 참석 명단 사후 변경 설계 (v3)

상태: **승인됨** (2026-07-15). 코드 미작성 — 다음 단계는 구현 플랜.
대상: /Users/rh/Desktop/python_dev/footsal_webapp (branch `feat/soccer-attendance-retro`)

**개정 이력**
- v1 — 적대적 리뷰 1라운드(4렌즈)에서 Important 3건 확인. 유저의 "미출전" 정의와 배치 결정으로
  근거가 무너져 폐기.
- v2 — 재설계. 리뷰 2라운드(4렌즈)에서 `attendees` prop 미연결(3렌즈 확인), D2 인과 설명 오류,
  `revertSubInFormation` 삭제 경로 미명세, `m.subs` 소비처 과다 계상이 확인됨.
- v3 — 위 전부 반영. D2는 유저 확정("진행중인 경기장안에서도 … 교체처리 가능하도록")으로 유지.

---

## 1. 확정된 요구사항 (유저 발화 기준)

**용어 정의 (유저 확정):**
> 참석자 전원에서 (스타팅멤버+교체출전자)를 제외한 나머지가 미출전(경기를 안뛴 후보선수)

→ **미출전 = 참석자 − 출전자.** 경기 생성 시점 스냅샷(`m.subs`)은 판정 근거가 아니다.

**시나리오 2개가 요구사항의 전부:**
1. **조기귀가 A** — 1~2경기 뛰고 귀가. 참석수정에서 불참 처리하려 하면 → **기존 출전 기록이 있으니
   해제 불가**로 막는다. ("출전했는데 불참" 모순 예방)
2. **지각 B** — 경기 도중 참석수정으로 추가 → **이미 뛴 경기와 앞으로 새 경기 모두** B를 넣을 수 있어야
   한다.

**배치 (유저 확정):** 참석명단은 경기화면 상단 탭바에 넣고, 모달에서 출석인원 전체관리.
(기존 대진표·팀순위·개인기록과 동일 패턴)

**범위:** 오늘 세션 한정(아카이브 제외). 상시 기능.
**불변 원칙:** 풋살 무손상. 리듀서 액션(`TOGGLE_ATTENDEE`/`SET_ATTENDEES`)은 풋살 공용이므로 불변.

---

## 2. 근본 원인 (조사 확인 완료)

경기 생성 시 벤치가 그 시점 참석명단의 스냅샷으로 동결된다:
- `SoccerMatchView.jsx:120` — `setSelectedPlayers(attendees)`
- `FormationSetup.jsx:52` — `const subs = selectedPlayers.filter(n => !assignedNames.has(n));`
- `useGameReducer.js:893` — `subs: subs || [],`

읽는 쪽이 그 동결된 스냅샷만 본다:
- `SoccerMatchView.jsx:192` — `const bench = (fm.subs || []).filter(n => !played.includes(n));` (정정 후보)
- `SoccerMatchView.jsx:314` — `const benchNeverPlayed = fm ? (fm.subs || []).filter(n => !played.includes(n)) : [];` (요약 미출전)
- `FormationRecorder.jsx:21` — `const [subs, setSubs] = useState(initSubs || []);` (교체 후보)

**통계 영향 없음(확인):** `matchRowBuilder.js:88-97`의 `our_members_json`은
`lineup ∪ assignments ∪ gk ∪ defenders ∪ 이벤트참여자`이며 `subs`를 읽지 않는다.

---

## 3. 설계 결정

### D1. 표시·정정 후보 = `참석자 − 출전자` (m.subs 미참조)

`:192`(정정 후보)와 `:314`(요약 미출전) 둘 다 유저 정의를 그대로 구현한다:

```js
// soccerScoring.js — getSoccerPlayedPlayers 옆
export function getNonPlayers(match, attendees) {
  const played = new Set(getSoccerPlayedPlayers(match));
  return (attendees || []).filter(n => !played.has(n));
}
```

**`reconstructFormation`은 건드리지 않는다.** v1은 여기에 합집합을 넣으려 했으나:
- 리뷰(렌즈 C)가 `:148`·`:240`에서 `onUpdateMatchFormation?.(idx, reconstructFormation(m))`으로
  **결과가 RTDB에 영속**됨을 지적. 파생값이 저장 데이터로 샌다.
- 함수가 순수 `(m) → 배치`에서 `attendees` 클로저 의존으로 바뀌어 호출부에서 의존성이 안 보인다.

D1은 두 호출부에서 `attendees`를 직접 쓰므로 `reconstructFormation`이 순수하게 남고 위 문제가 모두
소멸한다.

**v1의 합집합(`m.subs ∪ attendees`)이 왜 틀렸나:** C가 참석 체크됐다가(→`m.subs`에 박힘) 한 번도 안
뛰고 불참 처리되면, 유저 정의상 참석자가 아니므로 미출전이 아니다. 그러나 합집합은 `m.subs`에 남은
C를 계속 미출전으로 띄운다.

**요구사항 검증:**
| 케이스 | `attendees − played` 결과 |
|---|---|
| 지각 B 추가 | 모든 경기에서 미출전/정정 후보로 등장 ✓ (요구 2) |
| 조기귀가 A (해제 차단됨) | 참석자로 남아 이후 경기에 미출전 표시 ✓ (요구 1) |
| 안 온 C 불참 처리 | 참석자에서 빠져 사라짐 ✓ (유저 정의) |

### D2. 교체 후보 = `참석자 − 피치 위 − 퇴장자` (레코더 파생화)

**유저 확정:** "진행중인 경기장안에서도 불참인원중 참석으로 변경하여 교체처리 가능하도록."
→ 진행 중인 경기의 교체 후보에 신규 참석자가 즉시 떠야 한다. D2는 필수다.

교체 후보는 D1과 다르다. 교체아웃된 선수는 `played`에 있지만 **다시 투입 가능**해야 하므로
`− played`를 쓸 수 없다.

**왜 파생인가:** `useState(initSubs)`는 최초 1회만 시드하고 `key={matchIdx}`로만 remount된다(`:292`).
그리고 `initSubs`의 출처인 `reconstructFormation`의 modern 경로는 `subs: m.subs || []`(`:75`) —
**경기 생성 시점 스냅샷**이다. 즉 remount를 시켜도 신규 참석자 B는 나오지 않는다. 파생만이 답이다.

> v2 초안의 "모달이라 remount가 사라져서 파생이 필요하다"는 인과 설명은 **틀렸다**(리뷰 렌즈 B가 지적).
> remount는 애초에 B를 데려온 적이 없다 — `m.subs` 스냅샷을 재시드할 뿐이다. 모달(D4)과 무관하게
> 파생이 필요하다.

**인터페이스 변경 (필수 — 빠지면 런타임 크래시):** 리뷰 3개 렌즈(A·B·E)가 독립 확인. 현재
`FormationRecorder`는 `attendees`를 prop으로 받지 않는다(`:12-16`). 파생식이 `attendees`를 쓰므로
반드시 추가해야 한다.

```js
// FormationRecorder.jsx:12-16 — `subs: initSubs` 제거, `attendees` 추가 (기본값 없음 — 아래 참조)
export default function FormationRecorder({
  formation: initFormation, assignments: initAssignments, positionMap: initPositionMap,
  gk: initGk, attendees, opponent, startedAt, matchMinutes = 90,
  events: initEvents, onAddEvent, onDeleteEvent, onFinishMatch, onStateChange, onFlowActiveChange,
})

// 파생 (`:37`의 const events 선언 뒤에 위치 — assignments는 로컬 state)
const expelled = new Set(events.filter(e => e.type === "redCard").map(e => e.player));
const onPitch = new Set(Object.values(assignments).filter(Boolean));
const subs = attendees.filter(n => !onPitch.has(n) && !expelled.has(n));
```
```jsx
// SoccerMatchView.jsx:291-299 호출부 — `subs={live.subs}` 제거, `attendees={attendees}` 추가
// (attendees는 SoccerMatchView가 이미 prop으로 받고 있다 — `:19`)
```

**`attendees`에 기본값(`= []`)을 주지 않는 이유:** 기본값이 있으면 prop 미연결 시 크래시 대신
**교체 후보가 조용히 비어 보인다** — 발견이 훨씬 어렵다. `attendees`가 undefined가 되는 경로는
prop 미연결(구현 실수)뿐이며, RTDB 빈배열 함정은 `firebaseSyncDiff.js:357`의
`attendees: raw.attendees || []`가 단일 지점에서 이미 막고 있고 리듀서 초기값도 `[]`
(`useGameReducer.js:17`)다. 따라서 첫 렌더에서 시끄럽게 터지는 편이 옳다 — 스모크 1번에서 즉시 잡힌다.

**D3 의존 (중요):** 이 파생식의 정합성은 **D3이 `출전자 ⊆ 참석자`를 보장하는 데 의존한다.** 교체아웃된
선수가 참석에서 빠질 수 있다면 벤치에서 사라져 재투입이 불가능해진다. D3 없이 D2만 넣으면 안 된다.

**`setSubs` 3곳 제거와 저장 계약:**
- `:21` `const [subs, setSubs] = useState(initSubs || []);` → 삭제, 위 파생 const로 대체.
- `:127` `setSubs(newSubs);` → 삭제. 단 `:124`의
  `const newSubs = [...subs.filter(n => n !== subName), subOut.name];`와 `:131`의 `onStateChange`
  **`subs` 전달은 유지**한다. `newSubs`는 교체 후 파생값과 집합적으로 동일하다
  (`attendees − (onPitch − subOut + subIn) − expelled = subs − subIn + subOut`). 이로써 `m.subs`가
  계속 갱신된다.
- `:248` `setSubs(reverted.subs);` → 삭제. 이 경로는 `onStateChange`를 안 부르고 `onDeleteEvent`만
  부르며, 리듀서(`useGameReducer.js:1013`)가 `m.subs`를 독립적으로 되돌린다. 로컬 `subs`는 되돌려진
  `assignments`에서 자동 재파생되므로 양측이 일치한다. `reverted.subs`가 미사용이 되는 것은
  **의도**이며, 호출부에 주석을 남겨 재도입(=`useState(prop)` 안티패턴 회귀)을 막는다.

**부수 이득:**
- **레드카드 결함 해소** — 리뷰(렌즈 A) 확인: `handleRedCard`(`:70-89`)는 퇴장 선수를 `assignments`
  에서만 지우고 `subs`엔 안 넣는다(주석 `// 퇴장: 피치에서 제거 (후보 투입 없음)`). 파생식이
  `expelled`를 명시적으로 빼므로 퇴장 선수 재투입이 구조적으로 불가능해진다.
- **`useState(prop)` 안티패턴 제거** — 프로젝트가 과거 이 패턴으로 버그를 겪음(CourtRecorder GK).
- **중복 상태 소멸** — `subs`는 `assignments`에서 완전히 파생 가능한데 지금은 병렬 수동 동기화 중.

**멀티탭 (리뷰 렌즈 E 지적 → 해소):** `m.subs`가 일시적으로 신규 참석자를 누락할 수 있으나 무해하다.
`m.subs`를 읽는 곳은 `CORRECT_SOCCER_LINEUP`(`:945`)과 리듀서 revert 둘뿐이고, 둘 다 집합 연산이라
누락된 이름이 있어도 결과가 옳다. 다른 탭의 레코더는 자기 `attendees`(RTDB 동기화됨)에서 파생하므로
표시가 정확하다.

**주의:** `FormationRecorder`는 민감 컴포넌트다(goalFlow 로컬 state, `revertSubInFormation` 공유
헬퍼를 리듀서와 동시 사용). 이 설계에서 **유일하게 위험이 늘어난 지점**이다.

### D3. 참석 해제 차단 — 경로 3개 전부

리뷰 3개 렌즈(A·B·C)가 독립 확인: v1은 "3개 모두 막아야 한다"고 써놓고 칩 잠금만 명세해
`onSetAll`/`onClear`가 뚫려 있었다. 확인된 원문:

```js
// SoccerApp.jsx:469-470
onSetAll: (names) => dispatch({ type: 'SET_ATTENDEES', attendees: names }),
onClear: () => set('attendees', []),
```

**잠금 대상 — 오늘 전 경기의 출전자 합집합:**
```js
// SoccerApp.jsx — 축구 전용. state.soccerMatches에서 파생
const locked = useMemo(() => {
  const s = new Set();
  for (const m of state.soccerMatches || []) for (const n of getSoccerPlayedPlayers(m)) s.add(n);
  return s;
}, [state.soccerMatches]);
```

**3경로 전부 `SoccerApp.jsx`의 축구 전용 `rosterHandlers`에서 감싼다** (리듀서 불변 → 풋살 무영향):
```js
onToggle: (name) => { if (locked.has(name)) return; dispatch({ type: 'TOGGLE_ATTENDEE', name }); },
onSetAll: (names) => dispatch({ type: 'SET_ATTENDEES', attendees: [...new Set([...names, ...locked])] }),
onClear:  () => dispatch({ type: 'SET_ATTENDEES', attendees: [...locked] }),
```
(`onClear`는 현재 `set('attendees', [])`이나 `SET_ATTENDEES`로 통일한다 — 잠금 인원을 남겨야 하므로.)

`AttendeeSelector`는 `lockedNames` prop(기본 `[]`, `[...locked]`를 받음)으로 🔒 표시 + 이유 노출만
담당(표시 전용). 핸들러가 최종 방어선이므로 UI만 뚫려도 데이터는 안전하다.

**setup 단계는 무가드로 둔다** — 그 시점 `soccerMatches`가 비어 `locked`가 항상 공집합이므로 무의미.

**v1의 사실오류 정정:** v1은 "`AttendeeSelector`는 풋살과 공용"이라 했으나 **거짓**이다. 리뷰(렌즈 E)가
전수 grep으로 확인: 이 컴포넌트는 `SoccerApp.jsx:20`·`SoccerMatchView.jsx:14` — **축구 전용**이다.
풋살 `App.jsx`는 인라인 버튼으로 직접 dispatch한다(`:942`, `:963`, `:1087`). 실제 풋살 공유면은
리듀서 액션뿐이고, 이 설계는 그걸 안 건드린다.

### D4. 참석명단 = 상단 탭바 모달 (일 단위 축 분리)

`SoccerApp.jsx:419-425`의 `MatchTabBar`에 항목 추가 → `matchModal === 'roster'` 모달에서
`AttendeeSelector` + `lockedNames` 렌더. 기존 대진표·팀순위·개인기록과 동일 패턴.

`rosterHandlers`는 이미 `SoccerApp.jsx:466-474`에 있으므로 모달에서 직접 쓴다.

**제거되는 것 (경기 축과 일 축의 물리적 분리):**
- `SoccerMatchView.jsx:175-184` — `editRoster` viewState 서브플로우 통째로
- `:269-277` — 새 경기 노드의 `👥 명단 수정` 버튼
- `:31`·`:41-46` — viewState 시드/동기화의 `editRoster` 분기
- `SoccerMatchView`의 `rosterHandlers`·`sortedPlayers`·`playerSortMode` prop — 이 셋은 `:24` 선언과
  `:181`(AttendeeSelector)에서만 쓰이므로 제거 안전(grep 확인). `attendees`는 **유지** — `:120`과
  D1의 `:192`/`:314`, D2의 레코더 전달이 쓴다.

**부수 이득:** 모달은 `SoccerApp` 레벨이라 `SoccerMatchView`/`FormationRecorder`를 언마운트하지 않는다
→ goalFlow 골 유실 위험이 **구조적으로 소멸**한다. navLocked 가드 불필요.

### D5. 네이밍 — 앱 내부 용어로 정렬

앱은 이미 올바른 용어를 쓰고 있고 버튼만 이탈해 있었다(`LineupEditView.jsx:41,47` 출전/미출전,
`SoccerMatchView.jsx:332` `출전 (N):`).

| 현재 | 변경 | 축 |
|---|---|---|
| `🔁 라인업 변경` (`:259`) | `🔁 출전 수정` | 이 경기 |
| `👥 명단 수정` (`:275`) | 제거 → 탭바 `참석명단 (N)` | 그날 |

### D6 (v1) — 폐기

v1의 "멀티탭에서 A탭이 참석수정을 열면 B탭 레코더가 언마운트되어 골 유실" 주장은 **전제가 거짓**이었다.
`editRoster`를 RTDB에 쓰는 곳이 없다 — `:273` 버튼은 `setViewState("editRoster")`만 호출하고
`saveFormationState`를 안 부르며, rosterHandlers 7개 중에도 부르는 게 없다. 게다가 기존 코드는
`setViewState(local => local === "editRoster" ? local : v)`로 로컬 editRoster를 이미 보호하고 있었다.
D4로 서브플로우 자체가 사라지므로 논점 소멸.

---

## 4. 명시적 비범위

- 아카이브(지난 날짜) 기록 수정 — 유저가 명시적 제외.
- 풋살 모드 — 변경 없음. 리듀서 액션·`App.jsx` 불변.
- 리듀서 액션 신설/변경 — 없음. 기존 `CORRECT_SOCCER_LINEUP`/`TOGGLE_ATTENDEE`/`SET_ATTENDEES` 재사용.
- 시트 전송 포맷 — 변경 없음.
- `m.subs` 저장 필드 제거 — 하지 않는다. 의미적 소비처 2곳이 계속 읽는다:
  `CORRECT_SOCCER_LINEUP`(`useGameReducer.js:945`), 리듀서 revert(`:1013` → `revertSubInFormation`).
  (`firebaseSyncDiff.js:320`의 `subs: asArr(m.subs)`는 구조 정규화일 뿐 의미적 소비처가 아니다 —
  리뷰 렌즈 C 지적 반영. v2 초안이 3곳이라 한 것은 과다 계상.)
- `reconstructFormation`의 `subs` 반환 필드 제거 — 하지 않는다. 표시 경로에서는 안 읽히게 되지만
  `:148`·`:240`의 레거시 승격이 `onUpdateMatchFormation(idx, reconstructFormation(m))`으로 이 값을
  `m.subs`에 쓴다(`UPDATE_SOCCER_MATCH_FORMATION` 화이트리스트 `:914`). 죽은 필드가 아니다.
  (렌즈 C가 "dead"로 본 것은 표시 경로만 본 과대평가. 다만 `subs={live.subs}` **prop은** 실제로
  죽으므로 D2에서 제거한다.)
- **벤치가 빌 때 오기입 선수를 빼는 기능** — 범위 밖(기존 결함). 아래 §7 참조.

## 5. 검증 계획

**유닛 (순수 함수):**
- `getNonPlayers`: 지각자가 후보에 뜨는가 / 출전자는 빠지는가 / 불참 처리된 벤치전용자는 사라지는가 /
  `attendees` 빈 배열·`undefined` 안전한가 / 교체아웃된 선수는 미출전이 아닌가.
- 교체 후보 파생식: 퇴장자 제외 / 교체아웃 선수 복귀 가능 / 피치 위 선수 제외.
- 잠금 3경로: `onToggle`·`onSetAll`·`onClear` 각각에서 출전자가 살아남는가.

**렌더/통합:** 이 저장소는 RTL 하네스가 얕아 렌더 크래시를 build/vitest가 못 잡는다(기존 기록).
`FormationRecorder`의 `setSubs` 제거는 민감 변경이므로 브라우저 스모크 **필수**:
1. `attendees` prop 연결 확인 — 미연결 시 `attendees.filter`가 즉시 `TypeError`로 레코더 전체가
   크래시한다(리뷰 3렌즈 확인). 진행중 경기 화면 진입이 첫 스모크 항목.
2. 진행중 경기에서 참석명단 모달로 B 추가 → 교체 모달에 B가 뜨는지 (요구사항 핵심).
3. 교체 → 나간 선수가 후보로 복귀하는지.
4. 교체 삭제 → 로컬·리듀서 양측이 같이 되돌아가는지.
5. 레드카드 → 퇴장 선수가 교체 후보에 **안** 뜨는지.
6. 참석명단에서 출전자 🔒 확인 + `활동선수 전체`·`초기화` 눌러도 출전자가 남는지.

## 6. 리뷰 2라운드에서 닫힌 항목

v2 초안이 "미해결"로 남겼던 두 항목은 리뷰(렌즈 A·C·E)의 추적으로 확정됐다. D2 본문에 반영됨:
- `onStateChange`의 `subs`는 **기존 `newSubs` 표현식 유지** — 파생값과 집합적으로 동일함이 증명됨.
- `revertSubInFormation` 삭제 경로는 **`reverted.subs`를 의도적으로 버림** — 리듀서가 `m.subs`를
  독립 유지하고 로컬은 `assignments`에서 재파생하므로 드리프트 없음. 주석으로 고정.

## 7. 알려진 기존 결함 (이 설계가 만들지도, 고치지도 않음)

리뷰(렌즈 B)가 "D3 가드 데드락"으로 제기했으나, 추적 결과 **D3이 만든 함정이 아니라 기존 결함**이다.

**시나리오:** 참석 11명 전원이 선발로 들어간 경기에서 X가 오기입됐다. 벤치(`참석자 − 출전자`)가
비어 `LineupEditView`의 정정(`:23-24` `handleBenchTap`)이 불가능하다. `getSoccerPlayedPlayers`는
lineup·assignments만 보고 골 이벤트는 안 보므로(`soccerScoring.js:83-92`) 이벤트를 지워도 X는
출전으로 남는다. → X를 뺄 방법이 없다.

**D3의 책임이 아닌 이유:** 오늘 X를 참석에서 언체크해도 1경기의 `lineup`과 `our_members_json`에서는
빠지지 않는다(`matchRowBuilder.js:88-97`). 그 언체크는 **기록에 아무 효과가 없는 no-op**이다. D3은
효과 없는 동작을 막을 뿐, 작동하던 탈출구를 뺏지 않는다.

**근본 원인:** 라인업에서 선수를 *제거*하는 연산이 없다(정정은 치환이라 벤치 인원이 필요). 별도
기능이며 이 설계 범위 밖. 필요해지면 독립 설계 라운드로.
