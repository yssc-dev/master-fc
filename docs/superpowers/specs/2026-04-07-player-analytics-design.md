# 선수 분석 3종 (육각형 차트 + 시너지 + 시간대) 설계 문서

## 개요

기존 분석 탭에 3개 탭을 추가한다. 과거 확정 경기의 상태JSON에서 팀 편성/GK/스코어 등 로우데이터를 추출하여, 기존 집계 로그만으로는 불가능했던 수비력/시너지/시간대 패턴을 분석한다.

---

## 1. 공통 데이터 소스

### 상태JSON 파싱
- `앱_경기상태` 시트의 `상태JSON` 컬럼에 확정된 경기의 전체 gameState가 저장됨
- 파싱 대상 필드: `teams`, `teamNames`, `completedMatches`, `allEvents`, `gks`, `gksHistory`, `attendees`
- 분석 페이지 진입 시 한 번 로드 → 가공 → 메모리 캐싱

### 가공 결과물
상태JSON을 파싱하여 다음 구조를 생성:

```
gameRecords: [{
  gameDate: string,
  teams: [[선수명, ...], ...],       // 팀별 선수 배열
  teamNames: [string, ...],          // 팀명
  matches: [{                         // completedMatches
    matchId, homeIdx, awayIdx, homeTeam, awayTeam,
    homeScore, awayScore, homeGk, awayGk,
  }],
  events: [{                          // allEvents
    type, matchId, player, assist, timestamp, ...
  }],
}]
```

### 기존 데이터 소스 (보조)
- `playerLog`: 경기별 골/어시/역주행/클린시트/키퍼경기수/실점률
- `pointLog`: 이벤트 단위 득점/어시 기록

---

## 2. 선수카드 탭 (육각형 레이더 차트)

### 6축 정의

| 축 | 계산 | 소스 | 높을수록 |
|---|---|---|---|
| 득점력 | 골 / 경기수 | playerLog | 경기당 골이 많음 |
| 창의력 | 어시 / 경기수 | playerLog | 경기당 어시가 많음 |
| 수비력 | 필드 플레이 시 팀 평균 실점의 역수 | 상태JSON | 필드에 있을 때 팀 실점이 적음 |
| 키퍼 | 키퍼 실점률의 역수, GK 경기 없으면 0 | playerLog | 실점률이 낮음 |
| 참석률 | 경기수 / 전체 경기수 | playerLog | 참석 빈도 높음 |
| 승리기여 | 소속팀 승률 | 상태JSON | 이 선수 팀이 자주 이김 |

### 수비력 계산 상세
1. 상태JSON에서 각 경기의 팀 편성 + GK 배정 추출
2. 해당 선수가 출전한 경기 중 GK가 아닌 경기 필터
3. 그 경기들에서 소속팀의 평균 실점 계산
4. 낮을수록 수비력 높음 → 역수 변환하여 정규화

### 승리기여 계산 상세
1. 상태JSON에서 각 경기의 팀별 승/무/패 결정
2. 해당 선수가 소속된 팀의 승률 계산 (승리=1, 무승부=0.5, 패=0)

### 정규화
- 각 축은 전체 선수 기준 백분위(0~100)로 정규화
- 예: 득점력 1위 = 100, 최하위 = 0
- 최소 3경기 이상 참가 선수만 표시

### UI
- 선수 선택 드롭다운
- SVG 육각형 레이더 차트
- 킬러(득점력↑) / 메이커(창의력↑) / 올라운더(균형) 뱃지 표시
- 6축 수치 텍스트로도 표시

---

## 3. 시너지 탭

### 데이터 추출
- 상태JSON에서 각 경기의 팀 편성 추출
- 두 선수가 같은 팀에 있었던 경기를 찾아 승/무/패 집계

### 계산
```
시너지(A, B) = {
  gamesPlayed: A와 B가 같은 팀이었던 경기 수,
  wins: 그 중 승리 수,
  draws: 무승부 수,
  losses: 패배 수,
  winRate: (wins + draws * 0.5) / gamesPlayed,
}
```

### UI
- 선수 선택 드롭다운
- "이 선수와 같은 팀일 때" 상위 시너지 TOP 5 (승률 높은 동료)
- 하위 시너지 TOP 5 (승률 낮은 동료)
- 최소 2경기 이상 같은 팀이었던 조합만 표시
- 각 항목: 동료 이름, 함께한 경기수, 승-무-패, 승률

---

## 4. 시간대 패턴 탭

### 데이터 추출
- 상태JSON의 allEvents에서 timestamp 활용
- 같은 matchId 내 첫 번째 이벤트의 timestamp를 0분 기준
- 각 이벤트의 상대 시간(분) = (timestamp - firstTimestamp) / 60000

### 구간 분류
- 전반: 0~10분 (첫 이벤트 기준)
- 후반: 10분~

### UI
- 전체 선수 대상 전반/후반 골 비율 바 차트
- 또는 선수 선택 → 개인별 시간대 골 분포
- 한계 표시: "첫 골 이전 시간은 측정 불가, 참고용"

---

## 5. 기존 코드 변경

### 새 파일
- `src/utils/gameStateAnalyzer.js`: 상태JSON 파싱 + 가공 유틸리티
- `src/components/dashboard/PlayerCardTab.jsx`: 육각형 차트 탭
- `src/components/dashboard/SynergyTab.jsx`: 시너지 탭
- `src/components/dashboard/TimePatternTab.jsx`: 시간대 패턴 탭

### 수정 파일
- `src/components/dashboard/PlayerAnalytics.jsx`: 3개 탭 추가
- `src/services/appSync.js`: 상태JSON 로드 API (기존 `getHistory`와 유사하지만 stateJson 포함)
- `apps-script/Code.js`: 확정 경기 상태JSON 반환 API (기존 `_getHistory`에 stateJson 포함 여부 확인)

### Code.js 변경 여부
기존 `_getHistory`가 이미 `stateJson`을 반환하는지 확인 필요. 반환하면 추가 변경 없음.
