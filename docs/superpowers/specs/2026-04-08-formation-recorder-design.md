# 시각적 포메이션 경기 기록 시스템 설계

## 개요

현재 텍스트 기반 라인업 선택 + 이벤트 버튼 방식을 **피치 그래픽 기반 포메이션 UI**로 교체한다. 포메이션 위에서 선수를 탭하여 골/어시/교체 등 모든 이벤트를 직관적으로 입력한다.

## 핵심 결정사항

| 항목 | 결정 |
|------|------|
| 포메이션 | 프리셋 6종 + 커스텀 미세 조정 |
| 골 이벤트 | 선수 탭 → 바로 액션 메뉴 (⚽골/🅰️어시/🔴자책) |
| 상대골 | 하단 별도 버튼 |
| 교체 | 하단 🔄 교체 버튼 → 나가는 선수 + 후보 선수 선택 |
| 포메이션 변경 | 하단 버튼 → 새 프리셋 선택 → 선수 자동 재배치 |
| 상태 저장 | Firebase 자동 저장, 재접속 시 복원 |

---

## 전체 흐름

### Step 1: 출전명단 선택

- 대시보드 전체 인원 표시
- 탭하여 출전 선수 체크 (11~18명, 스타팅 11 + 후보)
- "다음" 버튼 → Step 2로

### Step 2: 포메이션 선택 + 선수 배치

- 포메이션 프리셋 선택 (4-4-2, 4-3-3, 3-5-2, 4-2-3-1, 3-4-3, 5-3-2)
- 세로 피치 그래픽에 포지션 원형 11개 표시
- 각 포지션 원형 탭 → 출전명단에서 선수 선택
- GK는 1명만 (자동 고정)
- 배치된 선수 외 나머지 = 후보석 표시
- 11명 배치 완료 → "경기 시작" 버튼

### Step 3: 경기 진행

**피치 화면:**
- 상단: 스코어보드 (우리팀 스코어 vs 상대팀 스코어)
- 중앙: 포메이션 피치 (선수 원형 배치)
- 하단: [⚽ 상대골] [🔄 교체] [📋 포메이션 변경] [🏁 경기 종료]
- 하단 아래: 후보 선수 목록 + 이벤트 로그

**선수 탭 → 액션 메뉴:**
1. 선수 이름을 탭
2. 팝업 메뉴: ⚽ 골 / 🅰️ 어시스트 / 🔴 자책골
3. ⚽ 골 선택 시 → "어시스트 선수 선택" (피치 위 다른 선수 탭 또는 "없음")
4. 🅰️ 어시스트 선택 시 → "골 선수 선택" (피치 위 다른 선수 탭)
5. 🔴 자책골 선택 시 → 즉시 기록

**⚽ 상대골 버튼:**
- 탭 → confirm → 현재 GK 자동 연결하여 실점 기록

**🔄 교체 버튼:**
1. 나가는 선수 선택 (피치 위 11명)
2. 들어오는 선수 선택 (후보석)
3. 포지션 자동 승계 (나가는 선수의 포지션을 그대로)
4. 피치 위 선수 교체 반영

**📋 포메이션 변경:**
1. 새 프리셋 선택
2. 현재 11명 유지, 좌표만 재배치
3. 포지션 태그(GK/DF/MF/FW) 새 포메이션에 맞게 재할당

### Step 4: 경기 종료

- 🏁 경기 종료 버튼 → 결과 확인 confirm
- 이벤트로그 저장 + 선수기록(대시보드) 집계 + 일정 스코어 업데이트
- 결과 요약 화면

---

## 포메이션 프리셋 데이터

각 프리셋은 11개 포지션의 좌표(x%, y%)와 포지션 태그를 정의.
피치는 세로 방향 (상단=상대 골대, 하단=우리 골대).

```js
const FORMATIONS = {
  "4-4-2": {
    label: "4-4-2",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 15, y: 75, role: "DF" }, { x: 38, y: 78, role: "DF" }, { x: 62, y: 78, role: "DF" }, { x: 85, y: 75, role: "DF" },
      { x: 15, y: 50, role: "MF" }, { x: 38, y: 53, role: "MF" }, { x: 62, y: 53, role: "MF" }, { x: 85, y: 50, role: "MF" },
      { x: 35, y: 25, role: "FW" }, { x: 65, y: 25, role: "FW" },
    ],
  },
  "4-3-3": {
    label: "4-3-3",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 15, y: 75, role: "DF" }, { x: 38, y: 78, role: "DF" }, { x: 62, y: 78, role: "DF" }, { x: 85, y: 75, role: "DF" },
      { x: 25, y: 52, role: "MF" }, { x: 50, y: 48, role: "MF" }, { x: 75, y: 52, role: "MF" },
      { x: 20, y: 25, role: "FW" }, { x: 50, y: 20, role: "FW" }, { x: 80, y: 25, role: "FW" },
    ],
  },
  "3-5-2": {
    label: "3-5-2",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 25, y: 78, role: "DF" }, { x: 50, y: 80, role: "DF" }, { x: 75, y: 78, role: "DF" },
      { x: 10, y: 55, role: "MF" }, { x: 30, y: 50, role: "MF" }, { x: 50, y: 48, role: "MF" }, { x: 70, y: 50, role: "MF" }, { x: 90, y: 55, role: "MF" },
      { x: 35, y: 25, role: "FW" }, { x: 65, y: 25, role: "FW" },
    ],
  },
  "4-2-3-1": {
    label: "4-2-3-1",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 15, y: 75, role: "DF" }, { x: 38, y: 78, role: "DF" }, { x: 62, y: 78, role: "DF" }, { x: 85, y: 75, role: "DF" },
      { x: 35, y: 58, role: "MF" }, { x: 65, y: 58, role: "MF" },
      { x: 20, y: 38, role: "MF" }, { x: 50, y: 35, role: "MF" }, { x: 80, y: 38, role: "MF" },
      { x: 50, y: 18, role: "FW" },
    ],
  },
  "3-4-3": {
    label: "3-4-3",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 25, y: 78, role: "DF" }, { x: 50, y: 80, role: "DF" }, { x: 75, y: 78, role: "DF" },
      { x: 15, y: 52, role: "MF" }, { x: 40, y: 50, role: "MF" }, { x: 60, y: 50, role: "MF" }, { x: 85, y: 52, role: "MF" },
      { x: 20, y: 25, role: "FW" }, { x: 50, y: 20, role: "FW" }, { x: 80, y: 25, role: "FW" },
    ],
  },
  "5-3-2": {
    label: "5-3-2",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 10, y: 72, role: "DF" }, { x: 30, y: 78, role: "DF" }, { x: 50, y: 80, role: "DF" }, { x: 70, y: 78, role: "DF" }, { x: 90, y: 72, role: "DF" },
      { x: 25, y: 50, role: "MF" }, { x: 50, y: 48, role: "MF" }, { x: 75, y: 50, role: "MF" },
      { x: 35, y: 25, role: "FW" }, { x: 65, y: 25, role: "FW" },
    ],
  },
};
```

---

## 이벤트 타입 (MF 추가)

| 이벤트 | 포지션 |
|-------|-------|
| 출전 | GK / DF / MF / FW |
| 골 | (기록 시 포지션 불필요) |
| 자책골 | (기록 시 포지션 불필요) |
| 실점 | GK |
| 교체 | 승계 포지션 (GK/DF/MF/FW) |

---

## 상태 저장 (Firebase 자동 저장)

경기 진행 중 상태를 Firebase에 자동 저장하여 로그아웃/재접속 시 복원.

### Firebase 경로

```
tournaments/{팀이름}/{대회ID}/activeGame: {
  matchNum: number,
  phase: "roster" | "formation" | "playing" | "finished",
  selectedPlayers: string[],     // 출전명단
  formation: string,              // 현재 포메이션 키 ("4-4-2" 등)
  assignments: { posIdx: playerName }[], // 포지션별 선수 배치
  subs: string[],                 // 후보 선수
  events: Event[],                // 경기 이벤트
  opponent: string,               // 상대팀
  startedAt: number,              // 경기 시작 timestamp
  updatedAt: number,
}
```

### 자동 저장 타이밍

- 출전명단 변경 시
- 포메이션/선수 배치 변경 시
- 이벤트 추가/삭제 시
- 교체 시

### 복원 흐름

1. 대회 경기관리 탭 진입 시 Firebase에서 activeGame 확인
2. activeGame 있으면 → phase에 따라 해당 화면으로 복원
3. 없으면 → 경기 목록 표시 (기존 흐름)

---

## 아키텍처 (컴포넌트)

### 교체 대상 파일

| 파일 | 변경 |
|------|------|
| `src/components/game/LineupSelector.jsx` | 삭제 또는 미사용 (FormationView가 대체) |
| `src/components/game/SoccerRecorder.jsx` | 삭제 또는 미사용 (FormationView가 대체) |
| `src/components/game/SubstitutionModal.jsx` | 유지 (교체 모달은 재사용 가능, 포지션 데이터만 개선) |
| `src/components/tournament/TournamentMatchManager.jsx` | FormationRecorder 사용으로 변경 |

### 새로 만들 파일

| 파일 | 역할 |
|------|------|
| `src/utils/formations.js` | 포메이션 프리셋 데이터 (좌표 + 포지션 태그) |
| `src/components/game/RosterSelector.jsx` | Step 1: 출전명단 선택 (전체 → 체크) |
| `src/components/game/FormationSetup.jsx` | Step 2: 포메이션 선택 + 선수 배치 |
| `src/components/game/FormationPitch.jsx` | 피치 그래픽 (SVG/div 기반, 선수 원형 표시) |
| `src/components/game/FormationRecorder.jsx` | Step 3: 경기 진행 (피치 + 액션 메뉴 + 이벤트) |
| `src/components/game/PlayerActionMenu.jsx` | 선수 탭 시 액션 팝업 (골/어시/자책) |

### 기존 재사용

| 파일 | 재사용 |
|------|-------|
| `src/utils/soccerScoring.js` | 스코어 계산, 이벤트로그 빌드 |
| `src/services/appSync.js` | 대회 API |
| `src/services/firebaseSync.js` | 상태 자동 저장 |

---

## 적용 범위

- **1차: 대회 모드** — TournamentMatchManager에서 FormationRecorder 사용
- **2차: 축구 리그** — App.jsx 축구 모드에서도 FormationRecorder로 교체 가능 (추후)
- **풋살** — 기존 CourtRecorder 유지 (변경 없음)

---

## 범위 밖 (추후)

- 드래그로 선수 위치 미세 조정
- 히트맵/터치맵
- 포메이션 애니메이션
- 경기 중 실시간 포메이션 공유
