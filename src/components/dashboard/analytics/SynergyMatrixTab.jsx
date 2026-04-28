import { useMemo, useState } from 'react';
import { calcSynergyMatrix } from '../../../utils/analyticsV2/calcSynergyMatrix';

export default function SynergyMatrixTab({ matchLogs, C }) {
  const [hover, setHover] = useState(null);
  const data = useMemo(() => calcSynergyMatrix({ matchLogs: matchLogs || [], minRounds: 5 }), [matchLogs]);

  if (!matchLogs || matchLogs.length === 0) {
    return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>로그_매치 데이터가 없습니다.</div>;
  }

  const colorFor = (cell, isDiag) => {
    if (isDiag) return "#1a1a1a";
    if (!cell || cell.games < data.minRounds) return "#2a2a2a";
    const wr = cell.winRate;
    if (wr >= 0.6) return `rgba(34,197,94,${0.4 + Math.min(0.5, wr - 0.6)})`;
    if (wr <= 0.4) return `rgba(239,68,68,${0.4 + Math.min(0.5, 0.4 - wr)})`;
    return "#4a4a4a";
  };

  const cellSize = 24;
  const nameColWidth = 60;

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        같은팀 출전 라운드의 팀승률. 초록=고승률, 빨강=저승률, 회색=표본 부족(&lt; {data.minRounds}경기).
      </div>
      <div style={{ position: "sticky", top: 0, zIndex: 10, marginBottom: 8, padding: "6px 10px", background: C.cardLight, borderRadius: 6, fontSize: 11, color: hover ? C.white : C.gray, minHeight: 28, boxSizing: "border-box" }}>
        {hover ? (
          hover.a === hover.b ? (
            <><b>{hover.a}</b> 개인 전체: {hover.cell.games}경기 {hover.cell.wins}승 {hover.cell.draws}무 {hover.cell.losses}패 · 승률 {Math.round(hover.cell.winRate * 100)}%</>
          ) : (
            <><b>{hover.a} × {hover.b}</b>: {hover.cell.games}경기 {hover.cell.wins}승 {hover.cell.draws}무 {hover.cell.losses}패 · 승률 {Math.round(hover.cell.winRate * 100)}%</>
          )
        ) : (
          <span>셀에 마우스를 올리면 상세가 표시됩니다.</span>
        )}
      </div>
      <div style={{ overflow: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 9 }}>
          <thead>
            <tr>
              <th style={{ width: nameColWidth }}></th>
              {data.players.map(p => (
                <th key={p} style={{ width: cellSize, writingMode: "vertical-rl", color: C.gray, fontWeight: 500, padding: 2, position: "sticky", top: 28, zIndex: 9, background: C.bg }}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.players.map(a => (
              <tr key={a} style={{ height: cellSize }}>
                <td style={{ color: C.gray, paddingRight: 6, textAlign: "right", fontSize: 10 }}>{a}</td>
                {data.players.map(b => {
                  const sortedKey = [a, b].sort((x, y) => x.localeCompare(y, 'ko'));
                  const key = `${sortedKey[0]}|${sortedKey[1]}`;
                  const cell = data.cells[key];
                  const isDiag = a === b;
                  return (
                    <td key={b}
                      onMouseEnter={() => !isDiag && cell && cell.games >= data.minRounds && setHover({ a, b, cell })}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        width: cellSize, height: cellSize,
                        background: colorFor(cell, isDiag),
                        border: `1px solid ${C.grayDarker}`,
                        cursor: !isDiag && cell ? "pointer" : "default",
                      }} />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
