# 축구 경기 당일 플로우 재설계 (하버FC)

작성일: 2026-05-26
대상: 축구(축구) 모드 — `SoccerApp` 및 하위 게임 컴포넌트

## 배경 / 목표

하버FC는 한 세션에 여러 상대팀과 돌아가며 경기한다. 현재 축구 모드는:

- 초기 세팅이 "참석명단"만 고르는 단일 화면이고, 시트연동 모드면 그 화면을 **자동으로 건너뛰어** 바로 경기로 진입한다.
- 상대팀은 `settings/{team}.축구.opponents`에 평평한 문자열 배열로 저장돼, 매 경기 전체 목록이 노출된다. **추가만** 가능(삭제/이름변경 없음).
- "오늘 참석한 상대팀"이라는 세션 단위 개념이 없다.
- 장소(venue) 개념이 아예 없다.
- 경기 시작 후 참석명단을 수정할 진입점이 없다.
- 경기별 스냅샷은 선발 11명(`lineup`)+`gk`+`defenders`만 저장하고 **후보(subs)는 match 객체에 안 들어간다**.
- 스쿼드 배치는 "빈 슬롯 탭 → 선수 탭" 단방향이다.
- 헤더 "홈" 버튼이 하드코딩된 흰 글씨라 밝은 테마에서 안 보인다.

목표: 경기 당일 플로우를 **초기 세팅(참석명단 + 참석팀) → 경기별 진행 → 명단 변동 대응**으로 재정비하고, 상대팀 데이터를 구글시트에서 가져오며, 스쿼드 UX를 탭-탭으로 바꾼다. 장소는 이번 범위에서 제외한다.

실시간 동기화 아키텍처(RTDB 자식노드 diff/subscribe + editorTag 에코 방지)는 그대로 유지하며 그 위에 얹는다.

## 결정된 설계 방향 (브레인스토밍 합의)

1. 상대팀 소스 = **구글시트 대시보드 탭**의 "vs 상대팀명" 표 (settings 영구저장 의존 제거).
2. 참석팀 = 오늘의 subset, 마스터(시트 후보)에서 골라 담는다.
3. 장소(venue) = **이번 범위 제외**.
4. 참석명단 = 초기세팅 화면을 **항상 표시**, 그 안에서 "시트 불러오기" + 수동 선택 둘 다. 자동 건너뛰기 제거.
5. 경기 중 명단 변동 = **경기 사이에 "명단 수정"** (다음 경기 풀에 반영). 경기 도중 이탈은 기존 교체 기능.

---

## 1. 상대팀 데이터 소스 — 구글시트 자동 파싱

**위치**: 상대팀 표(표6: `vs 상대팀명 | 경기 | 승 | 무 | 패 | 득점 | 실점`)는 `대시보드` 탭 **안**에 있다(선수 데이터와 같은 CSV). 별도 fetch 불필요.

**변경**: `src/services/sheetService.js`의 `fetchSheetData()`를 확장.

- 기존 파서가 "이름" 헤더를 동적 탐지하듯, CSV에서 trim 값에 `상대팀명`이 포함된 셀을 찾아 그 (row, col)을 기준점으로 잡는다.
- 그 열의 다음 행부터 한글 팀명을 읽고, 같은 행에서 헤더의 `경기` 열 오프셋을 이용해 경기수를 함께 읽는다. 빈 행 또는 비-한글 만나면 중단.
- 반환값에 `opponents: [{ name: string, games: number }]` 추가. (헤더를 못 찾으면 `[]` 반환 — graceful)

**소비**: `SoccerApp._loadAllData`에서 `sheetData.opponents`를 새 상태 `opponentSuggestions`에 넣는다(아래 2번).

**검증 노트**: 실제 하버FC 시트의 열 배치는 코드에 없고 팀별 settings(Firebase/localStorage)에 sheetId가 있어 정적으로 확인 불가. 구현 시 실행 중인 앱(또는 Playwright)으로 라이브 시트를 떠서 파서가 시청/아이콘/터틀파크/한울을 정확히 뽑는지 확인한다.

---

## 2. 참석팀 = 오늘의 subset (`state.opponents` 재정의)

**모델**:

- `opponentSuggestions` (**신규, 동기화 X, 로컬 전용**): 시트에서 매 로드 시 갱신되는 빠른선택 후보. `{name, games}[]`, `games` 내림차순 정렬 → 자주 붙은 팀이 위로.
- `state.opponents` (**기존 필드, 의미 재정의**): "**오늘 참석한 상대팀**" 리스트(문자열 배열). 이미 `WHOLE_REPLACE_FIELDS`라 RTDB 실시간 동기화/restore 대상. 초기세팅에서 채운다. 시작은 빈 배열.

**기존 코드 제거/변경**:

- `_loadAllData`의 `gameSettings.opponents` → `SET_OPPONENTS` 로드(현 line 86~87) 제거. 대신 `opponentSuggestions`만 시트에서 세팅.
- `addOpponent`의 `saveSettings(...opponents...)` 영구저장(현 line 206~213) 제거 — 시트가 진실 소스. (settings의 `opponents` 키 자체는 호환 위해 남겨두되 더 안 쓴다.)
- **`SoccerApp.jsx:413`의 fallback** `opponents={state.opponents || gameSettings.opponents || []}` → `state.opponents || []`로 변경 (stale settings 폴백 제거).

**[리뷰 발견 A] `SettingsScreen.jsx`의 "상대팀 관리" 섹션** (line 393~440): `settings.opponents`를 직접 add/delete하는 **기존 CRUD UI가 이미 존재**한다. 시트를 진실 소스로 바꾸면 이 섹션은 무의미해져 혼란을 준다. → **이 섹션 제거** 권장(기존 UI 삭제이므로 사용자 확인 필요). settings의 `opponents` 키는 남겨도 무해.

**참석팀 편집(추가/삭제/이름변경)**:

- 추가: `opponentSuggestions` 칩 탭 → 오늘 참석팀에 추가. 또는 시트에 없는 팀 즉석 텍스트 입력.
- 삭제: 오늘 참석팀에서 제거(시트 데이터 불변).
- 이름변경: 오늘 참석팀 항목 인라인 rename(주로 즉석 추가팀용).
- 이 편집은 모두 `state.opponents` 배열을 새로 만들어 `SET_OPPONENTS` dispatch. RTDB로 자동 공유됨.

새 핸들러: `SoccerApp`에 `setTodayOpponents(list)` 또는 세분화된 `addTodayOpponent/removeTodayOpponent/renameTodayOpponent`.

---

## 3. 초기 경기세팅 화면 (항상 표시)

**변경**: `SoccerApp._loadAllData`의 sheetSync 자동 진입 분기(현 line 90~95) 수정. **`attendees`는 그대로 미리 채우되**(시트에서 받은 명단), `phase: "match"`로 점프하는 부분만 제거 → 시트연동 모드여도 setup 화면에 머물며 명단이 미리 선택돼 있다. (시트 X면 빈 채로 setup)

**setup 화면(현 line 291~348 확장)** 두 섹션:

1. **참석명단** (기존 UI 유지·강화):
   - "📋 시트에서 불러오기" 버튼 = 기존 `syncAttendance()` (`fetchAttendanceData` → `SET_FIELDS{attendees}`).
   - 활동선수 전체 / 초기화 / 정렬 토글 / 칩 토글(`TOGGLE_ATTENDEE`) / 수동 이름추가 — 모두 유지.
   - 시트와 수동을 자유롭게 혼용 가능.
2. **참석팀** (신규):
   - `opponentSuggestions` 칩(경기수순) → 탭하면 오늘 참석팀에 토글.
   - 즉석 추가 입력 + 추가된 팀들의 삭제/이름변경.
   - 시각: 선택된(오늘 참석) 팀은 강조.

하단 "경기 시작" → `START_MATCHES` → `phase: "match"` (기존).

> 참석팀이 비어 있어도 경기 시작은 허용(경기 화면에서 즉석 추가/휴식 가능). 명단은 기존처럼 최소 인원 안내.

---

## 4. 경기 진행 — 참석팀 기준 선택

**변경**: `OpponentSelector` (`src/components/game/OpponentSelector.jsx`)가 `opponents` prop으로 **오늘 참석팀(state.opponents)**을 받아 노출. (전체 마스터 목록이 아님)

- 칩 순서 = 참석팀에 담긴 순서(setup에서 경기수순 후보로 고르면 자연히 자주 붙은 순). **별도 강조 배지는 생략**(참석팀이 3~4팀이라 효용 작음 — 결정됨).
- 휴식 버튼 유지.
- "+ 새 상대팀": 경기 화면에서도 즉석 추가 가능(오늘 참석팀에 추가 + 바로 선택). 시트엔 없지만 세션엔 반영.
- 선택 → `FormationSetup` → `FormationRecorder`(골 이벤트). 기존 흐름 유지.

---

## 5. 참석명단 — 경기 사이 수정

**진입점**: `SoccerMatchView`의 경기 선택 화면(`viewState === "selectOpponent"`, 현 line 183~215)에 **"명단 수정"** 버튼 추가.

- 탭 → 참석명단 편집기 표시(초기세팅의 명단 섹션 UI 재사용; 별도 `viewState: "editRoster"` 또는 모달).
- 확정 시 `attendees` 풀 갱신(`SET_FIELDS{attendees}` 또는 `TOGGLE_ATTENDEE`).
- **다음 경기부터** 반영. 진행 중/종료된 경기의 스냅샷은 불변.
- 경기 도중 이탈/합류는 이번 범위 아님 — 기존 `FormationRecorder` 교체 기능 사용.

**[리뷰 발견 B] 명단 편집기 재사용 — 컴포넌트 추출**: 현재 명단 선택 UI는 `SoccerApp`의 setup 렌더에 인라인(line 311~339)이고, 경기 중에는 `SoccerMatchView`가 렌더된다. 둘 다에서 쓰려면 **`AttendeeSelector` 컴포넌트로 추출**(props: `attendees`, `sortedPlayers`, dispatch 핸들러)해 setup·명단수정 양쪽에서 사용. ("작업 중인 코드 개선" 차원의 정당한 리팩터.)

**[리뷰 발견 C — 동기화 버그] `autoSync` deps에 `attendees` 누락**: `SoccerApp`의 autoSync useEffect deps(현 line 152)는 `[soccerMatches, phase, currentMatchIdx, soccerFormation, opponents]`로 **`attendees`가 빠져 있다**. 경기 중 명단만 바꾸면 autoSync가 안 돌아 다른 탭에 전파되지 않는다. → deps에 `state.attendees` 추가 필수. (`gameState`엔 이미 attendees 포함되어 있으므로 deps만 추가하면 됨. setup phase에선 autoSync가 비활성이라 영향 없음.)

---

## 6. 경기별 출전선수 스냅샷

**문제**: `CREATE_SOCCER_MATCH`(reducer `useGameReducer.js` 765~779)가 `lineup/gk/defenders`만 저장하고 `subs`는 match에 없음. 명단을 바꾸면 "그 경기에 누가 있었나"를 후보까지 온전히 복원 불가.

**변경**:

- `SoccerMatchView.handleFormationConfirm`이 `onCreateMatch`에 `subs`도 전달.
- `CREATE_SOCCER_MATCH` 리듀서가 match 객체에 `subs: string[]` 저장. (선발 `lineup` + 후보 `subs` = 그 경기 출전 가능 스쿼드 스냅샷)
- 기존 match를 읽는 곳(요약/시트 빌더)이 `subs` 없을 때 깨지지 않도록 `subs || []` 방어.

> 진실 소스 시트(포인트 로그/선수별 집계)는 건드리지 않음. `subs`는 active 게임 state/스냅샷 용도. 시트 빌더 변경이 필요하면 별도 승인.

---

## 7. 스쿼드 선택 — 탭-탭 양끝 선택

**대상**: `FormationSetup.jsx` (스쿼드 선택창). 경기 중 교체(`FormationRecorder` sub 모달)는 범위 외.

**모델**: 상태 `selectedPlayer`(선수명|null) 추가. 기존 `selectingPos`(슬롯idx|null)와 **둘 중 하나만** 활성.

- **선수 목록 상시 노출**: 미배치 선수 칩들을 피치 아래에 항상 표시(현재처럼 슬롯 탭해야 뜨는 것 아님).
- 선수 칩 탭: `selectingPos`가 있으면 그 슬롯에 배치 / 없으면 `selectedPlayer`로 하이라이트(같은 선수 재탭 시 해제).
- 빈 슬롯 탭: `selectedPlayer`가 있으면 거기 배치 / 없으면 그 슬롯을 `selectingPos`로 하이라이트.
- 점유 슬롯 탭: `selectedPlayer` 없으면 해제(후보로 복귀) / `selectedPlayer` 있으면 **스왑**(기존 선수 후보로, 선택 선수 배치).
- 시각: 선택 선수 칩 강조 + 선택 시 빈 슬롯들 살짝 글로우(힌트). 슬롯 하이라이트는 기존 흰 글로우(`highlightIdx`) 재사용.
- 드래그 없음(탭-탭만, 모바일 안정성).
- `경기 시작`(11명) 조건, `gk`/`positionMap`/`subs` 산출 로직 유지.

`FormationPitch.jsx`: 선수 선택 중일 때 빈 슬롯 글로우 힌트용 prop(예: `pendingPlayer`) 소폭 추가. onEmptyTap/onPlayerTap 시그니처는 유지.

---

## 8. 헤더 "홈" 버튼 대비 수정

**문제**: 기본 테마는 **light**(`useTheme` 기본값 "light"). `C.white`=`--app-text-primary`라 밝은 테마에선 검은 글씨 → 제목은 잘 보임. 그러나 `SoccerApp.jsx:358` 홈 버튼은 **하드코딩 `color:"#fff"`**(리터럴 흰색) + `background: rgba(255,255,255,0.15)` → 밝은 헤더에서 안 보임.

**변경**: 이미 정의된 전용 헤더 토큰 사용 — `background: C.headerBtnBg`, `color: C.headerBtnDimColor`(또는 `C.headerBtnColor`). 밝은/어두운 테마 모두 대비 확보.

**[리뷰 발견 D] 같은 문제의 다른 버튼들**: setup phase 헤더의 **메뉴(line 305)·로그아웃(line 306) 버튼과 사용자명(line 304)**도 동일하게 하드코딩 `rgba(255,255,255,0.7)`/`rgba(255,255,255,0.15)` → 밝은 테마에서 흐릿. 함께 토큰화.

---

## 손대는 파일

| 파일 | 변경 |
|---|---|
| `src/services/sheetService.js` | `fetchSheetData`에 "상대팀명" 표 파싱 → `opponents:[{name,games}]` |
| `src/SoccerApp.jsx` | setup 재구성(참석팀 섹션·자동진입 제거하되 attendees는 prefill), `opponentSuggestions` 로드, 참석팀/명단수정 핸들러, 헤더 버튼 색(358·305·306·304), **autoSync deps에 `attendees` 추가**, line 413 fallback 정리 |
| `src/components/game/AttendeeSelector.jsx` | **(신규)** 명단 선택 UI 추출 — setup·명단수정 공용 |
| `src/components/game/OpponentSelector.jsx` | 오늘 참석팀 노출 + (선택) 자주 강조 + 즉석추가 |
| `src/components/game/SoccerMatchView.jsx` | "명단 수정" 진입점, `subs` 전달, 참석팀 prop |
| `src/components/game/FormationSetup.jsx` | 탭-탭 양끝 선택, 선수목록 상시 노출 |
| `src/components/game/FormationPitch.jsx` | 선수 선택 시 빈 슬롯 힌트 글로우 |
| `src/hooks/useGameReducer.js` | `CREATE_SOCCER_MATCH`에 `subs` 저장 |
| `src/components/common/SettingsScreen.jsx` | "상대팀 관리" 섹션 제거 (시트가 소스가 됨 — 사용자 확인 후) |

## 구현 단계 (의존 순서)

1. **시트 상대팀 파싱** — `fetchSheetData` 확장 + 라이브 시트로 검증.
2. **초기세팅 재구성** — 자동진입 제거, 참석팀 섹션, `opponentSuggestions` 로드.
3. **경기 선택을 참석팀 기준으로** — `OpponentSelector`/`SoccerMatchView` 배선.
4. **명단 경기중 수정 + 경기별 스냅샷(`subs`)**.
5. **스쿼드 탭-탭** — `FormationSetup`/`FormationPitch`.
6. **헤더 홈 버튼 색** (독립, 아무때나).

각 단계는 기존 테스트(vitest)와 Playwright로 회귀 확인. 실시간 다중탭 동기화(참석팀/명단/스쿼드 변경 전파)는 단계 2~5 후 점검.

## 리뷰 검증 메모 (코드로 확인한 안전성)

- **`state.opponents` 재정의는 안전**: 전체 사용처 grep 결과, `state.opponents`를 읽는 곳은 `gameState`(동기화)·`OpponentSelector`뿐. 기록확정/시트 빌더는 `match.opponent`(스냅샷 문자열)만 읽고 `state.opponents`는 안 읽음 → 의미 변경해도 기록 안 깨짐.
- **`START_MATCHES`가 `opponents`를 보존**: 리듀서(745~763)가 `soccerMatches`/`currentMatchIdx`는 리셋하지만 `opponents`는 안 건드림 → setup에서 정한 오늘 참석팀이 match phase로 그대로 넘어감.
- **동기화 경로 정상**: `opponents`는 `firebaseSyncDiff` WHOLE_REPLACE(line 14) + `reconstructState`(218) + `RESTORE_STATE`(useGameReducer 276) 모두 처리됨 → 오늘 참석팀이 다중 탭에 실시간 전파/복원됨. (단 발견 C의 attendees deps 수정 필요)
- **`opponentSuggestions` 미동기화 영향 없음**: setup의 빠른선택·정렬에만 쓰임. match phase의 `OpponentSelector`는 동기화되는 `state.opponents`를 쓰므로 복원 탭에서도 정상.
- **setup엔 새 phase 불필요**: 참석팀 섹션은 기존 setup 화면에 `s.section` 하나 더 추가. `PhaseIndicator activeIndex=0` 유지.

## 결정 완료 (사용자 확인됨)

1. **`SettingsScreen` "상대팀 관리" 섹션 → 제거** (시트가 소스).
2. **OpponentSelector "자주 강조" 배지 → 생략** (단순화).

## 범위 밖 (이번에 안 함)

- 장소(venue).
- 경기 도중 즉시 명단 편집(교체로 대체).
- 진실 소스 시트(포인트/선수별 집계) 스키마 변경.
- 상대팀 통계(승/무/패/득실)의 앱 내 표시 — 이번엔 팀명·경기수만 사용.
