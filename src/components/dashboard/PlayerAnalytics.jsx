import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import AppSync from '../../services/appSync';
import { getSettings } from '../../config/settings';

function analyzeData(events) {
  // 득점자별 데이터
  const scorerData = {}; // { scorer: { total, assists: { assister: count }, solo: count } }
  // 키퍼별 실점 데이터
  const keeperData = {}; // { keeper: { total, scorers: { scorer: count } } }
  // 포인트 레이스
  const datePoints = {};
  // 케미
  const teammates = {};
  const allDates = new Set();

  events.forEach(e => {
    allDates.add(e.date);

    if (e.scorer) {
      if (!scorerData[e.scorer]) scorerData[e.scorer] = { total: 0, assists: {}, solo: 0 };
      scorerData[e.scorer].total++;

      if (e.assist) {
        scorerData[e.scorer].assists[e.assist] = (scorerData[e.scorer].assists[e.assist] || 0) + 1;
      } else {
        scorerData[e.scorer].solo++;
      }

      if (e.concedingGk) {
        if (!keeperData[e.concedingGk]) keeperData[e.concedingGk] = { total: 0, scorers: {} };
        keeperData[e.concedingGk].total++;
        keeperData[e.concedingGk].scorers[e.scorer] = (keeperData[e.concedingGk].scorers[e.scorer] || 0) + 1;
      }

      if (!datePoints[e.scorer]) datePoints[e.scorer] = {};
      datePoints[e.scorer][e.date] = (datePoints[e.scorer][e.date] || 0) + 1;
    }
    if (e.assist) {
      if (!datePoints[e.assist]) datePoints[e.assist] = {};
      datePoints[e.assist][e.date] = (datePoints[e.assist][e.date] || 0) + 1;
    }
    if (e.ownGoal) {
      if (!datePoints[e.ownGoal]) datePoints[e.ownGoal] = {};
      datePoints[e.ownGoal][e.date] = (datePoints[e.ownGoal][e.date] || 0) - 2;
    }

    if (e.scorer && e.myTeam && e.date && e.matchId) {
      const gameKey = `${e.date}_${e.matchId}_${e.myTeam}`;
      if (!teammates[gameKey]) teammates[gameKey] = new Set();
      teammates[gameKey].add(e.scorer);
      if (e.assist) teammates[gameKey].add(e.assist);
    }
  });

  // 골든콤비: 득점 상위 TOP5 → 각 어시 상위 3명
  const topScorers = Object.entries(scorerData).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  const goldenCombos = topScorers.map(([name, data]) => {
    const assistEntries = Object.entries(data.assists).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const rows = [];
    if (data.solo > 0) rows.push({ partner: "(단독)", count: data.solo, pct: (data.solo / data.total * 100).toFixed(1) });
    assistEntries.forEach(([a, c]) => rows.push({ partner: a, count: c, pct: (c / data.total * 100).toFixed(1) }));
    rows.sort((a, b) => b.count - a.count);
    return { scorer: name, total: data.total, rows: rows.slice(0, 3) };
  });

  // 키퍼킬러: 실점 상위 TOP5 키퍼 → 각 득점자 상위 3명
  const topKeepers = Object.entries(keeperData).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  const keeperKillers = topKeepers.map(([keeper, data]) => {
    const scorerEntries = Object.entries(data.scorers).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const rows = scorerEntries.map(([s, c]) => ({ scorer: s, count: c, pct: (c / data.total * 100).toFixed(1) }));
    return { keeper, total: data.total, rows };
  });

  // 시즌레이스: 누적 포인트 TOP 5
  const sortedDates = [...allDates].sort();
  const pointTotals = {};
  Object.keys(datePoints).forEach(p => {
    let cum = 0;
    sortedDates.forEach(d => { cum += (datePoints[p][d] || 0); });
    pointTotals[p] = cum;
  });
  const top5 = Object.entries(pointTotals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
  const pointRace = top5.map(name => {
    let cum = 0;
    const data = sortedDates.map(d => { cum += (datePoints[name]?.[d] || 0); return cum; });
    return { name, data };
  });

  // 케미
  const pairCount = {};
  Object.values(teammates).forEach(set => {
    const players = [...set];
    for (let i = 0; i < players.length; i++)
      for (let j = i + 1; j < players.length; j++) {
        const pair = [players[i], players[j]].sort().join('+');
        pairCount[pair] = (pairCount[pair] || 0) + 1;
      }
  });
  const topChemistry = Object.entries(pairCount).map(([pair, count]) => ({ pair, count })).sort((a, b) => b.count - a.count).slice(0, 15);

  return { goldenCombos, keeperKillers, pointRace, sortedDates, topChemistry };
}

export default function PlayerAnalytics({ teamName }) {
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

  const RED = "#ef4444", BLUE = "#3b82f6", GREEN = "#22c55e", ORANGE = "#f97316", PURPLE = "#a855f7";
  const COLORS = [RED, BLUE, GREEN, ORANGE, PURPLE];

  if (loading) return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>불러오는 중...</div>;
  if (!analysis) return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>데이터 없음</div>;

  const cellStyle = { padding: "5px 6px", borderBottom: `1px solid ${C.grayDarker}`, fontSize: 11 };
  const headerCell = { ...cellStyle, fontWeight: 700, color: C.gray, fontSize: 10 };

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
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 6 }}>득점 상위 TOP5 케미</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={headerCell}>득점자</th><th style={headerCell}>어시/단독</th><th style={{ ...headerCell, textAlign: "right" }}>횟수</th><th style={{ ...headerCell, textAlign: "right" }}>지분</th>
            </tr></thead>
            <tbody>
              {analysis.goldenCombos.map((g, gi) => (
                g.rows.map((r, ri) => (
                  <tr key={`${gi}-${ri}`} style={{ background: gi % 2 === 0 ? "transparent" : `${C.grayDarker}33` }}>
                    {ri === 0 && <td rowSpan={g.rows.length} style={{ ...cellStyle, fontWeight: 700, color: C.white, verticalAlign: "top" }}>{g.scorer}</td>}
                    <td style={{ ...cellStyle, color: r.partner === "(단독)" ? C.gray : C.white }}>{r.partner}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontWeight: 700, color: C.accent }}>{r.count}</td>
                    <td style={{ ...cellStyle, textAlign: "right", color: C.gray }}>{r.pct}%</td>
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "killer" && (
        <div>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 6 }}>실점 상위 TOP5 키퍼</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={headerCell}>키퍼</th><th style={headerCell}>득점자</th><th style={{ ...headerCell, textAlign: "right" }}>골</th><th style={{ ...headerCell, textAlign: "right" }}>지분</th>
            </tr></thead>
            <tbody>
              {analysis.keeperKillers.map((k, ki) => (
                k.rows.map((r, ri) => (
                  <tr key={`${ki}-${ri}`} style={{ background: ki % 2 === 0 ? "transparent" : `${C.grayDarker}33` }}>
                    {ri === 0 && <td rowSpan={k.rows.length} style={{ ...cellStyle, fontWeight: 700, color: C.white, verticalAlign: "top" }}>{k.keeper}</td>}
                    <td style={{ ...cellStyle, color: C.white }}>{r.scorer}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontWeight: 700, color: C.accent }}>{r.count}</td>
                    <td style={{ ...cellStyle, textAlign: "right", color: C.gray }}>{r.pct}%</td>
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "race" && (
        <div>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>누적 포인트 TOP 5 레이스</div>
          <svg viewBox="0 0 320 180" width="100%" style={{ display: "block" }}>
            {(() => {
              const dates = analysis.sortedDates;
              if (dates.length === 0) return null;
              const maxPt = Math.max(...analysis.pointRace.map(r => Math.max(...r.data)));
              const padL = 25, padR = 10, padT = 15, padB = 25;
              const cw = 320 - padL - padR, ch = 180 - padT - padB;
              const xS = (i) => padL + (i / (dates.length - 1 || 1)) * cw;
              const yS = (v) => padT + ch - (v / (maxPt || 1)) * ch;
              const yTicks = [];
              const step = Math.max(1, Math.ceil(maxPt / 4));
              for (let v = 0; v <= maxPt; v += step) yTicks.push(v);
              return (
                <>
                  {yTicks.map(v => (
                    <g key={v}>
                      <line x1={padL} y1={yS(v)} x2={310} y2={yS(v)} stroke={C.grayDarker} strokeWidth={0.5} strokeDasharray="3,3" />
                      <text x={padL - 4} y={yS(v) + 3} textAnchor="end" fontSize={8} fill={C.gray}>{v}</text>
                    </g>
                  ))}
                  {dates.filter((_, i) => i === 0 || i === dates.length - 1 || i % Math.ceil(dates.length / 4) === 0).map(d => {
                    const idx = dates.indexOf(d);
                    return <text key={d} x={xS(idx)} y={178} textAnchor="middle" fontSize={7} fill={C.gray}>{d.slice(5)}</text>;
                  })}
                  {analysis.pointRace.map((r, ri) => (
                    <g key={r.name}>
                      <polyline points={r.data.map((v, i) => `${xS(i)},${yS(v)}`).join(' ')} fill="none" stroke={COLORS[ri]} strokeWidth={1.5} />
                      <text x={xS(dates.length - 1) + 3} y={yS(r.data[r.data.length - 1]) + 3} fontSize={8} fill={COLORS[ri]} fontWeight={700}>
                        {r.name} {r.data[r.data.length - 1]}
                      </text>
                    </g>
                  ))}
                </>
              );
            })()}
          </svg>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 8 }}>
            {analysis.pointRace.map((r, ri) => (
              <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                <div style={{ width: 12, height: 3, borderRadius: 2, background: COLORS[ri] }} />
                <span style={{ color: C.white, fontWeight: 600 }}>{r.name}</span>
                <span style={{ color: COLORS[ri], fontWeight: 700 }}>{r.data[r.data.length - 1]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "chemistry" && (
        <div>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>같은 팀 골 관여 동료 (경기수 기준)</div>
          {analysis.topChemistry.map((c, i) => {
            const [p1, p2] = c.pair.split('+');
            const maxC = analysis.topChemistry[0]?.count || 1;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.grayDarker}`, gap: 8 }}>
                <span style={{ width: 24, fontSize: 11, color: C.gray, textAlign: "center" }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.white }}>{p1}</span>
                  <span style={{ fontSize: 10, color: C.gray }}> + {p2}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.accent, minWidth: 28, textAlign: "right" }}>{c.count}</span>
                <div style={{ width: 60 }}><div style={{ height: 8, borderRadius: 4, background: GREEN, width: `${c.count / maxC * 100}%`, minWidth: 2 }} /></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
