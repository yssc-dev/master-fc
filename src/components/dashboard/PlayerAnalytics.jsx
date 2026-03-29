import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import AppSync from '../../services/appSync';
import { getSettings } from '../../config/settings';

function analyzeData(events) {
  // 골든 콤비 (득점-어시 조합)
  const combos = {};
  // 키퍼 킬러 (득점자 vs 키퍼)
  const keeperKills = {};
  // 시즌 레이스 (날짜별 누적 골/포인트)
  const dateGoals = {};
  const datePoints = {};
  // 선수간 케미 (같은팀 동료)
  const teammates = {};

  const allDates = new Set();

  events.forEach(e => {
    allDates.add(e.date);

    if (e.scorer) {
      // 골든 콤비
      if (e.assist) {
        const key = `${e.scorer}←${e.assist}`;
        combos[key] = (combos[key] || 0) + 1;
      }
      // 키퍼 킬러
      if (e.concedingGk) {
        const key = `${e.scorer}→${e.concedingGk}`;
        keeperKills[key] = (keeperKills[key] || 0) + 1;
      }
      // 시즌 레이스 골
      if (!dateGoals[e.scorer]) dateGoals[e.scorer] = {};
      dateGoals[e.scorer][e.date] = (dateGoals[e.scorer][e.date] || 0) + 1;
      // 시즌 레이스 포인트 (골=1, 어시=1)
      if (!datePoints[e.scorer]) datePoints[e.scorer] = {};
      datePoints[e.scorer][e.date] = (datePoints[e.scorer][e.date] || 0) + 1;
    }
    if (e.assist) {
      if (!datePoints[e.assist]) datePoints[e.assist] = {};
      datePoints[e.assist][e.date] = (datePoints[e.assist][e.date] || 0) + 1;
    }
    // 자책골 포인트 (ownGoal = -2)
    if (e.ownGoal) {
      if (!datePoints[e.ownGoal]) datePoints[e.ownGoal] = {};
      datePoints[e.ownGoal][e.date] = (datePoints[e.ownGoal][e.date] || 0) - 2;
    }

    // 케미: 같은 날짜+같은 경기번호+같은 내팀 = 동료
    if (e.scorer && e.myTeam && e.date && e.matchId) {
      const gameKey = `${e.date}_${e.matchId}_${e.myTeam}`;
      if (!teammates[gameKey]) teammates[gameKey] = new Set();
      teammates[gameKey].add(e.scorer);
      if (e.assist) teammates[gameKey].add(e.assist);
    }
  });

  // 골든 콤비 정렬
  const goldenCombos = Object.entries(combos)
    .map(([key, count]) => {
      const [scorer, assister] = key.split('←');
      return { scorer, assister, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // 키퍼 킬러 정렬
  const keeperKillers = Object.entries(keeperKills)
    .map(([key, count]) => {
      const [scorer, keeper] = key.split('→');
      return { scorer, keeper, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // 시즌 레이스 (누적 골 TOP 5)
  const sortedDates = [...allDates].sort();
  const goalTotals = {};
  Object.keys(dateGoals).forEach(p => {
    let cum = 0;
    sortedDates.forEach(d => { cum += (dateGoals[p][d] || 0); });
    goalTotals[p] = cum;
  });
  const top5Scorers = Object.entries(goalTotals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);

  const goalRace = top5Scorers.map(name => {
    let cum = 0;
    const data = sortedDates.map(d => { cum += (dateGoals[name]?.[d] || 0); return cum; });
    return { name, data };
  });

  // 케미 분석: 동료 쌍별 출현 횟수
  const pairCount = {};
  Object.values(teammates).forEach(set => {
    const players = [...set];
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const pair = [players[i], players[j]].sort().join('+');
        pairCount[pair] = (pairCount[pair] || 0) + 1;
      }
    }
  });
  const topChemistry = Object.entries(pairCount)
    .map(([pair, count]) => ({ pair, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return { goldenCombos, keeperKillers, goalRace, sortedDates, topChemistry };
}

export default function PlayerAnalytics({ teamName, onClose }) {
  const { C } = useTheme();
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("combo");

  useEffect(() => {
    const s = getSettings(teamName);
    AppSync.getPointLog(s.pointLogSheet).then(data => setEvents(data)).finally(() => setLoading(false));
  }, [teamName]);

  const analysis = useMemo(() => events ? analyzeData(events) : null, [events]);

  const tabs = [
    { key: "combo", label: "골든콤비" },
    { key: "killer", label: "키퍼킬러" },
    { key: "race", label: "시즌레이스" },
    { key: "chemistry", label: "케미" },
  ];

  const ss = {
    row: { display: "flex", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.grayDarker}`, gap: 8 },
    rank: { width: 24, fontSize: 11, color: C.gray, textAlign: "center", flexShrink: 0 },
    name: { fontSize: 12, fontWeight: 600, color: C.white, flex: 1 },
    count: { fontSize: 13, fontWeight: 800, color: C.accent, minWidth: 28, textAlign: "right" },
    bar: (w, color) => ({ height: 8, borderRadius: 4, background: color, width: `${w}%`, minWidth: 2 }),
  };

  const RED = "#ef4444", BLUE = "#3b82f6", GREEN = "#22c55e", ORANGE = "#f97316", PURPLE = "#a855f7";
  const COLORS = [RED, BLUE, GREEN, ORANGE, PURPLE];

  if (loading) return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>불러오는 중...</div>;
  if (!analysis) return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>데이터 없음</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", background: t.key === tab ? C.accent : C.grayDarker, color: t.key === tab ? C.bg : C.gray }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "combo" && (
        <div>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>득점자 ← 어시스트 (횟수)</div>
          {analysis.goldenCombos.map((c, i) => (
            <div key={i} style={ss.row}>
              <span style={ss.rank}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.white }}>{c.scorer}</span>
                <span style={{ fontSize: 10, color: C.gray }}> ← {c.assister}</span>
              </div>
              <span style={ss.count}>{c.count}</span>
              <div style={{ width: 60 }}><div style={ss.bar(c.count / analysis.goldenCombos[0].count * 100, RED)} /></div>
            </div>
          ))}
        </div>
      )}

      {tab === "killer" && (
        <div>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>득점자 → 실점키퍼 (횟수)</div>
          {analysis.keeperKillers.map((c, i) => (
            <div key={i} style={ss.row}>
              <span style={ss.rank}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.white }}>{c.scorer}</span>
                <span style={{ fontSize: 10, color: C.gray }}> → {c.keeper}</span>
              </div>
              <span style={ss.count}>{c.count}</span>
              <div style={{ width: 60 }}><div style={ss.bar(c.count / analysis.keeperKillers[0].count * 100, BLUE)} /></div>
            </div>
          ))}
        </div>
      )}

      {tab === "race" && (
        <div>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>누적 골 TOP 5 레이스</div>
          <svg viewBox={`0 0 320 180`} width="100%" style={{ display: "block" }}>
            {(() => {
              const dates = analysis.sortedDates;
              const maxGoal = Math.max(...analysis.goalRace.map(r => Math.max(...r.data)));
              const padL = 25, padR = 10, padT = 15, padB = 25;
              const cw = 320 - padL - padR, ch = 180 - padT - padB;
              const xS = (i) => padL + (i / (dates.length - 1 || 1)) * cw;
              const yS = (v) => padT + ch - (v / (maxGoal || 1)) * ch;

              // Y축 눈금
              const yTicks = [];
              const step = Math.max(1, Math.ceil(maxGoal / 4));
              for (let v = 0; v <= maxGoal; v += step) yTicks.push(v);

              return (
                <>
                  {yTicks.map(v => (
                    <g key={v}>
                      <line x1={padL} y1={yS(v)} x2={320 - padR} y2={yS(v)} stroke={C.grayDarker} strokeWidth={0.5} strokeDasharray="3,3" />
                      <text x={padL - 4} y={yS(v) + 3} textAnchor="end" fontSize={8} fill={C.gray}>{v}</text>
                    </g>
                  ))}
                  {/* X축 라벨 */}
                  {dates.filter((_, i) => i === 0 || i === dates.length - 1 || i % Math.ceil(dates.length / 4) === 0).map((d, _, arr) => {
                    const idx = dates.indexOf(d);
                    return <text key={d} x={xS(idx)} y={180 - 6} textAnchor="middle" fontSize={7} fill={C.gray}>{d.slice(5)}</text>;
                  })}
                  {/* 선 */}
                  {analysis.goalRace.map((r, ri) => (
                    <g key={r.name}>
                      <polyline
                        points={r.data.map((v, i) => `${xS(i)},${yS(v)}`).join(' ')}
                        fill="none" stroke={COLORS[ri]} strokeWidth={1.5}
                      />
                      <text x={xS(dates.length - 1) + 3} y={yS(r.data[r.data.length - 1]) + 3}
                        fontSize={8} fill={COLORS[ri]} fontWeight={700}>
                        {r.name} {r.data[r.data.length - 1]}
                      </text>
                    </g>
                  ))}
                </>
              );
            })()}
          </svg>
        </div>
      )}

      {tab === "chemistry" && (
        <div>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>같은 팀에서 함께 골에 관여한 횟수 (경기수 기준)</div>
          {analysis.topChemistry.map((c, i) => {
            const [p1, p2] = c.pair.split('+');
            return (
              <div key={i} style={ss.row}>
                <span style={ss.rank}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.white }}>{p1}</span>
                  <span style={{ fontSize: 10, color: C.gray }}> + {p2}</span>
                </div>
                <span style={ss.count}>{c.count}</span>
                <div style={{ width: 60 }}><div style={ss.bar(c.count / analysis.topChemistry[0].count * 100, GREEN)} /></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
