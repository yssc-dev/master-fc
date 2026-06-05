# 나의 짝꿍 어시-골 연결(연결순) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `나의 짝꿍`(PersonalSynergyCard)에 선택된 본인과 각 짝꿍이 직접 합작한 골 수(연결)를 5번째 열 + `연결순` 토글로 추가한다.

**Architecture:** `eventLogs`에서 (득점자, 어시) 쌍을 정렬키로 누적하는 순수 함수 `calcAssistLinkMatrix`와, 그 매트릭스에서 본인 기준 방향(내어시/내득점)을 뽑는 `personalLink` 헬퍼를 신규 추가한다. `PersonalAnalysisTab`이 `calcPersonalSynergy` 결과의 각 partner에 `links`를 병합해 카드로 내려보낸다. 기존 `calcSynergyMatrix`/`calcPersonalSynergy`는 무수정.

**Tech Stack:** React (함수형 컴포넌트, useMemo), Vitest, 인라인 style.

**Spec:** `docs/superpowers/specs/2026-06-05-personal-assist-link-design.md`

---

### Task 1: `calcAssistLinkMatrix` + `personalLink` (순수 함수)

**Files:**
- Create: `src/utils/analyticsV2/calcAssistLinkMatrix.js`
- Test: `src/utils/analyticsV2/__tests__/calcAssistLinkMatrix.test.js`

키 규약은 `calcSynergyMatrix`와 동일하게 `[x, y].sort((a,b)=>a.localeCompare(b,'ko')).join('|')`.
`aToB` = a가 어시 → b가 골 (a,b는 정렬된 이름). `personalLink`는 본인이 정렬키의
어느 쪽인지로 방향을 매핑한다:
- 본인 === a → `iAssisted = aToB`(내가 어시→짝꿍 골), `iScored = bToA`(짝꿍 어시→내 골)
- 본인 === b → `iAssisted = bToA`, `iScored = aToB`

- [ ] **Step 1: Write the failing test**

```js
// src/utils/analyticsV2/__tests__/calcAssistLinkMatrix.test.js
import { describe, it, expect } from 'vitest';
import { calcAssistLinkMatrix, personalLink } from '../calcAssistLinkMatrix';

describe('calcAssistLinkMatrix', () => {
  it('returns empty cells for no events', () => {
    expect(calcAssistLinkMatrix({ eventLogs: [] })).toEqual({ cells: {} });
  });

  it('sums both directions into one sorted cell', () => {
    const eventLogs = [
      { event_type: 'goal', player: '나', related_player: '가' }, // 가 어시 → 나 골
      { event_type: 'goal', player: '나', related_player: '가' },
      { event_type: 'goal', player: '가', related_player: '나' }, // 나 어시 → 가 골
    ];
    const { cells } = calcAssistLinkMatrix({ eventLogs });
    // 가 < 나 (localeCompare 'ko') → key '가|나', a='가', b='나'
    expect(cells['가|나']).toEqual({ total: 3, aToB: 1, bToA: 2 });
  });

  it('skips solo goals (no related_player)', () => {
    const eventLogs = [{ event_type: 'goal', player: '나', related_player: '' }];
    expect(calcAssistLinkMatrix({ eventLogs })).toEqual({ cells: {} });
  });

  it('skips owngoal', () => {
    const eventLogs = [{ event_type: 'owngoal', player: '나', related_player: '가' }];
    expect(calcAssistLinkMatrix({ eventLogs })).toEqual({ cells: {} });
  });

  it('skips self-assist guard', () => {
    const eventLogs = [{ event_type: 'goal', player: '나', related_player: '나' }];
    expect(calcAssistLinkMatrix({ eventLogs })).toEqual({ cells: {} });
  });
});

describe('personalLink', () => {
  const eventLogs = [
    { event_type: 'goal', player: '나', related_player: '가' }, // 가 어시 → 나 골
    { event_type: 'goal', player: '나', related_player: '가' },
    { event_type: 'goal', player: '가', related_player: '나' }, // 나 어시 → 가 골
  ];
  const linkMatrix = calcAssistLinkMatrix({ eventLogs });

  it('maps direction from selected player perspective', () => {
    // 본인 '나': 내가 어시한 수=1(가 골), 내가 득점한 수=2(가 어시)
    expect(personalLink({ linkMatrix, player: '나', partner: '가' }))
      .toEqual({ total: 3, iAssisted: 1, iScored: 2 });
    // 본인 '가': 대칭
    expect(personalLink({ linkMatrix, player: '가', partner: '나' }))
      .toEqual({ total: 3, iAssisted: 2, iScored: 1 });
  });

  it('returns zeros when no cell exists', () => {
    expect(personalLink({ linkMatrix, player: '나', partner: '없는사람' }))
      .toEqual({ total: 0, iAssisted: 0, iScored: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/analyticsV2/__tests__/calcAssistLinkMatrix.test.js`
Expected: FAIL — `calcAssistLinkMatrix is not a function` / cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/utils/analyticsV2/calcAssistLinkMatrix.js
// 나의 짝꿍 어시-골 연결: (득점자, 어시) 쌍을 정렬키로 누적.
// 키 규약은 calcSynergyMatrix와 동일 (가나다 정렬, localeCompare 'ko').
// owngoal/단독골/자기어시는 제외. eventLogs 기반(matchLogs 아님).

function pairKey(x, y) {
  return [x, y].sort((a, b) => a.localeCompare(b, 'ko')).join('|');
}

export function calcAssistLinkMatrix({ eventLogs }) {
  const cells = {};
  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;
    const scorer = e.player;
    const assister = e.related_player;
    if (!scorer || !assister || scorer === assister) continue;
    const [a, b] = [scorer, assister].sort((x, y) => x.localeCompare(y, 'ko'));
    const key = `${a}|${b}`;
    if (!cells[key]) cells[key] = { total: 0, aToB: 0, bToA: 0 };
    cells[key].total++;
    // aToB = a가 어시 → b가 골
    if (assister === a) cells[key].aToB++;
    else cells[key].bToA++;
  }
  return { cells };
}

// 선택된 본인 기준 방향 추출: iAssisted=내가 어시(짝꿍 골), iScored=내가 골(짝꿍 어시)
export function personalLink({ linkMatrix, player, partner }) {
  const cell = linkMatrix?.cells?.[pairKey(player, partner)];
  if (!cell) return { total: 0, iAssisted: 0, iScored: 0 };
  const [a] = [player, partner].sort((x, y) => x.localeCompare(y, 'ko'));
  const iAmA = player === a;
  return {
    total: cell.total,
    iAssisted: iAmA ? cell.aToB : cell.bToA,
    iScored: iAmA ? cell.bToA : cell.aToB,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/analyticsV2/__tests__/calcAssistLinkMatrix.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/analyticsV2/calcAssistLinkMatrix.js src/utils/analyticsV2/__tests__/calcAssistLinkMatrix.test.js
git commit -m "feat(futsal): calcAssistLinkMatrix — 나의 짝꿍 어시-골 연결 집계"
```

---

### Task 2: `PersonalAnalysisTab`에서 links 병합

**Files:**
- Modify: `src/components/dashboard/analytics/PersonalAnalysisTab.jsx` (import 구역 + `myPair` useMemo, 현재 269-272)

각 partner에 `links: { total, iAssisted, iScored }`를 붙여 카드로 내려보낸다.
`calcPersonalSynergy`/`synergyMatrix`는 그대로 두고 병합만 추가.

- [ ] **Step 1: import 추가**

`PersonalAnalysisTab.jsx`의 `calcSynergyMatrix` / `calcPersonalSynergy` import 근처에 추가:

```js
import { calcAssistLinkMatrix, personalLink } from '../../../utils/analyticsV2/calcAssistLinkMatrix';
```

- [ ] **Step 2: linkMatrix memo + myPair 병합으로 교체**

현재 코드(269-272):
```js
  const myPair = useMemo(
    () => selected ? calcPersonalSynergy({ matrix: synergyMatrix, player: selected }) : { partners: [], best: [], worst: [] },
    [synergyMatrix, selected]
  );
```

교체:
```js
  const linkMatrix = useMemo(() => calcAssistLinkMatrix({ eventLogs: eventLogs || [] }), [eventLogs]);
  const myPair = useMemo(() => {
    if (!selected) return { partners: [], best: [], worst: [] };
    const base = calcPersonalSynergy({ matrix: synergyMatrix, player: selected });
    const partners = base.partners.map(p => ({
      ...p,
      links: personalLink({ linkMatrix, player: selected, partner: p.partner }),
    }));
    return { ...base, partners };
  }, [synergyMatrix, selected, linkMatrix]);
```

- [ ] **Step 3: 기존 테스트가 깨지지 않는지 확인**

Run: `npx vitest run`
Expected: PASS (기존 + Task 1 신규 모두 통과).

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공(에러 없음).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/analytics/PersonalAnalysisTab.jsx
git commit -m "feat(futsal): 나의 짝꿍 partner에 어시-골 연결(links) 병합"
```

---

### Task 3: `PersonalSynergyCard` 연결 열 + 연결순 토글 + 정렬

**Files:**
- Modify: `src/components/dashboard/analytics/PersonalSynergyCard.jsx`

5번째 열 `연결`, `연결순` 토글(`sortKey: 'link'`), 정렬 시 `links.total` 기준.
셀은 `8` + 작은 `내어시 5 · 내득점 3`, 0이면 회색 `0`. 저표본 행은 기존 row opacity로 dim 유지.

- [ ] **Step 1: 정렬 comparator를 link 지원하도록 교체**

현재(10-20):
```js
  const sorted = useMemo(() => {
    const arr = [...partners];
    arr.sort((a, b) => {
      // 표본부족은 항상 하단으로
      if (a.isLowSample !== b.isLowSample) return a.isLowSample ? 1 : -1;
      const dv = (b[sortKey] ?? 0) - (a[sortKey] ?? 0);
      if (dv !== 0) return dv;
      return b.games - a.games;
    });
    return arr;
  }, [partners, sortKey]);
```

교체:
```js
  const sortVal = (p) => sortKey === 'link' ? (p.links?.total ?? 0) : (p[sortKey] ?? 0);
  const sorted = useMemo(() => {
    const arr = [...partners];
    arr.sort((a, b) => {
      // 표본부족은 항상 하단으로
      if (a.isLowSample !== b.isLowSample) return a.isLowSample ? 1 : -1;
      const dv = sortVal(b) - sortVal(a);
      if (dv !== 0) return dv;
      return b.games - a.games;
    });
    return arr;
  }, [partners, sortKey]);
```

- [ ] **Step 2: 연결순 토글 버튼 추가**

현재(58-61):
```jsx
        <div style={{ display: 'flex', gap: 6 }}>
          <Tab k="winRate" label="승률순" />
          <Tab k="liftSymmetric" label="케미순" />
        </div>
```

교체:
```jsx
        <div style={{ display: 'flex', gap: 6 }}>
          <Tab k="winRate" label="승률순" />
          <Tab k="liftSymmetric" label="케미순" />
          <Tab k="link" label="연결순" />
        </div>
```

- [ ] **Step 3: 범례에 연결 설명 추가**

현재(64-66):
```jsx
      <div style={{ fontSize: 10, color: C.gray, lineHeight: 1.6, marginBottom: 8 }}>
        <b>승률</b> 함께 뛴 매치의 팀 승률 · <b>케미</b> 두 사람 평균 대비 함께 뛸 때 추가 효과
      </div>
```

교체:
```jsx
      <div style={{ fontSize: 10, color: C.gray, lineHeight: 1.6, marginBottom: 8 }}>
        <b>승률</b> 함께 뛴 매치의 팀 승률 · <b>케미</b> 두 사람 평균 대비 추가 효과 · <b>연결</b> 둘이 직접 합작한 골(내어시=내가 도움, 내득점=내가 마무리)
      </div>
```

- [ ] **Step 4: 연결 헤더 th 추가**

현재(72-74) 케미 th 뒤에 연결 th 추가. 케미 th 다음 줄에 삽입:
```jsx
            <th style={{ textAlign: 'right', padding: '6px 4px', color: sortKey === 'liftSymmetric' ? C.white : C.gray, fontWeight: 600, width: 60 }}>케미</th>
            <th style={{ textAlign: 'right', padding: '6px 4px', color: sortKey === 'link' ? C.white : C.gray, fontWeight: 600, width: 72 }}>연결</th>
```

- [ ] **Step 5: 연결 td 추가**

현재 케미 td(89) 뒤에 연결 td를 추가. 케미 td 다음 줄에 삽입:
```jsx
                <td style={{ padding: '6px 4px', color: C.white, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {(p.links?.total ?? 0) > 0 ? (
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.links.total}</div>
                      <div style={{ fontSize: 9, color: C.gray, fontWeight: 400 }}>내어시 {p.links.iAssisted} · 내득점 {p.links.iScored}</div>
                    </div>
                  ) : (
                    <span style={{ color: C.gray }}>0</span>
                  )}
                </td>
```

- [ ] **Step 6: 빌드 + 테스트 확인**

Run: `npm run build && npx vitest run`
Expected: 빌드 성공, 모든 테스트 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/analytics/PersonalSynergyCard.jsx
git commit -m "feat(futsal): 나의 짝꿍 연결 열 + 연결순 토글"
```

---

### Task 4: 브라우저 검증

**Files:** 없음 (수동 검증)

- [ ] **Step 1: dev 서버 기동 후 확인**

Run: `npm run dev`
확인 항목:
- 분석 탭 → 선수 선택 → `나의 짝꿍` 카드에 `연결순` 토글 보임.
- `연결순` 클릭 시 합작골 많은 짝꿍이 상단, 0인 짝꿍은 하단(저표본은 항상 최하단).
- 연결 셀이 `8` + `내어시 5 · 내득점 3` 형태로 표시, 0이면 회색 `0`.
- 모바일 폭(개발자도구 ~390px)에서 5열이 줄바꿈 없이 들어오는지(안 되면 `함께` width 축소 또는 연결 sub 폰트 9px 유지로 조정).

- [ ] **Step 2: playwright-verify-and-fix 스킬로 콘솔 에러 확인(선택)**

콘솔 에러 0 확인 후 종료.

---

## Self-Review

- **Spec coverage:** 정의(Task1) · calcAssistLinkMatrix 신규(Task1) · 병합(Task2) · 연결 열/연결순/정렬(Task3) · 저표본 회색(기존 row opacity 재사용, Task3 셀은 row opacity 상속) · owngoal/단독골/제3자 제외(Task1 테스트) · 엣지 누락 허용(personalLink가 cell 없으면 0 반환) — 모두 커버.
- **Placeholder scan:** 없음. 모든 코드 블록 실제 내용 포함.
- **Type consistency:** `calcAssistLinkMatrix`→`{cells}`, 셀 `{total,aToB,bToA}`, `personalLink`→`{total,iAssisted,iScored}`, partner.links 동일 형태. 카드의 `p.links?.total/iAssisted/iScored` 일치. `sortKey 'link'`는 토글·헤더·sortVal 3곳 일치.
