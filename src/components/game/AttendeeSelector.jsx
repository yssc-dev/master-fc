import { useTheme } from '../../hooks/useTheme';

// 참석명단 선택 UI (setup·경기중 명단수정 공용)
// props: attendees(string[]), sortedPlayers([{name,point,games}]), playerSortMode,
//   onSyncSheet, onToggle(name), onSetAll(names), onClear, onToggleSort,
//   onAddManual(name), newPlayer, onNewPlayerChange, attendanceLoading, styles(s)
export default function AttendeeSelector({
  attendees, sortedPlayers, playerSortMode, lockedNames = [],
  onSyncSheet, onToggle, onSetAll, onClear, onToggleSort,
  onAddManual, newPlayer, onNewPlayerChange, attendanceLoading, styles: s,
}) {
  const { C } = useTheme();
  // 표시 전용. 실제 차단은 호출부(SoccerApp의 rosterHandlers)가 최종 방어선이라
  // 여기가 뚫려도 데이터는 안전하다.
  const locked = new Set(lockedNames);
  const addManual = () => {
    const name = (newPlayer || "").trim();
    if (name && !attendees.includes(name)) onAddManual(name);
  };

  // 참석/불참을 위아래로 가른다. 정렬은 sortedPlayers 순서를 그대로 물려받는다.
  const attending = new Set(attendees);
  const present = sortedPlayers.filter(p => attending.has(p.name));
  const absent = sortedPlayers.filter(p => !attending.has(p.name));

  const sectionLabel = { fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 };
  const emptyHint = { fontSize: 12, color: C.gray };

  const renderChip = (p) => {
    const isLocked = locked.has(p.name);
    return (
      <div key={p.name}
        onClick={() => { if (!isLocked) onToggle(p.name); }}
        title={isLocked ? "출전 기록이 있어 불참으로 바꿀 수 없습니다" : undefined}
        style={{ ...s.chip(attending.has(p.name)), cursor: isLocked ? "not-allowed" : "pointer" }}>
        <span>{isLocked ? "🔒 " : ""}{p.name}</span><span style={{ fontSize: 10, opacity: 0.7 }}>{p.point}p</span>
      </div>
    );
  };
  return (
    <div>
      <div style={{ ...s.row, marginBottom: 10, flexWrap: "wrap" }}>
        <button onClick={onSyncSheet} disabled={attendanceLoading} style={{ ...s.btnSm("#22c55e"), opacity: attendanceLoading ? 0.6 : 1 }}>
          {attendanceLoading ? "연동 중..." : "📋 시트에서 불러오기"}
        </button>
        <button onClick={() => onSetAll(sortedPlayers.filter(p => p.games > 0).map(p => p.name))} style={s.btnSm(C.grayDark)}>활동선수 전체</button>
        <button onClick={onClear} style={s.btnSm(C.grayDark)}>초기화</button>
        <button onClick={onToggleSort} style={s.btnSm(C.accentDim, C.white)}>
          {playerSortMode === "point" ? "포인트순" : "이름순"}
        </button>
      </div>
      <div style={sectionLabel}>참석 {present.length}</div>
      <div style={s.card}>
        <div style={{ display: "flex", flexWrap: "wrap" }}>{present.map(renderChip)}</div>
        {present.length === 0 && <span style={emptyHint}>아직 아무도 참석으로 표시되지 않았습니다</span>}
        {lockedNames.length > 0 && (
          <div style={{ fontSize: 11, color: C.gray, marginTop: 8 }}>
            🔒 = 오늘 출전 기록이 있어 해제할 수 없습니다 ({lockedNames.length}명)
          </div>
        )}
      </div>

      <div style={{ ...sectionLabel, marginTop: 12 }}>불참 {absent.length}</div>
      <div style={s.card}>
        <div style={{ display: "flex", flexWrap: "wrap" }}>{absent.map(renderChip)}</div>
        {absent.length === 0 && <span style={emptyHint}>전원 참석</span>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input style={s.input} placeholder="새 선수 이름" value={newPlayer || ""}
          onChange={e => onNewPlayerChange(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") addManual(); }} />
        <button onClick={addManual} style={s.btn(C.green)}>추가</button>
      </div>
    </div>
  );
}
