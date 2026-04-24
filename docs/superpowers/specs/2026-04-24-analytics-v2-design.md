# 분석탭 확장 (Analytics V2) 설계

- **작성일**: 2026-04-24
- **상태**: 설계 승인 대기
- **배경**: 통합 로그(로그_이벤트 / 로그_선수경기 / 로그_매치)로 데이터 소스가 일원화되어, 이전에는 계산 불가능했던 지표(경기 승률, 조합 시너지 등)를 산출할 수 있게 됨. 기존 분석탭을 확장해 개인·조합·재미 세 축의 지표를 확충한다.

---

## 1. 목표

- 통합 로그 기반의 새로운 분석 지표 10종을 분석탭에 추가한다.
- 기존 `PlayerAnalytics.jsx`는 파일로 백업(Legacy)하여 원복 가능성을 확보한다.
- 지표 계산 로직은 순수 함수로 분리해 테스트 가능하게 한다.

## 2. 비목표

- 새로운 시트/Firebase 스키마 변경. 기존 3종 로그 스키마만 소비한다.
- 대시보드 홈의 구성 변경. 분석탭 내부만 다룬다.
- 관리자 권한 추가. 기존 권한 체계를 그대로 따른다.

## 3. 사용자 & 유스케이스

- **일반 선수**: "내 기록 추세", "내가 잘한 세션", "친한 팀원과의 시너지"를 궁금해한다.
- **주장/관리자**: 팀 구성 참고용으로 시너지 매트릭스·골든 트리오를 본다.
- **재미 중심 사용자**: 어워드(불꽃/수호신/자책) + 🍀/🍠 랭킹으로 엔터테인먼트 소비.

## 4. 확정 지표 10종

| # | 그룹 | 지표 | 핵심 정의 |
|---|---|---|---|
| ① | 개인 | 트렌드 라인 | 최근 12세션 경기당 G/A/승률 (3세션 이동평균) |
| ② | 개인 | 연속 기록 | 연속 득점 세션 / GK 연속 무실점 (현재/역대최고) |
| ③ | 개인 | PR | 단일 세션 최다골·최다어시·GK 최장 무실점·최고 rank_score |
| ④ | 개인 | 월별 랭킹 | YYYY-MM 기준 G/A/승률 TOP5 (최근 3개월 전환) |
| ⑤ | 조합 | 시너지 매트릭스 | N×N 같은팀 라운드 팀승률 (대각선=개인승률, 최소 5라운드) |
| ⑥ | 조합 | 골든 트리오 | 3인 조합 승률 TOP5 (최소 3라운드) |
| ⑧ | 재미 | 불꽃 | goals≥3 세션 카운트 TOP5 |
| ⑨ | 재미 | 수호신 | 세션 내 전 GK경기(≥2) 무실점 달성 TOP5 |
| ⑪ | 재미 | 자책 랭킹 | 누적 owngoals TOP3 |
| ⑫ | 재미 | 🍀/🍠 랭킹 | 크로바/고구마 누적+최근3개월 (마스터FC 프리셋 전용) |

※ 번호는 브레인스토밍 원안 번호를 유지. 7(천적 매트릭스)·10(역전극)은 이번 범위에서 제외.

## 5. UI 구조

분석탭 내 6개 탭으로 재구성:

```
[개인]
  선수카드       — 기존 레이더/뱃지/GK-필드split 유지 + ①트렌드 + ②연속기록을 하단에 확장
  명예의전당     — ③PR + ④월별랭킹

[조합]
  시너지매트릭스 — ⑤
  골든트리오     — ⑥

[재미]
  어워드         — ⑧불꽃 + ⑨수호신 + ⑪자책 카드 리스트
  🍀/🍠랭킹     — ⑫ (마스터FC 조건부 노출)
```

- 조건부: `settings.teamPreset === '마스터FC' && settings.useCrovaGoguma` 일 때만 🍀/🍠 탭 노출.
- 기존 탭(키퍼킬러/시즌레이스/골든콤비/득점콤비/시너지/시간대)은 Legacy 파일에 보존, 신규 버전 탭바에서는 제거.

## 6. 데이터 소스 매핑

| 지표 | 로그_선수경기 | 로그_이벤트 | 로그_매치 |
|---|---|---|---|
| ① 트렌드 | ✅ G/A/세션 | - | ✅ 승률 산출 |
| ② 스트릭 | ✅ | - | ✅ GK 무실점 |
| ③ PR | ✅ | - | ✅ GK 연속 |
| ④ 월별 랭킹 | ✅ | - | ✅ 승률 |
| ⑤ 시너지 매트릭스 | - | - | ✅ members_json+승패 |
| ⑥ 골든 트리오 | - | - | ✅ |
| ⑧ 불꽃 | ✅ | - | - |
| ⑨ 수호신 | ✅ keeper_games+conceded | - | - |
| ⑪ 자책 | ✅ owngoals | - | - |
| ⑫ 🍀/🍠 | ✅ crova/goguma | - | - |

로드는 분석탭 초기 1회 `Promise.all` 병렬 fetch. 팀·스포츠 필터 후 각 탭에서 `useMemo` 캐시.

## 7. 파일 구조

### 백업
```
src/components/dashboard/
  PlayerAnalytics.jsx          ← 신규 (V2 오케스트레이터)
  PlayerAnalyticsLegacy.jsx    ← 기존 코드 그대로 복사 (원복용)
```

원복 절차: `App.jsx`의 `import PlayerAnalytics from '...PlayerAnalytics'` 를 `...PlayerAnalyticsLegacy`로 변경 한 줄.

### 신규 탭 컴포넌트
```
src/components/dashboard/analytics/
  PlayerCardTab.jsx            — 기존 기능 + 트렌드/스트릭 하단 확장
  HallOfFameTab.jsx            — PR + 월별랭킹
  SynergyMatrixTab.jsx         — N×N 히트맵
  GoldenTrioTab.jsx            — 3인 조합 TOP5
  AwardsTab.jsx                — 불꽃/수호신/자책 카드 리스트
  CrovaGogumaRankTab.jsx       — 🍀/🍠 랭킹
```

### 지표 계산 순수 함수
```
src/utils/analyticsV2/
  calcTrends.js                — 월별 G/A/승률 + 이동평균
  calcStreaks.js               — 득점/무실점 스트릭
  calcPersonalRecords.js       — PR
  calcMonthlyRanking.js        — 월별 TOP5
  calcSynergyMatrix.js         — N×N 팀승률
  calcGoldenTrio.js            — 3인 조합 승률
  calcAwards.js                — 불꽃·수호신·자책
  __tests__/*.test.js          — vitest 단위 테스트
```

공통 입력 시그니처:
```js
type Input = {
  playerLogs: PlayerGameRow[];
  eventLogs: EventRow[];
  matchLogs: MatchRow[];
  options?: { minGames?, minSynergyRounds?, minTrioRounds?, ... };
};
```

## 8. 핵심 계산 로직

### ① 트렌드 라인
- 최근 12세션 (입력 기준 정렬)
- 각 세션 point = { date, gpg, apg, winRate(=팀승률 0~1) }
- 3세션 이동평균 스무딩 (세션<3이면 raw)
- Y축 3줄(G/A/승률) 색 구분

### ② 연속 기록
- **득점 스트릭**: 시간순 세션 배열에서 goals≥1 연속 최대 길이 + 현재 진행 길이
- **GK 무실점 스트릭**: keeper_games>0 & conceded=0 세션 연속
- 표시: "현재 N / 최고 M"

### ③ PR
- 최다골 = max(goals), 최다어시 = max(assists), GK 최장 무실점 = 연속길이 최대 (② 재활용), 최고 rank_score
- 각 record마다 달성 날짜 병기

### ④ 월별 랭킹
- YYYY-MM groupBy (player, year_month)
- 월별 goals·assists·winRate로 각각 TOP5
- 탭 내 월 선택 드롭다운 (기본값: 이번 달). 이전 월로 넘겨볼 수 있음

### ⑤ 시너지 매트릭스
- 로그_매치 각 row에서 `our_members_json` 파싱 → 멤버 집합
- 동일 팀 2인 쌍(combinations(2))마다 (승/무/패) 집계
- 셀 값 = 승률 (승 + 0.5*무) / 경기
- 셀 색: 파랑(≥60%), 회색(40~60%), 빨강(<40%). 표본<5 회색 처리
- 대각선(자기자신) = 개인 전체 승률
- hover tooltip에 경기수·승무패 병기

### ⑥ 골든 트리오
- 로그_매치 각 row의 `our_members_json`에서 3-조합 생성
- 3인 조합 key → (경기수, 승, 무, 패)
- 최소 3라운드 필터 → 승률 내림차순 TOP5
- 출력: "{A}+{B}+{C} · 5경기 4승1패 · 80%"

### ⑧ 불꽃
- 로그_선수경기에서 goals≥3 세션 필터 → 선수별 카운트
- 내림차순 TOP5, 동점은 최근 달성일 우선

### ⑨ 수호신
- 세션별로 grouping (player, date)
- keeper_games≥2 AND conceded=0 인 세션만 자격
- 선수별 자격 세션 수 내림차순 TOP5

### ⑪ 자책 랭킹
- 로그_선수경기 owngoals 누적 합 → TOP3
- owngoals=0 선수는 제외
- "😅" 이모지 + 자조적 코멘트 (고정 문구 한 줄)

### ⑫ 🍀/🍠 랭킹
- 기존 `calcCrovaGogumaFreq` 재사용
- 두 범위(누적 / 최근 3개월) 토글
- 🍀 TOP5 + 🍠 TOP5 좌우 병치

## 9. 최소 표본 기준

| 지표 | 최소 |
|---|---|
| ⑤ 시너지 매트릭스 | 같이 뛴 라운드 ≥5 |
| ⑥ 골든 트리오 | 같이 뛴 라운드 ≥3 |
| 선수카드 트렌드 | 세션 ≥3 (기존 기준 유지) |
| ④ 월별 랭킹 | 해당 월 세션 ≥1 |
| ⑧⑨ 불꽃/수호신 | 달성 이력 ≥1 |

옵션 객체로 외부 조정 가능 (`options.minSynergyRounds` 등).

## 10. 엣지 케이스

| 상황 | 처리 |
|---|---|
| 로그_매치 비어있음 | 시너지/골든트리오 탭에 "데이터 부족" 안내, 탭 진입은 허용 |
| 특정 선수 세션<3 | 트렌드 숨김, "데이터 누적 중" 표시 |
| 스트릭 진행중 vs 역대 | 둘 다 표시 |
| owngoals=0 | 자책 랭킹 제외 |
| 마스터FC 아님 | 🍀/🍠 탭 숨김 |
| 혼합 스포츠 | 현재 sport 필터 (기존 패턴) |

## 11. 테스트 전략

- `utils/analyticsV2/*` 각 함수에 대응하는 vitest 파일
- 고정 픽스처 입력 (예: `fixtures/sampleMatchLog.js`) 사용
- UI 컴포넌트는 수동 검증 (계산은 순수함수가 보장)

## 12. 출시 순서 (구현 단계 힌트)

구현 플랜은 별도 문서에서 상세히 다룬다. 러프 순서:
1. 백업 (기존 파일 복사)
2. `analyticsV2/` 순수 함수 + 테스트 작성
3. 신규 탭 컴포넌트 개별 구현
4. `PlayerAnalytics.jsx` 신규 오케스트레이터 작성
5. App.jsx import 연결 + 수동 검증
