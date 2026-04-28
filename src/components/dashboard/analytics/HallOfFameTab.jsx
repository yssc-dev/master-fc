import { useState, useMemo } from 'react';
import { calcPersonalRecords } from '../../../utils/analyticsV2/calcPersonalRecords';
import { calcMonthlyRanking } from '../../../utils/analyticsV2/calcMonthlyRanking';

export default function HallOfFameTab({ playerGameLogs, matchLogs, C }) {
  const players = useMemo(() => {
    const set = new Set();
    (playerGameLogs || []).forEach(p => set.add(p.player));
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [playerGameLogs]);

  const months = useMemo(() => {
    const set = new Set();
    (playerGameLogs || []).forEach(p => {
      if (p.date && p.date.length >= 7) set.add(p.date.substring(0, 7));
    });
    return [...set].sort().reverse();
  }, [playerGameLogs]);

  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');

  const effectivePlayer = selectedPlayer || players[0] || '';
  const effectiveMonth = selectedMonth || months[0] || '';

  const pr = useMemo(() =>
    effectivePlayer ? calcPersonalRecords({ playerName: effectivePlayer, playerLogs: playerGameLogs || [] }) : null
  , [effectivePlayer, playerGameLogs]);

  const ranking = useMemo(() =>
    effectiveMonth ? calcMonthlyRanking({ yearMonth: effectiveMonth, playerLogs: playerGameLogs || [], matchLogs: matchLogs || [] }) : null
  , [effectiveMonth, playerGameLogs, matchLogs]);

  const selectStyle = { width: "100%", padding: "10px 14px", borderRadius: 50, fontSize: 14, fontWeight: 480, background: "transparent", color: C.white, border: `1.2px dashed ${C.grayDark}`, fontFamily: "inherit", appearance: "none", cursor: "pointer" };
  const sectionLabel = { fontSize: 13, fontWeight: 700, color: C.white, margin: "18px 0 8px" };
  const rowStyle = { display: "flex", justifyContent: "space-between", padding: "6px 10px", borderBottom: `1px dashed ${C.grayDarker}`, fontSize: 12 };

  return (
    <div>
      <div style={sectionLabel}>개인 기록 (PR)</div>
      <select value={effectivePlayer} onChange={e => setSelectedPlayer(e.target.value)} style={selectStyle}>
        {players.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      {pr && (
        <div style={{ marginTop: 10, background: C.cardLight, borderRadius: 8, padding: "10px 12px" }}>
          {pr.mostGoals ? (
            <div style={rowStyle}>
              <span style={{ color: C.gray }}>⚽ 최다골</span>
              <span style={{ color: C.white, fontWeight: 700 }}>{pr.mostGoals.value}골 <span style={{ color: C.gray, fontWeight: 400 }}>({pr.mostGoals.date})</span></span>
            </div>
          ) : <div style={rowStyle}><span style={{ color: C.gray }}>⚽ 최다골</span><span style={{ color: C.gray }}>-</span></div>}
          {pr.mostAssists ? (
            <div style={rowStyle}>
              <span style={{ color: C.gray }}>🅰 최다어시</span>
              <span style={{ color: C.white, fontWeight: 700 }}>{pr.mostAssists.value}어시 <span style={{ color: C.gray, fontWeight: 400 }}>({pr.mostAssists.date})</span></span>
            </div>
          ) : <div style={rowStyle}><span style={{ color: C.gray }}>🅰 최다어시</span><span style={{ color: C.gray }}>-</span></div>}
          {pr.longestCleanSheet ? (
            <div style={rowStyle}>
              <span style={{ color: C.gray }} title="GK로 출전한 경기일을 시간순으로 봤을 때 무실점이 연속된 최대 길이">🧤 GK 최장 무실점</span>
              <span style={{ color: C.white, fontWeight: 700 }}>{pr.longestCleanSheet.value}회 <span style={{ color: C.gray, fontWeight: 400 }}>({pr.longestCleanSheet.startDate}~{pr.longestCleanSheet.endDate})</span></span>
            </div>
          ) : <div style={rowStyle}><span style={{ color: C.gray }}>🧤 GK 최장 무실점</span><span style={{ color: C.gray }}>-</span></div>}
        </div>
      )}

      <div style={sectionLabel}>월별 랭킹</div>
      <select value={effectiveMonth} onChange={e => setSelectedMonth(e.target.value)} style={selectStyle}>
        {months.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      {ranking && (
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <RankingCard title="⚽ 득점" rows={ranking.goals} suffix="골" C={C} />
          <RankingCard title="🅰 어시" rows={ranking.assists} suffix="어시" C={C} />
          <RankingCard title="🏁 승률" rows={ranking.winRate.map(x => ({ player: x.player, value: `${Math.round(x.value * 100)}%` }))} suffix="" C={C} />
        </div>
      )}
    </div>
  );
}

function RankingCard({ title, rows, suffix, C }) {
  return (
    <div style={{ background: C.cardLight, borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 10, color: C.gray }}>-</div>
      ) : rows.map((r, i) => (
        <div key={r.player} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
          <span style={{ color: C.white }}>{i + 1}. {r.player}</span>
          <span style={{ color: C.white, fontWeight: 700 }}>{r.value}{suffix}</span>
        </div>
      ))}
    </div>
  );
}
