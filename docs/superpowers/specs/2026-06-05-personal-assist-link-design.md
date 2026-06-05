# 나의 짝꿍 — 어시-골 연결(연결순) 설계

작성일: 2026-06-05

## 배경 / 문제

`나의 짝꿍`(PersonalSynergyCard)의 **케미**(`liftSymmetric`)는 승/무/패만으로
계산된다 — "같은 팀일 때 팀이 이기는 경향". 골·어시는 전혀 반영하지 않는다.
따라서 케미는 "같은 팀에 묻어간" 짝꿍과 "실제로 패스 주고받은" 짝꿍을 구분하지 못한다.

골/어시를 승률 케미에 **섞으면** 오염이다(골→승리 이중계산 + 공격 포지션 편향 +
단위 불일치). 따라서 둘이 **직접 합작한 골**을 측정하는 별도 지표를
독립 컬럼으로 추가한다.

기존 클럽 전체 `어시페어`(`calcAssistPairs`, ChemistryTab)는 그대로 둔다.
이번 작업은 그 **개인판** — 선택된 본인 기준.

## 정의

**연결 = 나(선택된 본인)와 그 짝꿍이 직접 합작한 골의 개수.**

`로그_이벤트`의 goal row 하나에는 득점자(`player`) + 어시(`related_player`) 한 쌍이
들어있다. 그 쌍이 정확히 `{나, 짝꿍}`이면 +1.

- **내어시** = 내가 `related_player`(어시), 짝꿍이 `player`(골)
- **내득점** = 내가 `player`(골), 짝꿍이 `related_player`(어시)
- 연결 total = 내어시 + 내득점

제외:
- 단독골(`related_player` 빈 값) — 합작 아님
- 자책골(`event_type === 'owngoal'`) — `goal` 조건에서 자동 제외
- 나·짝꿍 외 제3자가 낀 골 — 쌍이 `{나, 짝꿍}`이 아니므로 제외

수치는 **누적 그대로**(비율 보정 없음). 표본 적은 짝꿍은 **회색(dim)** 처리.

## 데이터 / 계산

### 신규: `src/utils/analyticsV2/calcAssistLinkMatrix.js`

```
calcAssistLinkMatrix({ eventLogs })
→ { cells: { "<a|b 가나다정렬>": { total, aToB, bToA } } }
```

- `event_type === 'goal'` 이고 `player`·`related_player` 둘 다 존재하는 row만.
- 키: `[scorer, assister].sort((x,y) => x.localeCompare(y,'ko')).join('|')`
  → `calcSynergyMatrix`의 self/pair 셀과 **동일 키 규약**이라 조회가 일치한다.
- `aToB` = a가 어시 → b가 골, `bToA` = b가 어시 → a가 골 (a,b는 정렬된 이름).
- `scorer === assister`(자기 어시) 방어 가드 — 발생 불가지만 skip.

기존 `calcSynergyMatrix`(matchLogs 기반)는 **수정하지 않는다.** 연결은
`eventLogs` 소스라 별도 함수로 분리해 각 함수 단일 책임 유지.

### 병합: `PersonalAnalysisTab.jsx`

`myPair` useMemo에 `eventLogs`(이미 prop으로 내려옴)를 deps 추가하고,
`calcAssistLinkMatrix`를 `eventLogs`에만 의존하는 별도 useMemo로 1회 계산한 뒤,
각 partner에 `links`를 부착한다:

```
const key = [selected, p.partner].sort((x,y)=>x.localeCompare(y,'ko')).join('|');
const cell = linkMatrix.cells[key];           // 없으면 연결 0
const iAssisted = (selected < p.partner localeCompare) 방향에 맞춰 aToB/bToA 선택;
p.links = { total: cell?.total ?? 0, iAssisted, iScored };
```

- `iAssisted` = 내가 어시한 수(짝꿍 골), `iScored` = 내가 득점한 수(짝꿍 어시).
  정렬된 키의 a/b 중 `selected`가 어느 쪽인지로 `aToB`/`bToA`를 매핑.
- 연결 0 짝꿍은 `total:0`으로 두고 행은 유지(이미 synergy partner).

`calcPersonalSynergy`는 그대로. 병합 로직만 탭에 둔다.

## UI — `PersonalSynergyCard.jsx`

5번째 열 `연결` 추가 + `연결순` 토글(`sortKey: 'link'`).

```
🤝 나의 짝꿍 (44명)          [승률순] [케미순] [연결순]
승률 함께 뛴 팀 승률 · 케미 두 사람 평균 대비 추가효과 · 연결 둘이 합작한 골
┌────────────────────────────────────────────────────┐
│ 동료     함께  승률   케미     연결                  │
│ 김성환   12   83%  +30.1   8 (내어시 5 · 내득점 3)  │
│ 박재운    7   79%  +26.4   3 (내어시 1 · 내득점 2)  │
│ 이영문   19   68%  +12.3   0                        │
│ 나민혁    4   79%  +12.8   [표본부족]               │
└────────────────────────────────────────────────────┘
```

- 연결 셀: 메인 합계 숫자, 아래/옆에 작은(9~10px) `내어시 N · 내득점 M`. 모두 "나" 기준.
- total 0이면 `0`만(회색 dim).
- 헤더 색: `sortKey==='link'`일 때 `연결` 헤더 흰색(기존 승률/케미 패턴과 동일).
- 저표본(`isLowSample`, 함께<5)이면 연결 셀도 dim — 승률/케미/연결 일관.

## 정렬 (연결순)

기존 정렬 패턴 확장:
```
1) isLowSample → 항상 하단
2) links.total 내림차순
3) 동점 시 games 내림차순
```
연결 0 짝꿍은 비저표본 그룹 하단에 모인다. 승률순/케미순일 때 연결열은
표시만 되고 정렬엔 영향 없음.

## 엣지케이스

- **연결만 있고 함께가 0**: 구조상 불가(합작하려면 같은 팀 출전). 단 멤버 JSON
  누락 데이터면 그 연결은 synergy partner에 없어 **조용히 누락** — 허용.
- **동명이인**: 이름 키잉의 기존 한계와 동일, 새로 악화 없음.
- **owngoal/단독골/제3자 골**: 정의대로 제외.

## 테스트 (TDD)

신규 `src/utils/analyticsV2/__tests__/calcAssistLinkMatrix.test.js`
(기존 `calcAssistPairs.test.js` 미러):

- 빈 입력 → `{ cells: {} }`
- 양방향 합산: a→b 2회 + b→a 1회 → `{ total:3, aToB:2, bToA:1 }`
- owngoal 제외
- 단독골(related_player 빈 값) 제외
- 제3자 골은 해당 페어에 미반영
- 키 정렬 일관성(입력 순서 무관, 조회 매칭)

## 변경 파일 요약

| 파일 | 변경 |
|---|---|
| `src/utils/analyticsV2/calcAssistLinkMatrix.js` | 신규 |
| `src/utils/analyticsV2/__tests__/calcAssistLinkMatrix.test.js` | 신규 |
| `src/components/dashboard/analytics/PersonalAnalysisTab.jsx` | linkMatrix 계산 + partner.links 병합 |
| `src/components/dashboard/analytics/PersonalSynergyCard.jsx` | 연결 열 + 연결순 토글 + 정렬 |
