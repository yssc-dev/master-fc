import { useTheme } from '../../hooks/useTheme';

// 참석명단 선택 UI (setup·경기중 명단수정 공용)
// props: attendees(string[]), sortedPlayers([{name,point,games}]), playerSortMode,
//   onSyncSheet, onToggle(name), onSetAll(names), onClear, onToggleSort,
//   onAddManual(name), newPlayer, onNewPlayerChange, attendanceLoading, styles(s)
export default function AttendeeSelector({
  attendees, sortedPlayers, playerSortMode,
  onSyncSheet, onToggle, onSetAll, onClear, onToggleSort,
  onAddManual, newPlayer, onNewPlayerChange, attendanceLoading, styles: s,
}) {
  const { C } = useTheme();
  const addManual = () => {
    const name = (newPlayer || "").trim();
    if (name && !attendees.includes(name)) onAddManual(name);
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
      <div style={s.card}>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {sortedPlayers.map(p => (
            <div key={p.name} onClick={() => onToggle(p.name)} style={s.chip(attendees.includes(p.name))}>
              <span>{p.name}</span><span style={{ fontSize: 10, opacity: 0.7 }}>{p.point}p</span>
            </div>
          ))}
        </div>
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
