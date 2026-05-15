# 09. CourtRecorder — Apple 스코어보드 + 선수 그리드

**파일:** `src/components/game/CourtRecorder.jsx`

## 문제
- 현재 스코어보드가 56px pill 영역에 `fontWeight 480`, 팀명/점수가 수평 나열돼 있어 시선이 분산됨
- 선수 버튼(matchBtn)이 rounded 50px pill → Apple 톤에 안 맞음 (02에서 이미 10px로 수정했지만 선수 버튼 레이아웃은 별도 작업 필요)
- "OPP" 라벨이 dashed border (mono uppercase)
- 음성/키퍼/자책 등 다수 버튼이 평면 나열돼 기능 위계가 안 보임

## 고치는 방법

### 1. 스코어보드 재디자인

경기 헤더 영역을 3-column (home / score / away) 구조로:

```jsx
<div style={{
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: 12,
  padding: "16px 8px",
  background: "var(--app-bg-row)",
  borderRadius: 14,
  border: "0.5px solid var(--app-divider)",
  marginBottom: 16,
}}>
  {/* Home team */}
  <div style={{ textAlign: "center" }}>
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: homeColor?.bg || "var(--app-blue)" }} />
      <span style={{ fontSize: 14, fontWeight: 600, color: C.white }}>{homeTeam}</span>
    </div>
    <div style={{ fontSize: 11, color: C.gray }}>
      GK: {homeGk || "미지정"}
    </div>
  </div>

  {/* Score */}
  <div style={{
    display: "flex", alignItems: "center", gap: 8,
    fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em",
    fontVariantNumeric: "tabular-nums",
    color: C.white,
  }}>
    <span>{homeScore}</span>
    <span style={{ fontSize: 28, color: C.gray, fontWeight: 400 }}>:</span>
    <span>{awayScore}</span>
  </div>

  {/* Away team */}
  <div style={{ textAlign: "center" }}>
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: awayColor?.bg || "var(--app-red)" }} />
      <span style={{ fontSize: 14, fontWeight: 600, color: C.white }}>{awayTeam}</span>
    </div>
    <div style={{ fontSize: 11, color: C.gray }}>
      GK: {awayGk || "미지정"}
    </div>
  </div>
</div>
```

### 2. 선수 버튼 그리드

현재 선수들이 flex-wrap으로 흩어져 있음. Apple의 large-tap-target + grid로:

```jsx
<div className="app-section-label" style={{ marginLeft: 4 }}>{homeTeam}</div>
<div style={{
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))",
  gap: 8,
  marginBottom: 16,
}}>
  {homePlayers.map(p => {
    const isGk = p === homeGk;
    return (
      <button key={p}
        onClick={() => handleGoalTap(p, true)}
        onContextMenu={(e) => { e.preventDefault(); toggleGk(p, true); }}
        style={{
          background: isGk ? "rgba(0,122,255,0.12)" : "var(--app-bg-row-hover)",
          color: isGk ? "var(--app-blue)" : C.white,
          border: isGk ? "0.5px solid var(--app-blue)" : "0.5px solid transparent",
          borderRadius: 10,
          padding: "12px 8px", minHeight: 56,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 2, cursor: "pointer", fontFamily: "inherit",
          fontSize: 14, fontWeight: 500,
          position: "relative",
        }}>
        {isGk && <span style={{
          position: "absolute", top: 4, right: 6,
          fontSize: 10, fontWeight: 600,
          color: "var(--app-blue)",
        }}>GK</span>}
        <span>{p}</span>
      </button>
    );
  })}
</div>
```

GK 토글은 long-press 또는 우클릭 대신 **카드 상단 우측에 작은 GK 배지 탭** 추가할 수도 있음. 장기 테스트 필요한 부분이라 우선은 컨텍스트 메뉴로.

### 3. OPP 라벨

dashed + mono UPPERCASE 제거:
```jsx
{isOpposing && (
  <span style={{
    fontSize: 10, fontWeight: 600,
    padding: "1px 6px", borderRadius: 4,
    background: "rgba(255,149,0,0.15)",
    color: "var(--app-orange)",
    marginRight: 4,
  }}>용병</span>
)}
```

### 4. 액션 버튼 영역 (음성/자책/수정 등) 재정렬

하단 고정 액션을 **primary 1개 + icon secondary N개** 구조로:

```jsx
<div style={{
  display: "flex", alignItems: "center", gap: 8,
  padding: "10px 0", borderTop: "0.5px solid var(--app-divider)",
}}>
  {/* 음성 기록 primary */}
  <button onMouseDown={handleVoiceStart} onMouseUp={handleVoiceEnd}
    onTouchStart={handleVoiceStart} onTouchEnd={handleVoiceEnd}
    style={{
      flex: 1, minHeight: 44, borderRadius: 12,
      background: isListening ? "var(--app-red)" : "var(--app-blue)",
      color: "#fff", border: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
      fontSize: 15, fontWeight: 600, cursor: "pointer",
    }}>
    <MicIcon width={18}/>
    {isListening ? "듣는 중..." : "음성 기록"}
  </button>

  {/* 확정 */}
  <button onClick={onFinish}
    style={{
      minHeight: 44, padding: "0 14px", borderRadius: 12,
      background: "var(--app-bg-row-hover)", color: C.white,
      border: 0, fontSize: 14, fontWeight: 500, cursor: "pointer",
    }}>
    경기 종료
  </button>
</div>
```

### 5. EventLog 라인

이벤트 로그 row를 Apple row 스타일로:
```jsx
<div style={{
  display: "flex", alignItems: "center", gap: 10,
  padding: "10px 12px", borderRadius: 10,
  background: "var(--app-bg-row-hover)",
  fontSize: 14, marginBottom: 6,
}}>
  <span style={{
    fontSize: 10, padding: "2px 8px", borderRadius: 4,
    background: e.type === "goal" ? "rgba(52,199,89,0.15)" : "rgba(255,59,48,0.15)",
    color: e.type === "goal" ? "var(--app-green)" : "var(--app-red)",
    fontWeight: 600, textTransform: "none",
  }}>{e.type === "goal" ? "골" : "자책"}</span>
  ...
</div>
```

## 검증
- [ ] 스코어보드가 3-column + 팀 색 dot + GK 메타 구조
- [ ] 선수 버튼이 grid 배열, 56px 높이, GK는 파란 배지
- [ ] OPP 라벨이 dashed/uppercase 없이 주황 틴트
- [ ] 하단 음성/종료 버튼이 primary + secondary 계층
- [ ] 이벤트 로그 row가 solid bg + color-coded 배지
- [ ] lint 통과
