# 05. 카드 나열 → Insetted Grouped 리스트

**파일:** `HomeScreen.jsx`, `TeamDashboard.jsx` (sports tab, 선수 랭킹), `SettingsScreen.jsx`, `App.jsx setup phase` 등

## 문제
현재 많은 곳이 **개별 카드를 나열**하는 방식 (팀 목록, 선수 목록). iOS는 **한 카드 안에 여러 row**가 들어가는 insetGrouped 스타일이 표준. 시각적 묶음이 강해지고 정보 밀도도 올라감.

## 패턴 적용 방법

### A. 기본 grouped list

```jsx
<div className="app-grouped">
  <div className="app-row">
    <span className="app-row-title">행 1 제목</span>
    <span className="app-row-meta">123</span>
  </div>
  <div className="app-row">
    <span className="app-row-title">행 2 제목</span>
    <span className="app-row-meta">456</span>
  </div>
</div>
```

`app-grouped`와 `app-row` 클래스는 `app_tokens.css`에 이미 정의됨 (01 프롬프트). `<div className="app-row">` 사이에 자동으로 `0.5px` divider가 들어가고 마지막 행은 제거됨.

### B. 섹션 라벨

```jsx
<div className="app-section-label">팀</div>
<div className="app-grouped">...</div>
```

### C. 클릭 가능한 row (chevron)

```jsx
<button
  className="app-row"
  style={{ width: "100%", textAlign: "left", background: "var(--app-bg-row)", border: 0, cursor: "pointer", fontFamily: "inherit" }}
  onClick={...}
>
  <span className="app-row-title">항목 이름</span>
  <ChevronRight color="var(--app-text-tertiary)" width={14} />
</button>
```

## 적용 대상

### 1. HomeScreen.jsx — 팀 목록

**Before:** 각 팀마다 `button` 카드가 개별 `borderRadius: 16`로 떨어져 있음.

**After:** 하나의 `app-grouped` 안에 팀 N개 row + 맨 아래 "+ 팀 추가하기" row.

```jsx
<div className="app-section-label">팀</div>
<div className="app-grouped" style={{ marginBottom: 16 }}>
  {teamNames.map(teamName => {
    const entries = teamGroups[teamName];
    const isCurrent = teamName === selectedTeamName;
    return (
      <button
        key={teamName}
        className="app-row"
        onClick={() => onSelectTeam(teamName, entries)}
        style={{
          width: "100%", textAlign: "left",
          background: isCurrent ? "rgba(0,122,255,0.08)" : "var(--app-bg-row)",
          border: 0, fontFamily: "inherit", cursor: "pointer",
        }}
      >
        <div style={{ flex: 1 }}>
          <div className="app-row-title" style={{ fontWeight: 500, color: isCurrent ? "var(--app-blue)" : "var(--app-text-primary)" }}>
            {teamName}
          </div>
          <div className="app-row-sub">
            {entries.map(e => e.mode).join(" · ")}
            {entries.some(e => e.role === "관리자") && " · 관리자"}
          </div>
        </div>
        {isCurrent && <CheckIcon color="var(--app-blue)" width={18} />}
        <ChevronRight color="var(--app-text-tertiary)" width={14} />
      </button>
    );
  })}
  <button className="app-row" onClick={() => setShowAddInfo(true)}
    style={{ width: "100%", textAlign: "left", background: "var(--app-bg-row)",
             border: 0, fontFamily: "inherit", cursor: "pointer",
             color: "var(--app-blue)" }}>
    <PlusIcon color="var(--app-blue)" width={18} />
    <span className="app-row-title" style={{ color: "var(--app-blue)" }}>팀 추가하기</span>
  </button>
</div>
```

### 2. App.jsx — 참석자 선택 (setup phase)

선수들이 현재 **flex-wrap chip 그리드**. 그대로 두되, **카드 컨테이너를 insetGrouped style 카드 하나**로. 현재는 이미 `s.card` 컨테이너가 있으니 `borderRadius: 14 + padding: 14`만 맞추면 됨 (02 프롬프트에서 완료).

상태 필터/정렬 버튼을 선수 카드 위에 **세그먼트 컨트롤** 형태로:

```jsx
<div style={s.tabRow}>
  <button style={s.tab(playerSortMode === "point")} onClick={() => set('playerSortMode', 'point')}>포인트순</button>
  <button style={s.tab(playerSortMode === "name")} onClick={() => set('playerSortMode', 'name')}>이름순</button>
</div>
```

`tab`은 02 프롬프트에서 iOS segment 스타일로 교체됨.

### 3. TeamDashboard.jsx — 선수 랭킹

`members.map(p => ...)` 테이블을 유지하되, **행 간 구분선을 `0.5px solid`로 (현재 dashed)**. 테이블 컨테이너도 `app-grouped` 스타일 (이미 02에서 card가 radius 14로 바뀜).

맨 윗줄에 활동 선수 수 + 총 골 요약은 `app-row-sub` 스타일로 단순화.

### 4. SettingsScreen.jsx

설정 항목들이 현재 어떻게 생겼는지 확인 후, 모든 설정 row를 `app-grouped`로 래핑. iOS 설정 앱의 "섹션 라벨 → grouped list → 섹션 간 간격 24px" 패턴.

## 검증
- [ ] HomeScreen에서 팀 카드 사이 간격이 사라지고 한 덩어리 카드 안에 각 팀이 행으로 배치됨
- [ ] 현재 선택된 팀 row는 파란 배경 틴트 + 체크 아이콘
- [ ] 선수 정렬 탭이 세그먼트 컨트롤 모양
- [ ] 테이블 행 구분선이 dashed가 아닌 solid 0.5px
- [ ] 다크 모드에서 divider가 보이지만 과하지 않음
- [ ] lint 통과
