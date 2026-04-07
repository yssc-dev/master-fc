import { useState, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { percentile } from '../../utils/gameStateAnalyzer';

const AXES = [
  { key: "scoring", label: "득점력" },
  { key: "creativity", label: "창의력" },
  { key: "defense", label: "수비력" },
  { key: "keeping", label: "키퍼" },
  { key: "attendance", label: "참석률" },
  { key: "winRate", label: "승리기여" },
];

function RadarChart({ values, size = 200, C }) {
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  const n = AXES.length;
  const angleStep = (Math.PI * 2) / n;
  const startAngle = -Math.PI / 2;

  const getPoint = (i, ratio) => {
    const angle = startAngle + i * angleStep;
    return { x: cx + r * ratio * Math.cos(angle), y: cy + r * ratio * Math.sin(angle) };
  };

  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const dataPoints = AXES.map((_, i) => getPoint(i, (values[i] || 0) / 100));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + "Z";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridLevels.map(level => {
        const pts = Array.from({ length: n }, (_, i) => getPoint(i, level));
        return <polygon key={level} points={pts.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke={C.grayDarker} strokeWidth={0.5} />;
      })}
      {AXES.map((_, i) => {
        const p = getPoint(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={C.grayDarker} strokeWidth={0.5} />;
      })}
      <polygon points={dataPoints.map(p => `${p.x},${p.y}`).join(" ")} fill={C.accent + "33"} stroke={C.accent} strokeWidth={2} />
      {dataPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill={C.accent} />)}
      {AXES.map((axis, i) => {
        const p = getPoint(i, 1.22);
        return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fill={C.gray} fontSize={10} fontWeight={600}>{axis.label}</text>;
      })}
    </svg>
  );
}

function getPlayerType(values) {
  const [scoring, creativity] = values;
  if (scoring >= 70 && scoring > creativity * 1.5) return { label: "킬러", color: "#ef4444" };
  if (creativity >= 70 && creativity > scoring * 1.5) return { label: "메이커", color: "#3b82f6" };
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg >= 60) return { label: "올라운더", color: "#22c55e" };
  return { label: "", color: "" };
}

export default function PlayerCardTab({ playerLog, defenseStats, winStats, C }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const playerSummary = useMemo(() => {
    const map = {};
    playerLog.forEach(p => {
      if (!map[p.name]) map[p.name] = { games: 0, goals: 0, assists: 0, keeperGames: 0, conceded: 0 };
      map[p.name].games++;
      map[p.name].goals += p.goals || 0;
      map[p.name].assists += p.assists || 0;
      map[p.name].keeperGames += p.keeperGames || 0;
      map[p.name].conceded += p.conceded || 0;
    });
    return map;
  }, [playerLog]);

  const players = useMemo(() => Object.keys(playerSummary).filter(n => playerSummary[n].games >= 3).sort((a, b) => a.localeCompare(b, "ko")), [playerSummary]);
  const maxGames = useMemo(() => Math.max(...Object.values(playerSummary).map(s => s.games), 1), [playerSummary]);

  const allRawValues = useMemo(() => {
    const scoring = [], creativity = [], defense = [], keeping = [], attendance = [], winRate = [];
    players.forEach(name => {
      const s = playerSummary[name];
      const d = defenseStats[name];
      const w = winStats[name];
      scoring.push(s.games > 0 ? s.goals / s.games : 0);
      creativity.push(s.games > 0 ? s.assists / s.games : 0);
      defense.push(d ? d.avgConceded : 999);
      keeping.push(s.keeperGames > 0 ? s.conceded / s.keeperGames : 999);
      attendance.push(s.games / maxGames);
      winRate.push(w ? w.winRate : 0);
    });
    return { scoring, creativity, defense, keeping, attendance, winRate };
  }, [players, playerSummary, defenseStats, winStats, maxGames]);

  const getPlayerValues = (name) => {
    const s = playerSummary[name];
    const d = defenseStats[name];
    const w = winStats[name];
    if (!s) return [50, 50, 50, 50, 50, 50];
    const raw = {
      scoring: s.games > 0 ? s.goals / s.games : 0,
      creativity: s.games > 0 ? s.assists / s.games : 0,
      defense: d ? d.avgConceded : 999,
      keeping: s.keeperGames > 0 ? s.conceded / s.keeperGames : 999,
      attendance: s.games / maxGames,
      winRate: w ? w.winRate : 0,
    };
    return [
      percentile(allRawValues.scoring, raw.scoring),
      percentile(allRawValues.creativity, raw.creativity),
      percentile(allRawValues.defense, raw.defense, true),
      percentile(allRawValues.keeping, raw.keeping, true),
      percentile(allRawValues.attendance, raw.attendance),
      percentile(allRawValues.winRate, raw.winRate),
    ];
  };

  const selected = selectedPlayer || players[0];
  const values = selected ? getPlayerValues(selected) : [50, 50, 50, 50, 50, 50];
  const type = getPlayerType(values);

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <select value={selected || ""} onChange={e => setSelectedPlayer(e.target.value)}
          style={{ width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 14, fontWeight: 700, background: C.cardLight, color: C.white, border: `1px solid ${C.grayDark}` }}>
          {players.map(p => <option key={p} value={p}>{p} ({playerSummary[p].games}경기)</option>)}
        </select>
      </div>
      {selected && (
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: C.white }}>{selected}</span>
            {type.label && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: type.color + "22", color: type.color }}>{type.label}</span>
            )}
          </div>
          <RadarChart values={values} C={C} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 8 }}>
            {AXES.map((axis, i) => (
              <div key={axis.key} style={{ fontSize: 11, color: C.gray }}>
                {axis.label}: <span style={{ fontWeight: 700, color: C.white }}>{Math.round(values[i])}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
