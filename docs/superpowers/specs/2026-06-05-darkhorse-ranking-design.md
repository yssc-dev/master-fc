# 다크호스 랭킹 (선수분석 > 어워드 탭)

작성일: 2026-06-05

## 목표

선수분석 어워드 탭에 **🐎 다크호스 랭킹**을 추가한다. "용병으로 뛰었을 때 잘하는(팀을 살리는) 선수"를 누적 기준 TOP N으로 노출하고, **본팀일 때 대비 향상도(Δ)**를 함께 보여줘 "용병일 때 더 잘하나?"라는 질문에 답한다.

## 핵심 전제 — 용병 감지 (스키마 변경 없음)

용병 여부를 표시하는 컬럼은 어디에도 없다. 대신 **추론**한다:

- `로그_선수경기`(PG)의 `session_team` = 그 세션 최초 팀편성에서 선수의 소속팀명. 이미 모든 PG 객체에 실려 옴(클라이언트 추가 작업 0, Apps Script/시트 변경 0).
- `로그_매치`의 `our_team_name`/`opponent_team_name` = 그 경기에서 각 팀의 이름. `session_team`과 **동일한 `state.teamNames` 소스·동일 정규화** → 문자열 매칭 조인 신뢰 가능.
- 판정: 어떤 경기에서 선수가 **자기 `session_team`이 아닌 팀 이름**으로 명단에 들어가 있으면 = 그 경기는 **용병 출전**. 같으면 **본팀 출전**.
- 과거 로그에도 소급 적용된다.

**사각지대**: 어느 팀에도 배정 안 된 순수 외부 게스트는 `session_team`이 비어 있음(`""`) → 본팀 기준선이 없어 비교 불가. **다크호스 랭킹에서 제외**한다(해당 선수의 모든 출전을 집계에서 스킵).

## 데이터 소스 / 필드

| 소스 | 사용 필드 |
|---|---|
| `로그_매치` (matchLogs) | `date`, `match_id`, `our_team_name`, `opponent_team_name`, `our_members_json`, `opponent_members_json`, `our_score`, `opponent_score`, `is_extra` |
| `로그_선수경기` (playerGameLogs) | `player`, `date`, `session_team` |
| `로그_이벤트` (eventLogs) | `match_id`, `event_type`('goal')`, `player`(득점), `related_player`(어시) |

`is_extra=true` 매치는 제외(다른 분석과 일관). 명단 파싱은 `parseActualPlayers`(휴식 제외) 재사용.

## 새 순수함수 `src/utils/analyticsV2/calcDarkhorse.js`

시그니처:

```js
calcDarkhorse({ matchLogs, playerGameLogs, eventLogs, minMercGames = 4, topN = 5 })
  → { ranking: Row[] }
```

`Row` 필드:
- `player`
- `mercGames`, `mercWinRate`, `mercContrib`(G+A/경기), `mercConceded`(팀실점/경기)
- `ownGames`, `ownWinRate`, `ownContrib`, `ownConceded` (본팀 표본 없으면 `null`)
- `dWin`, `dContrib`, `dConceded` (용병 − 본팀; 본팀 표본 없으면 `null`)

### 알고리즘

1. **본팀 룩업**: `baseTeam[`${date}|${player}`] = session_team` (빈 문자열은 등록 안 함) — playerGameLogs에서 구성.
2. **매치 패스**: 각 매치에서 양 팀을 처리.
   - our 측: 명단=`parseActualPlayers(our_members_json)`, 팀명=`our_team_name`, 팀점수=`our_score`, 실점=`opponent_score`, 승=`our>opp`, 무=`our===opp`.
   - opp 측: 명단=`parseActualPlayers(opponent_members_json)`, 팀명=`opponent_team_name`, 팀점수=`opponent_score`, 실점=`our_score`, 승=`opp>our`, 무 동일.
   - 한 매치 내 `seen` 셋으로 같은 선수 양면 중복 집계 방지(calcPlayerSummary와 동일 패턴).
   - 각 선수: `base = baseTeam[date|name]`; `base` 없으면 **스킵(게스트)**. `bucket = base===팀명 ? 'own' : 'merc'`.
   - 누적: `games++`, `wins += 승`, `draws += 무`, `conceded += 실점`.
   - 이벤트 귀속용 맵: `flag[`${match_id}|${name}`] = bucket`.
3. **이벤트 패스**(G+A 귀속): 각 goal 이벤트에서 `player`(득점)·`related_player`(어시) 각각 `flag[match_id|name]`이 있으면 해당 bucket의 `ga++`. (match_id 없는 레거시 행은 G+A 미반영 — 승률/실점은 영향 없음.)
4. **행 생성**: `mercGames >= minMercGames`인 선수만. 비율 계산 후 Δ 산출(본팀 표본 있을 때만).
5. **정렬**: `mercWinRate` 내림차순 → `mercContrib` 내림차순 → `player` 한글 정렬. `topN` 슬라이스.

### 정렬 기준 결정 (승인됨: A안)

용병 승률 1차 정렬. 복합 가중점수(C안)는 v1에서 채택하지 않음(가중치 임의성·설명력 저하, YAGNI). 향상도(Δ)는 **정렬이 아니라 표시 컬럼**으로 다크호스성을 드러낸다.

## UI — AwardsTab 새 섹션

위치: `월별 랭킹` 아래에 `🐎 다크호스 (용병 출전 시 성과)` 카드 추가. 이미 로드된 `matchLogs/playerGameLogs/eventLogs` 재사용(추가 fetch 없음). `useMemo`로 `calcDarkhorse` 호출.

행 표시(모바일 고려, 컴팩트):
```
#1 이영문   용병 6경기
   승률 67% (Δ +9%p)   G+A 1.2 (Δ +0.3)   실점 1.5 (Δ -0.4)
```
- Δ 양수=향상은 초록, 음수는 회색/주황(실점은 부호 반대로 해석: 실점 Δ 음수가 좋음 → 초록).
- 본팀 표본 없으면 Δ 자리에 `본팀기록 없음` 표기.
- 표본 부족(랭킹 비었으면) `표본 부족` 문구(기존 카드와 동일 패턴).

## 테스트 `src/utils/analyticsV2/calcDarkhorse.test.js`

- 용병/본팀 분리: session_team≠팀명 경기는 merc, =팀명 경기는 own으로 집계.
- 양 팀 모두 처리: opponent 측 용병도 잡힘.
- G+A 귀속: 용병 경기의 골/어시는 mercContrib에, 본팀 경기 골은 ownContrib에.
- 실점 분리: 팀 실점이 올바른 bucket에 누적.
- minMercGames 미달 선수 제외.
- session_team="" 게스트 제외.
- is_extra 매치 제외.
- 정렬: mercWinRate 내림차순, 동률 시 mercContrib.

## 비목표 (YAGNI)

- 월별/기간 필터(누적 고정).
- 복합 다크호스 점수.
- 개인 상세 비교 카드(랭킹만).
- GK 개인 실점 vs 팀 실점 구분(팀 실점/경기로 통일, 라벨로 명시).
- 스키마/Apps Script 변경.
