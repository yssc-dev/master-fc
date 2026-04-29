import { useState, useMemo } from 'react';
import { percentile } from '../../../utils/gameStateAnalyzer';
import { calcTrend, calcRelativePosition, calcAttendance } from '../../../utils/playerAnalyticsUtils';
import { calcTrends } from '../../../utils/analyticsV2/calcTrends';
import { calcStreaks } from '../../../utils/analyticsV2/calcStreaks';
import { calcPersonalRecords } from '../../../utils/analyticsV2/calcPersonalRecords';
import { calcRoundSlope } from '../../../utils/analyticsV2/calcRoundSlope';
import { calcSoloGoalRatio } from '../../../utils/analyticsV2/calcSoloGoalRatio';
import { calcPersonalSynergy } from '../../../utils/analyticsV2/calcPersonalSynergy';
import { calcSynergyMatrix } from '../../../utils/analyticsV2/calcSynergyMatrix';
import RoundDistribution from './RoundDistribution';
import SoloGoalDonut from './SoloGoalDonut';
import PersonalSynergyCard from './PersonalSynergyCard';

// ─── Radar Chart ────────────────────────────────────────────────────────────

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
      <polygon points={dataPoints.map(p => `${p.x},${p.y}`).join(" ")} fill={C.accent} fillOpacity={0.2} stroke={C.accent} strokeWidth={2} />
      {dataPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill={C.accent} />)}
      {AXES.map((axis, i) => {
        const p = getPoint(i, 1.22);
        return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fill={C.gray} fontSize={10} fontWeight={600}>{axis.label}</text>;
      })}
    </svg>
  );
}

// ─── Trend Line Chart ────────────────────────────────────────────────────────

function TrendLineChart({ smoothed, C }) {
  const width = 280, height = 140, padX = 24, padY = 18;
  const n = smoothed.length;
  if (n === 0) return null;
  const maxG = Math.max(1, ...smoothed.map(s => s.gpg), ...smoothed.map(s => s.apg));
  const xAt = (i) => padX + (i * (width - 2 * padX) / Math.max(1, n - 1));
  const yAtGA = (v) => height - padY - (v / maxG) * (height - 2 * padY);
  const yAtW = (v) => height - padY - v * (height - 2 * padY);
  const path = (ys) => smoothed.map((s, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${ys(s)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path(s => yAtGA(s.gpg))} stroke="#ef4444" strokeWidth={2} fill="none" />
      <path d={path(s => yAtGA(s.apg))} stroke="#3b82f6" strokeWidth={2} fill="none" />
      <path d={path(s => yAtW(s.winRate))} stroke="#22c55e" strokeWidth={2} strokeDasharray="3,3" fill="none" />
      <text x={4} y={14} fontSize={9} fill="#ef4444">득점/경기</text>
      <text x={68} y={14} fontSize={9} fill="#3b82f6">도움/경기</text>
      <text x={136} y={14} fontSize={9} fill="#22c55e">팀 승률</text>
    </svg>
  );
}

// ─── Badge helpers ───────────────────────────────────────────────────────────

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

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PersonalAnalysisTab({
  // PlayerCardTab props
  playerLog, members, defenseStats, winStats, gameRecords, playerGameLogs, matchLogs,
  // HallOfFameTab adds nothing new beyond playerGameLogs + matchLogs
  // new V3 prop
  eventLogs,
  // shared
  C, authUserName,
}) {
  // ── Player list (from playerSummary, same logic as PlayerCardTab) ──────────
  const playerSummary = useMemo(() => {
    const map = {};
    const ensure = (name) => {
      if (!map[name]) map[name] = { games: 0, rounds: 0, goals: 0, assists: 0, keeperRounds: 0, conceded: 0, ownGoals: 0 };
      return map[name];
    };
    (playerGameLogs || []).forEach(p => {
      const name = p.player;
      if (!name) return;
      const s = ensure(name);
      s.goals += Number(p.goals) || 0;
      s.assists += Number(p.assists) || 0;
      s.keeperRounds += Number(p.keeper_games || p.keeperGames) || 0;
      s.conceded += Number(p.conceded) || 0;
      s.ownGoals += Number(p.own_goals || p.ownGoals) || 0;
    });
    const seenRound = new Set();
    const seenGame = new Set();
    (matchLogs || []).forEach(m => {
      const key = `${m.date}|${m.match_id}`;
      let home = [], away = [];
      try { home = JSON.parse(m.our_members_json || '[]'); } catch {}
      try { away = JSON.parse(m.opponent_members_json || '[]'); } catch {}
      [...home, ...away].forEach(name => {
        if (!name) return;
        const roundDedup = `${key}|${name}`;
        if (!seenRound.has(roundDedup)) {
          seenRound.add(roundDedup);
          ensure(name).rounds++;
        }
        const gameDedup = `${m.date}|${name}`;
        if (!seenGame.has(gameDedup)) {
          seenGame.add(gameDedup);
          ensure(name).games++;
        }
      });
    });
    return map;
  }, [playerGameLogs, matchLogs]);

  const players = useMemo(() => {
    const list = Object.keys(playerSummary).filter(n => playerSummary[n].rounds >= 3);
    list.sort((a, b) => {
      if (authUserName) {
        if (a === authUserName) return -1;
        if (b === authUserName) return 1;
      }
      return a.localeCompare(b, "ko");
    });
    return list;
  }, [playerSummary, authUserName]);

  const maxRounds = useMemo(() => Math.max(...Object.values(playerSummary).map(s => s.rounds), 1), [playerSummary]);

  // ── Selected player state (default to authUserName if present) ────────────
  const [selected, setSelected] = useState(() =>
    authUserName && players.includes(authUserName) ? authUserName : (players[0] || null)
  );

  // ── Radar raw values for percentile calc ─────────────────────────────────
  const allRawValues = useMemo(() => {
    const scoring = [], creativity = [], defense = [], keeping = [], attendance = [], winRate = [];
    players.forEach(name => {
      const s = playerSummary[name];
      const d = defenseStats[name];
      const w = winStats[name];
      scoring.push(s.rounds > 0 ? s.goals / s.rounds : 0);
      creativity.push(s.rounds > 0 ? s.assists / s.rounds : 0);
      defense.push(d ? d.avgConceded : 999);
      keeping.push(s.keeperRounds > 0 ? s.conceded / s.keeperRounds : 999);
      attendance.push(s.rounds / maxRounds);
      winRate.push(w ? w.winRate : 0);
    });
    return { scoring, creativity, defense, keeping, attendance, winRate };
  }, [players, playerSummary, defenseStats, winStats, maxRounds]);

  const getPlayerData = (name) => {
    const s = playerSummary[name];
    const d = defenseStats[name];
    const w = winStats[name];
    if (!s) return { values: [50, 50, 50, 50, 50, 50], raw: {} };
    const chaosRate = s.rounds > 0 ? Math.abs(s.ownGoals || 0) / s.rounds : 0;
    const raw = {
      scoring: s.rounds > 0 ? s.goals / s.rounds : 0,
      creativity: s.rounds > 0 ? s.assists / s.rounds : 0,
      defense: d ? d.avgConceded : 999,
      keeping: s.keeperRounds > 0 ? s.conceded / s.keeperRounds : 999,
      attendance: s.rounds / maxRounds,
      winRate: w ? w.winRate : 0,
      chaosRate,
    };
    const detail = {
      goals: s.goals, assists: s.assists, games: s.games, rounds: s.rounds, ownGoals: Math.abs(s.ownGoals || 0),
      keeperRounds: s.keeperRounds, conceded: s.conceded,
      fieldRounds: d?.fieldMatches || 0, fieldConceded: d?.totalConceded || 0,
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
    const sessions = (playerLog || [])
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
    if (!s || s.rounds === 0) return null;
    const qualified = players
      .map(n => playerSummary[n])
      .filter(ps => ps.rounds > 0);
    const goalsPerRound = qualified.map(ps => ps.goals / ps.rounds);
    const assistsPerRound = qualified.map(ps => ps.assists / ps.rounds);
    return {
      goals: calcRelativePosition(s.goals / s.rounds, goalsPerRound),
      assists: calcRelativePosition(s.assists / s.rounds, assistsPerRound),
    };
  };

  const getAttendance = (name) => calcAttendance(gameRecords || [], name);

  const getGkFieldSplit = (name) => {
    const s = playerSummary[name];
    if (!s) return null;
    const keeperRounds = s.keeperRounds || 0;
    const fieldRounds = Math.max(0, s.rounds - keeperRounds);
    return {
      keeper: { rounds: keeperRounds, conceded: s.conceded || 0 },
      field: { rounds: fieldRounds, goals: s.goals || 0, assists: s.assists || 0 },
    };
  };

  // ── Trend + Streak data for selected player ───────────────────────────────
  const trendData = useMemo(() => {
    if (!selected || !playerGameLogs || !matchLogs) return null;
    return calcTrends({ playerName: selected, playerLogs: playerGameLogs, matchLogs });
  }, [selected, playerGameLogs, matchLogs]);

  const streakData = useMemo(() => {
    if (!selected || !playerGameLogs) return null;
    return calcStreaks({ playerName: selected, playerLogs: playerGameLogs });
  }, [selected, playerGameLogs]);

  // ── P3/P4/C5 calculations ─────────────────────────────────────────────────
  const roundSlope = useMemo(() => calcRoundSlope({ eventLogs: eventLogs || [], threshold: 10 }), [eventLogs]);
  const soloRatio = useMemo(() => calcSoloGoalRatio({ eventLogs: eventLogs || [], threshold: 10 }), [eventLogs]);
  const synergyMatrix = useMemo(() => calcSynergyMatrix({ matchLogs: matchLogs || [], minRounds: 5 }), [matchLogs]);
  const myPair = useMemo(
    () => selected ? calcPersonalSynergy({ matrix: synergyMatrix, player: selected, topN: 3 }) : { best: [], worst: [] },
    [synergyMatrix, selected]
  );

  // ── Personal Records (PR) for selected player ────────────────────────────
  const pr = useMemo(() =>
    selected ? calcPersonalRecords({ playerName: selected, playerLogs: playerGameLogs || [] }) : null
  , [selected, playerGameLogs]);

  // ── Derived display values ────────────────────────────────────────────────
  const pd = selected ? getPlayerData(selected) : { values: [50, 50, 50, 50, 50, 50], raw: {}, detail: {} };
  const values = pd.values;
  const type = getPlayerType(values);
  const chaos = getChaosBadge(pd.raw?.chaosRate || 0);

  // ── Style helpers ─────────────────────────────────────────────────────────
  const cardStyle = { marginTop: 24, padding: 14, background: C.cardLight, borderRadius: 12 };
  const cardTitle = { fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 8 };
  const prRow = { display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12 };

  return (
    <div>
      {/* ── PlayerCard section ── */}
      <div style={{ marginBottom: 14 }}>
        <select value={selected || ""} onChange={e => setSelected(e.target.value)}
          style={{ width: "100%", padding: "10px 14px", borderRadius: 50, fontSize: 14, fontWeight: 480, letterSpacing: "-0.14px", background: "transparent", color: C.white, border: `1.2px dashed ${C.grayDark}`, fontFamily: "inherit", appearance: "none", cursor: "pointer" }}>
          {players.map(p => <option key={p} value={p}>{p} ({playerSummary[p].games}게임 / {playerSummary[p].rounds}경기)</option>)}
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
                    { label: "득점력", score: values[0], desc: `${pd.detail.goals}골 / ${pd.detail.rounds}경기 = 경기당 ${pd.raw.scoring?.toFixed(2)}골` },
                    { label: "창의력", score: values[1], desc: `${pd.detail.assists}어시 / ${pd.detail.rounds}경기 = 경기당 ${pd.raw.creativity?.toFixed(2)}어시` },
                    { label: "수비력", score: values[2], desc: `필드 ${pd.detail.fieldRounds}경기, 팀실점 ${pd.detail.fieldConceded} = 경기당 ${pd.raw.defense === 999 ? "-" : pd.raw.defense?.toFixed(2)}실점` },
                    { label: "키퍼", score: values[3], desc: pd.detail.keeperRounds > 0 ? `${pd.detail.keeperRounds}경기, ${pd.detail.conceded}실점 = 경기당 ${pd.raw.keeping?.toFixed(2)}실점` : "키퍼 경기 없음" },
                    { label: "참석률", score: values[4], desc: `${pd.detail.rounds} / ${maxRounds}경기 = ${Math.round(pd.raw.attendance * 100)}%` },
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
            const hasAnything = trends.goals || trends.assists || relPos || att.total > 0 || (split && split.keeper.rounds > 0 && split.field.rounds > 0);
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
                    <span style={{ color: C.white, fontWeight: 700 }}>{att.attended}/{att.total}게임 ({att.rate}%)</span>
                  </div>
                )}
                {split && split.keeper.rounds > 0 && split.field.rounds > 0 && (
                  <div>
                    <span style={{ color: C.gray }}>GK/필드: </span>
                    <span style={{ color: C.white }}>
                      GK {split.keeper.rounds}경기 {split.keeper.conceded}실 · 필드 {split.field.rounds}경기 {split.field.goals}골 {split.field.assists}어시
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
          {streakData && (streakData.scoringStreak.best > 0 || streakData.cleanSheetStreak.best > 0) && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: C.cardLight, fontSize: 11, lineHeight: 1.9, textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.white, marginBottom: 4 }}>연속 기록</div>
              {streakData.scoringStreak.best > 0 && (
                <div>
                  <span style={{ color: C.gray }}>득점 연속: </span>
                  <span style={{ color: C.white, fontWeight: 700 }}>
                    현재 {streakData.scoringStreak.current} / 역대 {streakData.scoringStreak.best}게임
                  </span>
                </div>
              )}
              {streakData.cleanSheetStreak.best > 0 && (
                <div>
                  <span style={{ color: C.gray }}>GK 무실점 연속: </span>
                  <span style={{ color: C.white, fontWeight: 700 }}>
                    현재 {streakData.cleanSheetStreak.current} / 역대 {streakData.cleanSheetStreak.best}게임
                  </span>
                </div>
              )}
            </div>
          )}
          {trendData && trendData.points.length >= 3 && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: C.cardLight }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.white, marginBottom: 8, textAlign: "left" }}>
                최근 {trendData.points.length}게임 추세
              </div>
              <TrendLineChart smoothed={trendData.smoothed} C={C} />
              <div style={{ fontSize: 10, color: C.gray, marginTop: 6, textAlign: "left", lineHeight: 1.55 }}>
                <div><span style={{ color: "#ef4444", fontWeight: 700 }}>득점/경기</span> · 한 경기당 평균 골 수</div>
                <div><span style={{ color: "#3b82f6", fontWeight: 700 }}>도움/경기</span> · 한 경기당 평균 어시스트 수</div>
                <div><span style={{ color: "#22c55e", fontWeight: 700 }}>팀 승률</span> · 그날 본인이 뛴 경기에서 우리팀 승리 비율</div>
                <div style={{ marginTop: 4 }}>※ 최근 3게임 평균으로 부드럽게 그립니다 (한 경기 = 한 라운드)</div>
              </div>
            </div>
          )}
          {(!defenseStats || Object.keys(defenseStats).length === 0 || !winStats || Object.keys(winStats).length === 0) && (
            <div style={{ marginTop: 12, padding: "8px 10px", borderRadius: 8, background: `${C.accent}10`, fontSize: 11, color: C.gray, lineHeight: 1.6 }}>
              수비력{!winStats || Object.keys(winStats).length === 0 ? ", 승리기여" : ""} 지표는 앱 경기기록 데이터 부족으로 일부만 결과에 반영되고 있습니다.
            </div>
          )}
        </div>
      )}

      {/* ── P3: Round Distribution ── */}
      <div style={cardStyle}>
        <RoundDistribution data={roundSlope.perPlayer[selected]} player={selected} ranking={roundSlope.ranking} C={C} />
      </div>

      {/* ── P4: Solo Goal Donut ── */}
      <div style={cardStyle}>
        <SoloGoalDonut data={soloRatio.perPlayer[selected]} player={selected} ranking={soloRatio.ranking} C={C} />
      </div>

      {/* ── C5: Personal Synergy Card ── */}
      <div style={cardStyle}>
        <PersonalSynergyCard data={myPair} C={C} />
      </div>

      {/* ── PR: Personal Records (selected player와 연동) ── */}
      <div style={cardStyle}>
        <div style={cardTitle}>🏆 개인 기록 (PR)</div>
        {pr ? (
          <>
            <div style={prRow}>
              <span style={{ color: C.gray }}>⚽ 최다골</span>
              {pr.mostGoals ? (
                <span style={{ color: C.white, fontWeight: 700 }}>{pr.mostGoals.value}골 <span style={{ color: C.gray, fontWeight: 400 }}>({pr.mostGoals.date})</span></span>
              ) : <span style={{ color: C.gray }}>-</span>}
            </div>
            <div style={{ ...prRow, borderTop: `1px dashed ${C.grayDarker}` }}>
              <span style={{ color: C.gray }}>🅰 최다어시</span>
              {pr.mostAssists ? (
                <span style={{ color: C.white, fontWeight: 700 }}>{pr.mostAssists.value}어시 <span style={{ color: C.gray, fontWeight: 400 }}>({pr.mostAssists.date})</span></span>
              ) : <span style={{ color: C.gray }}>-</span>}
            </div>
            <div style={{ ...prRow, borderTop: `1px dashed ${C.grayDarker}` }}>
              <span style={{ color: C.gray }} title="GK로 출전한 경기일을 시간순으로 봤을 때 무실점이 연속된 최대 길이">🧤 GK 최장 무실점</span>
              {pr.longestCleanSheet ? (
                <span style={{ color: C.white, fontWeight: 700 }}>{pr.longestCleanSheet.value}회 <span style={{ color: C.gray, fontWeight: 400 }}>({pr.longestCleanSheet.startDate}~{pr.longestCleanSheet.endDate})</span></span>
              ) : <span style={{ color: C.gray }}>-</span>}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
        )}
      </div>
    </div>
  );
}
