import { useState, useMemo } from 'react';
import { sortSynergyWithTieBreak } from '../../utils/playerAnalyticsUtils';

export default function SynergyTab({ synergyData, playerLog, C }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const players = useMemo(() => {
    return Object.keys(synergyData).sort((a, b) => a.localeCompare(b, "ko"));
  }, [synergyData]);

  const selected = selectedPlayer || players[0];

  const partners = useMemo(() => {
    if (!selected || !synergyData[selected]) return [];
    return Object.entries(synergyData[selected])
      .filter(([, s]) => s.games >= 2)
      .map(([name, s]) => ({ name, ...s }));
  }, [selected, synergyData]);

  const top5 = useMemo(() => sortSynergyWithTieBreak(partners, 'best').slice(0, 5), [partners]);
  const bottom5 = useMemo(() => sortSynergyWithTieBreak(partners, 'worst').slice(0, 5), [partners]);

  const renderRow = (p, i, color) => (
    <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.grayDarker}` }}>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 16 }}>{i + 1}</span>
      <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{p.name}</span>
      <span style={{ fontSize: 11, color: C.gray }}>{p.games}라운드 중 {p.wins}승 {p.draws}무 {p.losses}패</span>
      <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 40, textAlign: "right" }}>{Math.round(p.winRate * 100)}%</span>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <select value={selected || ""} onChange={e => setSelectedPlayer(e.target.value)}
          style={{ width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 14, fontWeight: 700, background: C.cardLight, color: C.white, border: `1px solid ${C.grayDark}` }}>
          {players.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      {selected && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#22c55e", marginBottom: 6 }}>Best 시너지 TOP 5</div>
            {top5.length === 0 ? <div style={{ fontSize: 12, color: C.gray }}>데이터 부족 (최소 2경기)</div> :
              top5.map((p, i) => renderRow(p, i, "#22c55e"))}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", marginBottom: 6 }}>Worst 시너지 TOP 5</div>
            {bottom5.length === 0 ? <div style={{ fontSize: 12, color: C.gray }}>데이터 부족</div> :
              bottom5.map((p, i) => renderRow(p, i, "#ef4444"))}
          </div>
        </div>
      )}
    </div>
  );
}
