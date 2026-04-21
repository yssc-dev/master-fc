import { useState, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { percentile } from '../../utils/gameStateAnalyzer';
import { calcTrend, calcRelativePosition, calcAttendance } from '../../utils/playerAnalyticsUtils';

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

function getChaosBadge(chaosRate) {
  if (chaosRate >= 0.3) return { emoji: "💣", label: "돌발왕", color: "#ef4444" };
  if (chaosRate >= 0.1) return { emoji: "⚡", label: "돌발주의", color: "#f97316" };
  return null;
}

export default function PlayerCardTab({ playerLog, members, defenseStats, winStats, gameRecords, C }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // 대시보드 members 데이터 우선 사용 (전체 누적), 없으면 playerLog에서 집계
  const playerSummary = useMemo(() => {
    if (members && members.length > 0) {
      const map = {};
      members.forEach(m => {
        map[m.name] = {
          games: m.games || 0, goals: m.goals || 0, assists: m.assists || 0,
          keeperGames: m.keeperGames || 0, conceded: m.conceded || 0,
          ownGoals: m.ownGoals || 0,
        };
      });
      return map;
    }
    const map = {};
    playerLog.forEach(p => {
      if (!map[p.name]) map[p.name] = { games: 0, goals: 0, assists: 0, keeperGames: 0, conceded: 0, ownGoals: 0 };
      map[p.name].games++;
      map[p.name].goals += p.goals || 0;
      map[p.name].assists += p.assists || 0;
      map[p.name].keeperGames += p.keeperGames || 0;
      map[p.name].conceded += p.conceded || 0;
      map[p.name].ownGoals += p.ownGoals || 0;
    });
    return map;
  }, [playerLog, members]);

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

  const getPlayerData = (name) => {
    const s = playerSummary[name];
    const d = defenseStats[name];
    const w = winStats[name];
    if (!s) return { values: [50, 50, 50, 50, 50, 50], raw: {} };
    const chaosRate = s.games > 0 ? Math.abs(s.ownGoals || 0) / s.games : 0;
    const raw = {
      scoring: s.games > 0 ? s.goals / s.games : 0,
      creativity: s.games > 0 ? s.assists / s.games : 0,
      defense: d ? d.avgConceded : 999,
      keeping: s.keeperGames > 0 ? s.conceded / s.keeperGames : 999,
      attendance: s.games / maxGames,
      winRate: w ? w.winRate : 0,
      chaosRate,
    };
    const detail = {
      goals: s.goals, assists: s.assists, games: s.games, ownGoals: Math.abs(s.ownGoals || 0),
      keeperGames: s.keeperGames, conceded: s.conceded,
      fieldMatches: d?.fieldMatches || 0, fieldConceded: d?.totalConceded || 0,
      wins: w?.wins || 0, draws: w?.draws || 0, losses: w?.losses || 0, totalMatches: w?.matches || 0,
    };
    return {
      values: [
        percentile(allRawValues.scoring, raw.scoring),
        percentile(allRawValues.creativity, raw.creativity),
        percentile(allRawValues.defense, raw.defense, true),
        percentile(allRawValues.keeping, raw.keeping, true),
        percentile(allRawValues.attendance, raw.attendance),
        percentile(allRawValues.winRate, raw.winRate),
      ],
      raw, detail,
    };
  };

  const getTrends = (name) => {
    const sessions = playerLog
      .filter(p => p.name === name)
      .sort((a, b) => a.date.localeCompare(b.date));
    const goalsSeries = sessions.map(p => p.goals || 0);
    const assistsSeries = sessions.map(p => p.assists || 0);
    return {
      goals: calcTrend(goalsSeries),
      assists: calcTrend(assistsSeries),
    };
  };

  const getRelativePosition = (name) => {
    const s = playerSummary[name];
    if (!s || s.games === 0) return null;
    const qualified = players
      .map(n => playerSummary[n])
      .filter(ps => ps.games > 0);
    const goalsPerGame = qualified.map(ps => ps.goals / ps.games);
    const assistsPerGame = qualified.map(ps => ps.assists / ps.games);
    return {
      goals: calcRelativePosition(s.goals / s.games, goalsPerGame),
      assists: calcRelativePosition(s.assists / s.games, assistsPerGame),
    };
  };

  const getAttendance = (name) => calcAttendance(gameRecords || [], name);

  const getGkFieldSplit = (name) => {
    const s = playerSummary[name];
    if (!s) return null;
    const keeperGames = s.keeperGames || 0;
    const fieldGames = Math.max(0, s.games - keeperGames);
    return {
      keeper: { games: keeperGames, conceded: s.conceded || 0 },
      field: { games: fieldGames, goals: s.goals || 0, assists: s.assists || 0 },
    };
  };

  const selected = selectedPlayer || players[0];
  const pd = selected ? getPlayerData(selected) : { values: [50, 50, 50, 50, 50, 50], raw: {}, detail: {} };
  const values = pd.values;
  const type = getPlayerType(values);
  const chaos = getChaosBadge(pd.raw?.chaosRate || 0);

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <select value={selected || ""} onChange={e => setSelectedPlayer(e.target.value)}
          style={{ width: "100%", padding: "10px 14px", borderRadius: 50, fontSize: 14, fontWeight: 480, letterSpacing: "-0.14px", background: "transparent", color: C.white, border: `1.2px dashed ${C.grayDark}`, fontFamily: "inherit", appearance: "none", cursor: "pointer" }}>
          {players.map(p => <option key={p} value={p}>{p} ({playerSummary[p].games}경기)</option>)}
        </select>
      </div>
      {selected && (
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 24, fontWeight: 400, letterSpacing: "-0.6px", color: C.white }}>{selected}</span>
            {type.label && (
              <span style={{ fontSize: 10, fontWeight: 500, padding: "3px 10px", borderRadius: 50, border: `1px dashed ${type.color}`, color: type.color }}>{type.label}</span>
            )}
            {chaos && (
              <span style={{ fontSize: 10, fontWeight: 500, padding: "3px 10px", borderRadius: 50, border: `1px dashed ${chaos.color}`, color: chaos.color }}>{chaos.emoji} {chaos.label}</span>
            )}
          </div>
          <RadarChart values={values} C={C} />
          {pd.detail && (
            <div style={{ marginTop: 12, textAlign: "left" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <tbody>
                  {[
                    { label: "득점력", score: values[0], desc: `${pd.detail.goals}골 / ${pd.detail.games}경기 = 경기당 ${pd.raw.scoring?.toFixed(2)}골` },
                    { label: "창의력", score: values[1], desc: `${pd.detail.assists}어시 / ${pd.detail.games}경기 = 경기당 ${pd.raw.creativity?.toFixed(2)}어시` },
                    { label: "수비력", score: values[2], desc: `필드 ${pd.detail.fieldMatches}경기, 팀실점 ${pd.detail.fieldConceded} = 경기당 ${pd.raw.defense === 999 ? "-" : pd.raw.defense?.toFixed(2)}실점` },
                    { label: "키퍼", score: values[3], desc: pd.detail.keeperGames > 0 ? `${pd.detail.keeperGames}경기, ${pd.detail.conceded}실점 = 경기당 ${pd.raw.keeping?.toFixed(2)}실점` : "키퍼 경기 없음" },
                    { label: "참석률", score: values[4], desc: `${pd.detail.games} / ${maxGames}경기 = ${Math.round(pd.raw.attendance * 100)}%` },
                    { label: "승리기여", score: values[5], desc: `${pd.detail.totalMatches}경기 ${pd.detail.wins}승 ${pd.detail.draws}무 ${pd.detail.losses}패 = 승률 ${Math.round(pd.raw.winRate * 100)}%` },
                  ].map(row => (
                    <tr key={row.label} style={{ borderBottom: `1px dashed ${C.grayDarker}` }}>
                      <td style={{ padding: "8px 4px", color: C.gray, fontSize: 10, width: 70 }}>{row.label}</td>
                      <td style={{ padding: "8px 4px", color: C.white, fontWeight: 480, fontSize: 18, letterSpacing: "-0.4px", fontVariantNumeric: "tabular-nums", width: 38, textAlign: "center" }}>{Math.round(row.score)}</td>
                      <td style={{ padding: "8px 4px", color: C.gray, fontSize: 10 }}>{row.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selected && (() => {
            const trends = getTrends(selected);
            const relPos = getRelativePosition(selected);
            const att = getAttendance(selected);
            const split = getGkFieldSplit(selected);
            const hasAnything = trends.goals || trends.assists || relPos || att.total > 0 || (split && split.keeper.games > 0 && split.field.games > 0);
            if (!hasAnything) return null;
            return (
              <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: C.cardLight, fontSize: 11, lineHeight: 1.9, textAlign: "left" }}>
                {trends.goals && (
                  <div>
                    <span style={{ color: C.gray }}>득점 추세: </span>
                    <span style={{ color: C.white, fontWeight: 700 }}>{trends.goals.icon} {trends.goals.label}</span>
                  </div>
                )}
                {trends.assists && (
                  <div>
                    <span style={{ color: C.gray }}>도움 추세: </span>
                    <span style={{ color: C.white, fontWeight: 700 }}>{trends.assists.icon} {trends.assists.label}</span>
                  </div>
                )}
                {relPos && (
                  <div>
                    <span style={{ color: C.gray }}>팀 평균 대비: </span>
                    <span style={{ color: relPos.goals >= 0 ? C.accent : "#ef4444", fontWeight: 700 }}>
                      득점 {relPos.goals >= 0 ? "+" : ""}{relPos.goals}%
                    </span>
                    <span style={{ color: C.gray }}> · </span>
                    <span style={{ color: relPos.assists >= 0 ? C.accent : "#ef4444", fontWeight: 700 }}>
                      도움 {relPos.assists >= 0 ? "+" : ""}{relPos.assists}%
                    </span>
                  </div>
                )}
                {att.total > 0 && (
                  <div>
                    <span style={{ color: C.gray }}>출석: </span>
                    <span style={{ color: C.white, fontWeight: 700 }}>{att.attended}/{att.total}세션 ({att.rate}%)</span>
                  </div>
                )}
                {split && split.keeper.games > 0 && split.field.games > 0 && (
                  <div>
                    <span style={{ color: C.gray }}>GK/필드: </span>
                    <span style={{ color: C.white }}>
                      GK {split.keeper.games}경기 {split.keeper.conceded}실 · 필드 {split.field.games}경기 {split.field.goals}골 {split.field.assists}어시
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
          {(!defenseStats || Object.keys(defenseStats).length === 0 || !winStats || Object.keys(winStats).length === 0) && (
            <div style={{ marginTop: 12, padding: "8px 10px", borderRadius: 8, background: `${C.accent}10`, fontSize: 11, color: C.gray, lineHeight: 1.6 }}>
              수비력{!winStats || Object.keys(winStats).length === 0 ? ", 승리기여" : ""} 지표는 앱 경기기록 데이터 부족으로 일부만 결과에 반영되고 있습니다.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
