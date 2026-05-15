# 03. 타이포 한글 최적화 + uppercase 제거

**파일:** 여러 컴포넌트 전반 (전역 검색 필요)

## 문제
`textTransform: "uppercase"`, `fontFamily: "var(--font-mono)"`, `letterSpacing: 0.6/0.8` 조합이 앱 곳곳에 하드코딩돼 있음. 한글에는 uppercase가 적용되지 않고 letter-spacing 0.6은 한글에서 어색하게 벌어짐. Apple HIG는 한국어 UI에서 mono/uppercase 라벨을 쓰지 않음.

## 할 일

### 1. 전역 검색 대상 (ripgrep 또는 IDE)

다음 패턴을 찾아서 모두 제거/수정:

- `textTransform: "uppercase"` — **모두 제거**
- `fontFamily: "var(--font-mono)"` — **모두 제거** (숫자 전용은 `fontVariantNumeric: 'tabular-nums'`로 충분)
- `letterSpacing: 0.5`, `0.6`, `0.8` — **0으로 또는 제거**
- `fontFamily: "'JetBrains Mono', monospace"` — **제거** (statefully, 숫자 스코어보드는 예외: 이건 기본 sans가 tabular-nums면 충분)

### 2. 예외 (mono 유지해도 되는 곳)

- 선수 등번호/경기 ID처럼 **숫자 전용 라벨** → `fontVariantNumeric: 'tabular-nums'`로 대체하면 일반 폰트가 깔끔
- 스코어보드(scoreboard)는 `theme.js`의 `fontVariantNumeric: 'tabular-nums'`만으로 충분

### 3. 치환 규칙 (예시)

**Before:**
```js
const metaLabel = {
  fontSize: 10, fontFamily: "var(--font-mono)",
  letterSpacing: 0.6, textTransform: "uppercase",
  color: C.gray,
};
```
**After:**
```js
const metaLabel = {
  fontSize: 13, fontWeight: 400,
  color: C.gray,
  // uppercase/mono 제거 — 한글 그대로
};
```

**Before (TeamDashboard.jsx):**
```js
sectionTitle: { fontFamily: "var(--font-mono)", fontSize: 10,
                letterSpacing: 0.8, textTransform: "uppercase", ... }
```
**After:**
```js
sectionTitle: { fontSize: 13, fontWeight: 400, color: C.gray,
                marginBottom: 8, paddingLeft: 4,
                display: "flex", alignItems: "center", gap: 6 }
```

**Before (th/td uppercase):**
```js
thStyle: { fontFamily: "var(--font-mono)", fontWeight: 500,
           fontSize: 9, letterSpacing: 0.6, textTransform: "uppercase", ... }
```
**After:**
```js
thStyle: { fontFamily: "inherit", fontWeight: 500,
           fontSize: 12, letterSpacing: 0, textTransform: "none", ... }
```

### 4. 전역 교체 스크립트 (선택)

Claude Code에게 다음 지시 한 번 더:
> `src/` 전체에서 정규식 `textTransform:\s*['"]uppercase['"]`을 찾아 해당 줄을 삭제해라. 그리고 `fontFamily:\s*['"]var\(--font-mono\)['"]` 또는 `fontFamily:\s*['"]'JetBrains Mono'[^'"]*['"]`을 찾아서 `fontFamily: "inherit"`로 교체해라. `letterSpacing: (0\.[4-9]|1\.\d)`도 `letterSpacing: 0`으로 교체. 각 변경 후 `npm run lint`.

### 5. `global.css` mono 폰트 import 제거 (선택)

mono가 앱에 더 이상 안 쓰이면:
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```
로 단순화. (JetBrains Mono, Inter의 320/540 weight 제거)

## 검증

- [ ] `grep -r "uppercase" src/` → 0건 (또는 CSS 변수 정의만)
- [ ] `grep -r "font-mono\|JetBrains" src/` → 0건
- [ ] 화면 전반: 한글이 "섹션 레이블"로 자연스럽게 읽힘
- [ ] 테이블 헤더, 상단 subtitle, 섹션 타이틀 모두 uppercase 제거됨
- [ ] 스코어보드 숫자가 고정폭으로 정렬됨 (tabular-nums)
- [ ] lint 통과
