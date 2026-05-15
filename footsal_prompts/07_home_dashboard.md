# 07. HomeScreen + TeamDashboard 재정렬

**파일:** `src/components/home/HomeScreen.jsx`, `src/components/dashboard/TeamDashboard.jsx`

## HomeScreen

**현재 문제:**
- `"안녕, {name}."` 제목이 40px serif italic으로 Monochrome 컨셉에 맞춰짐 → Apple은 **large title** 34px, 기울임 없이
- 팀 카드가 개별로 떨어져 있고 dashed 스타일 "+ 팀 추가" 카드가 섞여 시각적으로 어지러움

**고치는 방법:**

```jsx
<div style={{ background: "var(--app-bg-grouped)", minHeight: "100vh",
              padding: "60px 16px 40px", maxWidth: 500, margin: "0 auto",
              fontFamily: "var(--app-font-sans)" }}>

  {/* 우상단 다크모드 토글은 더 작게 + 아이콘만 */}
  <button onClick={toggle} style={{
    position: "fixed", top: 16, right: 16, zIndex: 10,
    background: "var(--app-bg-row)", border: "0.5px solid var(--app-divider)",
    borderRadius: 999, width: 36, height: 36,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    color: "var(--app-text-primary)", cursor: "pointer",
  }}>
    {mode === "dark" ? <SunIcon width={16}/> : <MoonIcon width={16}/>}
  </button>

  {/* Large Title */}
  <div style={{ margin: "24px 0 28px" }}>
    <h1 style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1,
                 letterSpacing: "-0.022em", margin: 0,
                 color: "var(--app-text-primary)" }}>
      안녕, {authUser.name}
    </h1>
    <p style={{ fontSize: 15, color: "var(--app-text-secondary)", marginTop: 6 }}>
      팀을 선택해주세요
    </p>
  </div>

  <div className="app-section-label">팀</div>
  <div className="app-grouped" style={{ marginBottom: 24 }}>
    {teamNames.map(teamName => {
      const entries = teamGroups[teamName];
      const isCurrent = teamName === selectedTeamName;
      const isAdmin = entries.some(e => e.role === "관리자");
      return (
        <button key={teamName} className="app-row"
          onClick={() => onSelectTeam(teamName, entries)}
          style={{ width: "100%", textAlign: "left",
                   background: "var(--app-bg-row)",
                   border: 0, fontFamily: "inherit", cursor: "pointer" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="app-row-title" style={{ fontWeight: 500 }}>{teamName}</span>
              {isAdmin && (
                <span style={{
                  fontSize: 11, padding: "1px 6px", borderRadius: 4,
                  background: "rgba(255,149,0,0.15)", color: "var(--app-orange)",
                  fontWeight: 500,
                }}>관리자</span>
              )}
            </div>
            <div className="app-row-sub">{entries.map(e => e.mode).join(" · ")}</div>
          </div>
          {isCurrent && <CheckIcon color="var(--app-blue)" width={18} />}
          <ChevronRight color="var(--app-text-tertiary)" width={14} />
        </button>
      );
    })}
  </div>

  <div className="app-section-label">기타</div>
  <div className="app-grouped" style={{ marginBottom: 24 }}>
    <button className="app-row" onClick={() => setShowAddInfo(true)}
      style={{ width: "100%", textAlign: "left", background: "var(--app-bg-row)",
               border: 0, fontFamily: "inherit", cursor: "pointer",
               color: "var(--app-blue)" }}>
      <PlusIcon color="var(--app-blue)" width={18} />
      <span className="app-row-title" style={{ color: "var(--app-blue)" }}>팀 추가하기</span>
    </button>
    <button className="app-row" onClick={onLogout}
      style={{ width: "100%", textAlign: "left", background: "var(--app-bg-row)",
               border: 0, fontFamily: "inherit", cursor: "pointer",
               color: "var(--app-red)" }}>
      <span className="app-row-title" style={{ color: "var(--app-red)" }}>로그아웃</span>
    </button>
  </div>

  {showAddInfo && (
    /* 기존 박스 유지하되 app-grouped + app-row 구조로 */
  )}
</div>
```

**핵심 변경점:**
- italic 제거
- dashed 경계 모두 제거
- 팀명 옆 "CURRENT" mono 라벨 제거 → 우측 파란 체크 아이콘
- 관리자 배지 mono/uppercase 제거 → 주황 틴트 배경
- 팀 추가 + 로그아웃을 두 번째 grouped list로 묶음 (iOS 설정 앱 패턴)

## TeamDashboard

**현재 문제:**
- 상단 sports tab이 `sportTab` 전용 스타일로 pill
- `sectionTitle`이 mono/uppercase
- 테이블이 dashed border

**고치는 방법 (핵심만):**

1. `sportTab`을 `makeStyles`의 `tab` 스타일(iOS segment)로 교체 (02 프롬프트 완료 후 자동 적용 — 기존 로컬 sportTab을 제거하고 `s.tab(active)` 재사용)

2. `sectionTitle` 로컬 정의를 삭제하고 `s.sectionTitle`(02 프롬프트) 재사용 — uppercase 제거됨

3. 상단 "안녕, {name}. Teams → {teamName}" 영역 교체. Apple 스타일 **Large Title + 우측 아이콘 버튼**:

```jsx
<div style={{ padding: "24px 20px 12px" }}>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
    <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.022em",
                 color: "var(--app-text-primary)", margin: 0 }}>
      {teamName}
    </h1>
    <div style={{ display: "flex", gap: 6 }}>
      <button onClick={toggle} style={iconBtnStyle}>{mode === "dark" ? <SunIcon/> : <MoonIcon/>}</button>
      <button onClick={onSettings} style={iconBtnStyle}><SettingsIcon/></button>
      <button onClick={onSwitchTeam} style={iconBtnStyle}><BackIcon/></button>
    </div>
  </div>
  <div style={{ fontSize: 15, color: "var(--app-text-secondary)" }}>{authUser.name}</div>
</div>
```

`iconBtnStyle`:
```js
const iconBtnStyle = {
  background: "var(--app-bg-row)", border: "0.5px solid var(--app-divider)",
  borderRadius: 999, width: 36, height: 36,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  color: "var(--app-text-primary)", cursor: "pointer",
};
```

4. "경기 시작 / 이어하기 / 기록 보기" 액션 버튼들을 **primary 1개 + secondary 2개** 계층으로:
- "경기 시작" = 파란 filled (`s.btnFull`)
- "이어하기" = blue tinted (bg: `rgba(0,122,255,0.12)`, color: `var(--app-blue)`)
- "기록 보기" = plain (bg: `var(--app-bg-row)`, border: `0.5px solid var(--app-divider)`)

5. 선수 랭킹 테이블의 dashed를 02에서 이미 solid로 바꿨을 것. 추가로 **1등 row만 파란색 강조**:
```js
style={{ color: idx === 0 ? "var(--app-blue)" : ... }}
```

## 검증
- [ ] HomeScreen에 italic/dashed/uppercase 사라짐
- [ ] 팀 목록이 한 그룹 카드로 묶임, 현재 팀에 파란 체크
- [ ] TeamDashboard 상단이 Large Title + 우측 아이콘 버튼 3개
- [ ] 스포츠 탭이 segment 스타일
- [ ] 액션 버튼 3개에 뚜렷한 계층
- [ ] lint 통과
