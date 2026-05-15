# Claude Code 프롬프트 — Dashboard Redesign (Stats C · Lead B · Syn B)

> **repo:** `yssc-dev/master-fc` (main)
> **대상:** `src/components/dashboard/TeamDashboard.jsx` 의 `renderRecords()` 내부 세 섹션
> **디자인 시스템:** 기존 `useTheme()` + `app_tokens.css` 토큰(`--app-blue`, `--app-bg-grouped` 등)을 **그대로** 사용. 새로운 색상 상수를 하드코딩하지 말 것.
> **참고 레퍼런스:** 이 프로젝트의 `explorations/Dashboard Redesign.html` 내 `StatsC_Widget`, `LeadB_Grouped`, `SynB_AppleDonut`
> **변경 범위:** 프레젠테이션만. 데이터 페칭/상태/props/정렬 로직 **변경 금지**.

---

## 현재 코드 맥락 (요약)

- `TeamDashboard.jsx` 내부에서 `ds = useMemo(...)`로 공용 스타일 객체를 만들고, `C = useTheme().C`의 CSS 변수 별칭을 쓴다.
- **풋살** 탭의 `renderRecords()`에 아래 3개 블록이 있다:

  1. **시즌 요약 카드 4개** (경기 / 골 / 어시 / 참여) — `activeSport !== "축구"` 분기 안쪽 `flex` row.
     현재: `maxGames`, `totalGoals`, `totalAssists`, `activePlayers.length` 4개 카드 균등 배치. `fontSize: 32` 숫자.
  2. **포인트 TOP 5** — `ds.sectionTitle` "포인트 TOP 5" 아래 `<Bar value={p.point} max={maxPoint} ... />` 사용. 좌측 rank는 `C.orange`(top3)/`C.gray`.
  3. **득점 TOP5 어시스트 분포(시너지)** — 현재 `SynergyTab.jsx`는 **시너지(승률 기반)**를 다루는 *별도* 탭이고, 분석 대시보드의 "어시 분포 도넛"은 `PlayerAnalytics.jsx`에 있을 가능성이 높음. **먼저 어느 파일/함수인지 확인 후 수정**할 것.

CSS 토큰은 `src/styles/app_tokens.css`에 정의되어 있다고 가정 (`--app-bg-grouped`, `--app-bg-row`, `--app-bg-row-hover`, `--app-divider`, `--app-text-primary`, `--app-text-secondary`, `--app-text-tertiary`, `--app-blue`, `--app-green`, `--app-red`, `--app-orange`, `--app-purple`, `--app-yellow`). 없으면 Apple systemColor 값(#007AFF, #34C759, #FF3B30, #FF9500, #AF52DE, #FFCC00)으로 추가.

---

## 작업 1 — 시즌 요약을 **Widget 스타일**로 교체 (Stats C)

`TeamDashboard.jsx` 에서 `{/* 시즌 요약 카드 (풋살만) */}` 블록을 **하나의 흰 위젯 카드**로 바꾼다. 4개 균등 카드 → 1개 큰 숫자 + 하단 3분할.

### 새 JSX (그대로 교체)

```jsx
{activeSport !== "축구" && (
  <div style={ds.section}>
    <div style={{
      background: C.card,
      border: `0.5px solid ${C.borderColor}`,
      borderRadius: 18,
      padding: "18px 18px 14px",
    }}>
      {/* Top row: eyebrow label */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.gray }}>이번 시즌</div>
      </div>

      {/* Hero number */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <div style={{
          fontSize: 56, fontWeight: 700, lineHeight: 1,
          color: C.white, letterSpacing: "-0.03em",
          fontVariantNumeric: "tabular-nums",
        }}>{totalGoals}</div>
        <div style={{ fontSize: 17, fontWeight: 500, color: C.gray }}>골</div>
      </div>

      {/* Divider + 3-up subsection */}
      <div style={{
        marginTop: 14, paddingTop: 12,
        borderTop: `0.5px solid ${C.borderColor}`,
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
      }}>
        {[
          { label: "경기",  value: maxGames },
          { label: "어시",  value: totalAssists },
          { label: "참여",  value: activePlayers.length },
        ].map((stat) => (
          <div key={stat.label}>
            <div style={{
              fontSize: 20, fontWeight: 600, color: C.white,
              letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums",
            }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
)}
```

### 요점

- **주연 숫자는 `totalGoals`**. 이게 시즌의 헤드라인이므로 56px.
- 나머지는 하단 3분할에 secondary로. 순서 고정: 경기 → 어시 → 참여.
- 색은 전부 `C.white / C.gray / C.card / C.borderColor` — 하드코딩 **금지**.
- 기존 `ds.card`는 `borderRadius: 14`이지만 hero widget은 `18`. 인라인으로 지정.

---

## 작업 2 — 포인트 TOP 5 를 **Grouped List**로 교체 (Lead B)

같은 파일 `{/* 포인트 TOP 5 */}` 블록. 현재는 `<Bar>` 컴포넌트 + 좌측 숫자 rank.
Apple inset grouped list로 교체 — 1위만 `C.accent`(systemBlue) pill, 나머지는 grey pill, hairline divider, 얇은 progress bar.

### 새 JSX

```jsx
{members.length > 0 && (
  <div style={ds.section}>
    <div style={ds.sectionTitle}>포인트 TOP 5</div>
    <div style={{
      background: C.card,
      border: `0.5px solid ${C.borderColor}`,
      borderRadius: 14,
      overflow: "hidden",
    }}>
      {members.slice(0, 5).map((p, i) => {
        const isFirst = i === 0;
        const delta = (p.goalsDelta || 0) + (p.assistsDelta || 0)
                    + (p.ownGoalsDelta || 0) + (p.cleanSheetsDelta || 0);
        return (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "28px 1fr auto",
            alignItems: "center", gap: 12,
            padding: "12px 16px",
            borderBottom: i < 4 ? `0.5px solid ${C.borderColor}` : "none",
          }}>
            {/* Rank pill */}
            <div style={{
              width: 24, height: 24, borderRadius: 999,
              background: isFirst ? C.accent : C.cardLight,
              color:      isFirst ? "#fff"   : C.gray,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums",
            }}>{i + 1}</div>

            {/* Name + hairline progress */}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: C.white }}>{p.name}</div>
              <div style={{
                marginTop: 5, height: 3, maxWidth: 160,
                background: C.cardLight, borderRadius: 2, overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", borderRadius: 2,
                  width: `${Math.min(100, (p.point / (maxPoint || 1)) * 100)}%`,
                  background: isFirst ? C.accent : C.grayLight,
                  transition: "width 0.3s",
                }} />
              </div>
            </div>

            {/* Point + delta */}
            <div style={{ textAlign: "right" }}>
              <div style={{
                fontSize: 20, fontWeight: 600, color: C.white,
                letterSpacing: "-0.022em", fontVariantNumeric: "tabular-nums",
              }}>{p.point}</div>
              {delta > 0 && (
                <div style={{
                  fontSize: 11, fontWeight: 500, color: C.green, marginTop: 1,
                  fontVariantNumeric: "tabular-nums",
                }}>↑ {delta}</div>
              )}
              {delta < 0 && (
                <div style={{
                  fontSize: 11, fontWeight: 500, color: C.red, marginTop: 1,
                  fontVariantNumeric: "tabular-nums",
                }}>↓ {Math.abs(delta)}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
)}
```

### 요점

- 기존 `<Bar>` 컴포넌트 호출 **제거** (이 섹션에서). 인라인 hairline bar로 교체.
- `<DeltaBadge>` 대신 인라인 `↑ N` / `↓ N` — 색은 `C.green` / `C.red`.
- 1위 행에만 `C.accent` pill + accent progress fill. 나머지는 모두 중립톤.
- divider는 **반드시** `0.5px solid ${C.borderColor}`. `1px`나 `dashed` 금지.

---

## 작업 3 — 득점 TOP5 어시스트 분포 → **Apple Donut**으로 교체 (Syn B)

> ⚠️ **먼저 탐색**: `grep -rn "어시스트 분포\|SynergyDonut\|assistSynergy" src/` 로 현재 도넛/파이 차트 렌더링 위치를 찾아라. `PlayerAnalytics.jsx`(45 KB) 내부에 있을 가능성이 크다. 찾은 뒤 그 컴포넌트(또는 sub-render 함수)를 아래 스펙으로 교체.

> 만약 현재 해당 도넛이 존재하지 않는다면(시너지 ≠ 어시 분포), **신규 컴포넌트 `AssistSynergyDonut.jsx`** 를 `src/components/dashboard/` 에 만들고 적절한 상위 화면(득점 TOP5를 표시하는 곳)에서 호출하라.

### 입력 props

```ts
type AssistSynergyDonutProps = {
  scorer: string;                     // e.g. "강민호"
  total: number;                      // 총 득점
  assisters: { name: string; count: number; pct: number }[]; // pct 합 = 100, 5개 이하 권장, 나머지는 "기타"
};
```

### 컴포넌트 (그대로 생성)

```jsx
// src/components/dashboard/AssistSynergyDonut.jsx
import { useTheme } from '../../hooks/useTheme';

const PIE = [
  "var(--app-blue)",
  "var(--app-green)",
  "var(--app-orange)",
  "var(--app-purple)",
  "var(--app-divider)", // 남은 조각 / 기타
];

export default function AssistSynergyDonut({ scorer, total, assisters }) {
  const { C } = useTheme();
  let acc = 0;
  const OR = 54, IR = 38;

  return (
    <div>
      <div style={{ padding: "0 4px 8px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.white, letterSpacing: "-0.022em" }}>
          {scorer}
        </div>
        <div style={{ fontSize: 13, color: C.gray }}>어시스트 분포</div>
      </div>
      <div style={{
        background: C.card,
        border: `0.5px solid ${C.borderColor}`,
        borderRadius: 14,
        padding: "16px 14px",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <svg width={120} height={120} viewBox="-60 -60 120 120">
          {assisters.map((a, i) => {
            const start = (acc / 100) * Math.PI * 2;
            acc += a.pct;
            const end = (acc / 100) * Math.PI * 2;
            const large = end - start > Math.PI ? 1 : 0;
            const x1 = Math.sin(start) * OR, y1 = -Math.cos(start) * OR;
            const x2 = Math.sin(end)   * OR, y2 = -Math.cos(end)   * OR;
            const x3 = Math.sin(end)   * IR, y3 = -Math.cos(end)   * IR;
            const x4 = Math.sin(start) * IR, y4 = -Math.cos(start) * IR;
            return (
              <path key={i}
                d={`M${x1},${y1} A${OR},${OR} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${IR},${IR} 0 ${large} 0 ${x4},${y4} Z`}
                fill={PIE[i % PIE.length]} />
            );
          })}
          <text textAnchor="middle" dy="-2" fill="currentColor"
            style={{
              fill: "var(--app-text-primary)",
              fontSize: 28, fontWeight: 700,
              letterSpacing: "-0.022em",
              fontVariantNumeric: "tabular-nums",
            }}>{total}</text>
          <text textAnchor="middle" y="14"
            style={{ fill: "var(--app-text-secondary)", fontSize: 10, fontWeight: 500 }}>골</text>
        </svg>

        <div style={{ flex: 1 }}>
          {assisters.map((a, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              padding: "4px 0",
              borderBottom: i === assisters.length - 1 ? "none" : `0.5px solid ${C.borderColor}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 2,
                  background: PIE[i % PIE.length], flex: "none",
                }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: C.white }}>{a.name}</span>
              </div>
              <span style={{
                fontSize: 14, fontWeight: 600, color: C.white,
                fontVariantNumeric: "tabular-nums",
              }}>{a.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 호출부

기존 도넛 렌더링을 찾으면 그 자리에서:

```jsx
<AssistSynergyDonut
  scorer={topScorer.name}
  total={topScorer.goals}
  assisters={topScorer.assistBreakdown}  // 기존 데이터 이름에 맞게
/>
```

여러 스코어러를 보여줘야 한다면 **상단 segmented control**(3명 토글)을 추가 — Apple segmented 스타일은 이미 `ds.sportTab()`에 있으니 그걸 재사용하라.

---

## 전역 규칙 (PR 체크리스트)

- [ ] 새로 하드코딩된 색 없음 (`#22c55e`, `#3b82f6`, `#ef4444` 등 **전부 토큰으로**). 
- [ ] divider는 전부 `0.5px solid ${C.borderColor}`. 1px / dashed 금지.
- [ ] 숫자가 들어가는 모든 요소에 `fontVariantNumeric: "tabular-nums"`.
- [ ] 22px 이상 텍스트에 `letterSpacing: "-0.022em"`, 56px hero는 `-0.03em`.
- [ ] rounded corner는 `14` / `18` / `999`만 사용.
- [ ] `ds.card`를 그대로 쓰는 대신, 위 스펙에 맞춰 **인라인 스타일** 우선 (radius·padding이 다름).
- [ ] 기존 `<Bar>`, `<DeltaBadge>` 호출은 **포인트 TOP 5 섹션에서만 제거**. 골/어시 TOP 5 서브 섹션에는 그대로 둔다.
- [ ] 다크모드 확인 (`data-theme="dark"`). `C.white`가 글자색임에 유의 — `--app-text-primary`로 매핑되어 다크에서도 정상.

---

## 검증

```bash
npm run dev
```

스크린샷으로 다음 확인:

1. 풋살 탭 대시보드 상단이 **흰 카드 하나**에 큰 숫자 1개 + 하단 3분할.
2. 포인트 TOP 5 카드에 1위만 **파란 pill + 파란 progress fill**, 나머지는 회색.
3. divider는 모두 hairline (0.5px). 굵은 선/점선 없음.
4. 다크 모드로 토글해도 배경/텍스트가 깨지지 않음.

어긋나면 위 코드 그대로 다시 적용.
