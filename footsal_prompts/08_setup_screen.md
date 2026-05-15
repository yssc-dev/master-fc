# 08. App.jsx setup phase 재구성

**파일:** `src/App.jsx` (SETUP PHASE 블록, `phase === "setup"`)

## 문제
현재 설정 phase에 옵션 버튼 그룹이 4개(팀 수, 구장 수, 경기 모드, 팀 편성 방식, 회전 수) 연속으로 `s.row`에 떠 있어 스캔이 어려움. 각 옵션이 pill 버튼으로 튀어서 밀도가 높음.

## 고치는 방법

### 1. 옵션 그룹을 grouped list row로 변환

각 옵션 그룹을 **label + segmented control** row 하나로:

```jsx
<div className="app-section-label">경기 설정</div>
<div className="app-grouped" style={{ marginBottom: 24 }}>

  <div className="app-row">
    <span className="app-row-title" style={{ flex: "0 0 70px" }}>팀 수</span>
    <div style={{ ...s.tabRow, flex: 1, marginBottom: 0, padding: 2 }}>
      {[3, 4, 5, 6].map(n => (
        <button key={n} onClick={() => dispatch({ type: 'SET_FIELDS', fields: { teamCount: n, ...(n === 3 ? { courtCount: 1 } : {}) } })}
          style={s.tab(teamCount === n)}>{n}팀</button>
      ))}
    </div>
  </div>

  <div className="app-row">
    <span className="app-row-title" style={{ flex: "0 0 70px" }}>구장 수</span>
    <div style={{ ...s.tabRow, flex: 1, marginBottom: 0, padding: 2 }}>
      {[1, 2].map(n => {
        const disabled = (matchMode === "push" || teamCount === 3) && n !== 1;
        return (
          <button key={n} onClick={() => { if (!disabled) set('courtCount', n); }}
            disabled={disabled}
            style={{ ...s.tab(courtCount === n), opacity: disabled ? 0.35 : 1 }}>
            {n}코트
          </button>
        );
      })}
    </div>
  </div>

  <div className="app-row">
    <span className="app-row-title" style={{ flex: "0 0 70px" }}>경기 모드</span>
    <div style={{ ...s.tabRow, flex: 1, marginBottom: 0, padding: 2 }}>
      {[
        { v: "schedule", l: "대진표" },
        { v: "free", l: "자유" },
        { v: "push", l: "밀어내기" },
      ].map(o => (
        <button key={o.v}
          onClick={() => { set('matchMode', o.v); if (o.v === "push") set('courtCount', 1); }}
          style={s.tab(matchMode === o.v)}>{o.l}</button>
      ))}
    </div>
  </div>

  <div className="app-row">
    <span className="app-row-title" style={{ flex: "0 0 70px" }}>편성</span>
    <div style={{ ...s.tabRow, flex: 1, marginBottom: 0, padding: 2 }}>
      <button onClick={() => set('draftMode', 'snake')} style={s.tab(draftMode === "snake")}>스네이크</button>
      <button onClick={() => set('draftMode', 'free')} style={s.tab(draftMode === "free")}>자유</button>
    </div>
  </div>

  {courtCount === 1 && matchMode === "schedule" && (
    <div className="app-row">
      <span className="app-row-title" style={{ flex: "0 0 70px" }}>회전</span>
      <div style={{ ...s.tabRow, flex: 1, marginBottom: 0, padding: 2 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => set('rotations', n)} style={s.tab(rotations === n)}>{n}</button>
        ))}
      </div>
    </div>
  )}
</div>
```

이 구조에서 각 row의 좌측은 한글 라벨, 우측은 세그먼트. iOS 설정 앱 + Toggle 변형 형태. 한눈에 스캔 가능.

### 2. 힌트 박스

기존 `{ teamCount === 4 && "동일팀 4번씩..." }` 메시지는 카드 밖 footer-note로:

```jsx
{matchMode === "schedule" && courtCount === 2 && (
  <div style={{
    fontSize: 13, color: "var(--app-text-secondary)",
    padding: "0 16px", marginBottom: 16,
  }}>
    {teamCount === 4 && "동일팀 4번씩 경기 · 12라운드"}
    {teamCount === 5 && "동일팀 2번씩 경기 · 10라운드"}
    {teamCount === 6 && "조별리그 → 순위별 재편성 · 12라운드"}
  </div>
)}
```

Apple HIG의 "grouped list footer" 패턴.

### 3. 참석자 선택 영역

제목 + 버튼 영역을 정리:

```jsx
<div className="app-section-label">
  참석자 <span style={{ color: "var(--app-text-tertiary)" }}>({attendees.length}명)</span>
</div>

<div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", padding: "0 4px" }}>
  <button onClick={syncAttendance} disabled={attendanceLoading}
    style={{ ...s.btnSm("var(--app-green)", "#fff"), opacity: attendanceLoading ? 0.6 : 1 }}>
    <ListIcon width={14} style={{ marginRight: 4 }}/> 시트 연동
  </button>
  <button onClick={() => dispatch({ type: 'SET_ATTENDEES', attendees: sortedPlayers.filter(p => p.games > 0).map(p => p.name) })}
    style={s.btnSm()}>활동선수 전체</button>
  <button onClick={() => set('attendees', [])} style={s.btnSm()}>초기화</button>
  <div style={{ flex: 1 }} />
  <div style={{ ...s.tabRow, marginBottom: 0, padding: 2, flex: "0 0 auto" }}>
    <button onClick={() => set('playerSortMode', 'point')} style={s.tab(playerSortMode === "point")}>포인트순</button>
    <button onClick={() => set('playerSortMode', 'name')} style={s.tab(playerSortMode === "name")}>이름순</button>
  </div>
</div>

<div style={s.card}>
  <div style={{ display: "flex", flexWrap: "wrap" }}>
    {sortedPlayers.map(p => (
      <div key={p.name} onClick={() => dispatch({ type: 'TOGGLE_ATTENDEE', name: p.name })}
        style={s.chip(attendees.includes(p.name))}>
        <span>{p.name}</span>
        <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4 }}>{p.point}p</span>
      </div>
    ))}
  </div>
</div>

<div style={{ display: "flex", gap: 8, marginTop: 12 }}>
  <input style={s.input} placeholder="새 선수 이름" value={newPlayer}
    onChange={e => set('newPlayer', e.target.value)}
    onKeyDown={e => { if (e.key === "Enter") addGuestPlayer(); }} />
  <button onClick={addGuestPlayer} style={s.btn(C.green)}>
    <PlusIcon width={16}/>
  </button>
</div>
```

### 4. 헤더 정리

```jsx
<div style={s.header}>
  <div style={s.title}>
    <SoccerBallIcon width={18}/>
    <span>{teamContext?.team || "풋살"} 경기기록</span>
  </div>
  <div style={s.subtitle}>
    {new Date().toLocaleDateString("ko-KR")} · {teamContext?.mode || "풋살"}
    <span style={{
      marginLeft: 8, fontSize: 11, padding: "1px 6px", borderRadius: 4,
      background: dataSource === "sheet" ? "rgba(52,199,89,0.15)" : "rgba(255,149,0,0.15)",
      color: dataSource === "sheet" ? "var(--app-green)" : "var(--app-orange)",
      fontWeight: 500,
    }}>{dataSource === "sheet" ? "연동됨" : "오프라인"}</span>
  </div>
  {authUser && (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 6 }}>
      <span style={{ fontSize: 12, color: "var(--app-text-secondary)" }}>
        {authUser.name} · {teamContext?.team}
      </span>
      {onBackToMenu && (
        <button onClick={onBackToMenu} style={headerChipBtn}>메뉴</button>
      )}
      <button onClick={onLogout} style={headerChipBtn}>로그아웃</button>
    </div>
  )}
</div>
```

`headerChipBtn`:
```js
const headerChipBtn = {
  fontSize: 12, padding: "2px 8px", borderRadius: 6,
  background: "var(--app-bg-row-hover)", color: "var(--app-text-secondary)",
  border: 0, cursor: "pointer",
};
```

## 검증
- [ ] 설정 블록이 5개 row로 정리된 단일 grouped 카드
- [ ] 각 row가 좌: 라벨 / 우: segment 구조
- [ ] footer hint가 회색 본문으로 표시
- [ ] 참석자 툴바 정렬 (좌: 액션 버튼 / 우: 정렬 segment)
- [ ] 상단 데이터 상태 배지 색상 적절
- [ ] lint 통과
