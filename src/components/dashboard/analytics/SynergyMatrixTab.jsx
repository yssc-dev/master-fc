// src/components/dashboard/analytics/SynergyMatrixTab.jsx
import { useState, useMemo } from 'react';
import { calcSynergyMatrix } from '../../../utils/analyticsV2/calcSynergyMatrix';

export default function SynergyMatrixTab({ matchLogs, C }) {
  const [hover, setHover] = useState(null);
  const [selected, setSelected] = useState(null);
  const [sortMode, setSortMode] = useState('default');

  const data = useMemo(() => calcSynergyMatrix({ matchLogs: matchLogs || [], minRounds: 5 }), [matchLogs]);

  const players = useMemo(() => {
    if (sortMode === 'default') return data.players;
    const avg = {};
    for (const p of data.players) {
      let sum = 0, cnt = 0;
      for (const q of data.players) {
        if (p === q) continue;
        const [a, b] = [p, q].sort((x, y) => x.localeCompare(y, 'ko'));
        const cell = data.cells[`${a}|${b}`];
        if (!cell || cell.games < data.minRounds) continue;
        sum += cell.winRate; cnt += 1;
      }
      avg[p] = cnt > 0 ? sum / cnt : null;
    }
    const list = [...data.players];
    list.sort((p, q) => {
      const av = avg[p], bv = avg[q];
      if (av == null && bv == null) return p.localeCompare(q, 'ko');
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortMode === 'low' ? av - bv : bv - av;
    });
    return list;
  }, [data, sortMode]);

  if (!matchLogs || matchLogs.length === 0) {
    return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>로그_매치 데이터가 없습니다.</div>;
  }

  const colorFor = (cell, isDiag, isSelected) => {
    if (isSelected) return "rgba(255,255,255,0.25)";
    if (isDiag) return "#1a1a1a";
    if (!cell || cell.games < data.minRounds) return "#2a2a2a";
    const wr = cell.winRate;
    if (wr >= 0.6) return `rgba(34,197,94,${0.4 + Math.min(0.5, wr - 0.6)})`;
    if (wr <= 0.4) return `rgba(239,68,68,${0.4 + Math.min(0.5, 0.4 - wr)})`;
    return "#4a4a4a";
  };

  const cellSize = 24;
  const nameColWidth = 60;
  const active = selected || hover;
  const isCellSelected = (a, b) => selected && ((selected.a === a && selected.b === b) || (selected.a === b && selected.b === a));

  return (
    <div style={{ paddingBottom: 56 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: C.gray }}>정렬:</span>
        {[
          { k: 'default', l: '기본' },
          { k: 'low', l: '역시너지 TOP' },
          { k: 'high', l: '시너지 TOP' },
        ].map(({ k, l }) => (
          <button key={k} onClick={() => setSortMode(k)} style={{
            padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 600,
            background: sortMode === k ? C.accent : 'transparent',
            color: sortMode === k ? C.black : C.gray,
            border: `1px solid ${sortMode === k ? C.accent : C.grayDarker}`,
            cursor: 'pointer',
          }}>{l}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        같은팀 출전 라운드의 팀승률. 초록=고승률, 빨강=저승률, 회색=표본 부족(&lt; {data.minRounds}경기). 셀을 탭하면 아래 상세가 고정됩니다.
      </div>
      <div style={{ overflow: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 9 }}>
          <thead>
            <tr>
              <th style={{ width: nameColWidth }}></th>
              {players.map(p => (
                <th key={p} style={{ width: cellSize, writingMode: "vertical-rl", color: C.gray, fontWeight: 500, padding: 2, position: "sticky", top: 0, zIndex: 9, background: C.bg }}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map(a => (
              <tr key={a} style={{ height: cellSize }}>
                <td style={{ color: C.gray, paddingRight: 6, textAlign: "right", fontSize: 10 }}>{a}</td>
                {players.map(b => {
                  const sortedKey = [a, b].sort((x, y) => x.localeCompare(y, 'ko'));
                  const key = `${sortedKey[0]}|${sortedKey[1]}`;
                  const cell = data.cells[key];
                  const isDiag = a === b;
                  const tappable = cell && cell.games >= data.minRounds;
                  const sel = isCellSelected(a, b);
                  return (
                    <td key={b}
                      onMouseEnter={() => !isDiag && tappable && setHover({ a, b, cell })}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => {
                        if (isDiag || !tappable) return;
                        if (sel) setSelected(null);
                        else setSelected({ a, b, cell });
                      }}
                      style={{
                        width: cellSize, height: cellSize,
                        background: colorFor(cell, isDiag, sel),
                        border: sel ? `1px solid ${C.white}` : `1px solid ${C.grayDarker}`,
                        cursor: !isDiag && tappable ? "pointer" : "default",
                      }} />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{
        position: "sticky", bottom: 0, zIndex: 10,
        marginTop: 12, padding: "10px 12px",
        background: C.cardLight, borderRadius: 8,
        fontSize: 12, color: active ? C.white : C.gray, minHeight: 36, boxSizing: "border-box",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        boxShadow: "0 -2px 8px rgba(0,0,0,0.4)",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {active ? (
            active.a === active.b ? (
              <><b>{active.a}</b> 개인 전체: {active.cell.games}경기 {active.cell.wins}승 {active.cell.draws}무 {active.cell.losses}패 · 승률 {Math.round(active.cell.winRate * 100)}%</>
            ) : (
              <><b>{active.a} × {active.b}</b>: {active.cell.games}경기 {active.cell.wins}승 {active.cell.draws}무 {active.cell.losses}패 · 승률 {Math.round(active.cell.winRate * 100)}%</>
            )
          ) : (
            <span>셀을 탭하거나 호버하면 상세가 표시됩니다.</span>
          )}
        </div>
        {selected && (
          <button onClick={() => setSelected(null)}
            style={{ padding: "4px 8px", fontSize: 10, borderRadius: 4, border: `1px solid ${C.grayDarker}`, background: "transparent", color: C.gray, cursor: "pointer", whiteSpace: "nowrap" }}>
            해제
          </button>
        )}
      </div>
    </div>
  );
}
