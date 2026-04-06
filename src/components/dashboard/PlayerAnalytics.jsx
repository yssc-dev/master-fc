import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import AppSync from '../../services/appSync';
import { getSettings, saveSettings, loadSettingsFromFirebase } from '../../config/settings';

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
    const assistEntries = Object.entries(data.assists).sort((a, b) => b[1] - a[1]);
    const slices = [];
    if (data.solo > 0) slices.push({ label: "단독", count: data.solo });
    assistEntries.forEach(([a, c]) => slices.push({ label: a, count: c }));
    slices.sort((a, b) => b.count - a.count);
    // 상위 4개 + 나머지 기타
    const top = slices.slice(0, 4);
    const rest = slices.slice(4).reduce((s, r) => s + r.count, 0);
    if (rest > 0) top.push({ label: "기타", count: rest });
    return { scorer: name, total: data.total, slices: top };
  });

  // 키퍼킬러: 실점 상위 TOP5 키퍼 → 각 득점자 상위 3명
  const topKeepers = Object.entries(keeperData).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  const keeperKillers = topKeepers.map(([keeper, data]) => {
    const scorerEntries = Object.entries(data.scorers).sort((a, b) => b[1] - a[1]);
    const top = scorerEntries.slice(0, 4).map(([s, c]) => ({ label: s, count: c }));
    const rest = scorerEntries.slice(4).reduce((s, [, c]) => s + c, 0);
    if (rest > 0) top.push({ label: "기타", count: rest });
    return { keeper, total: data.total, slices: top };
  });


  // 케미: 득점자+어시 조합 카운트 (날짜 무관)
  const pairCount = {};
  events.forEach(e => {
    if (e.scorer && e.assist) {
      const pair = [e.scorer, e.assist].sort().join('+');
      pairCount[pair] = (pairCount[pair] || 0) + 1;
    }
  });
  const topChemistry = Object.entries(pairCount).map(([pair, count]) => ({ pair, count })).sort((a, b) => b.count - a.count).slice(0, 15);

  // 키퍼일 때 우리팀 득점 분석
  // 1. 각 매치별로 양팀 키퍼 파악 (실점 이벤트의 concedingGk)
  const matchKeepers = {}; // "date_matchId_team" → keeper
  const matchGoals = {};   // "date_matchId_team" → goals scored by that team
  events.forEach(e => {
    if (!e.date || !e.matchId) return;
    if (e.scorer && e.myTeam) {
      const key = `${e.date}_${e.matchId}_${e.myTeam}`;
      matchGoals[key] = (matchGoals[key] || 0) + 1;
    }
    if (e.concedingGk && e.opponent) {
      // concedingGk는 상대팀(opponent)의 키퍼
      const key = `${e.date}_${e.matchId}_${e.opponent}`;
      matchKeepers[key] = e.concedingGk;
    }
  });

  // 2. 키퍼별: 키퍼일 때 우리팀 득점 vs 실점
  const keeperImpact = {};
  for (const [matchKey, keeper] of Object.entries(matchKeepers)) {
    if (!keeperImpact[keeper]) keeperImpact[keeper] = { asKeeper: { games: 0, teamGoals: 0, conceded: 0 } };
    const ki = keeperImpact[keeper].asKeeper;
    ki.games++;
    ki.teamGoals += matchGoals[matchKey] || 0;
    // 실점: 같은 매치에서 상대팀 골 수
    const parts = matchKey.split('_');
    const date = parts[0], matchId = parts[1], myTeam = parts.slice(2).join('_');
    // 상대팀 골 찾기
    for (const [k, g] of Object.entries(matchGoals)) {
      if (k.startsWith(`${date}_${matchId}_`) && k !== matchKey) {
        ki.conceded += g;
        break;
      }
    }
  }

  const keeperStats = Object.entries(keeperImpact)
    .filter(([, v]) => v.asKeeper.games >= 2)
    .map(([name, v]) => ({
      name,
      games: v.asKeeper.games,
      teamGoals: v.asKeeper.teamGoals,
      conceded: v.asKeeper.conceded,
      avgTeamGoals: (v.asKeeper.teamGoals / v.asKeeper.games).toFixed(1),
      avgConceded: (v.asKeeper.conceded / v.asKeeper.games).toFixed(1),
    }))
    .sort((a, b) => b.avgTeamGoals - a.avgTeamGoals);

  return { goldenCombos, keeperKillers, keeperStats, topChemistry };
}

function analyzeTeams(playerLog) {
  // 같은 날짜 + crova > 0인 선수 = 1위팀 동료
  // 같은 날짜 + goguma < 0인 선수 = 꼴찌팀 동료
  const crovaTeams = {}; // date → [names]
  const gogumaTeams = {};
  // 같은 날짜의 전체 참가자 목록
  const allTeamsByDate = {}; // date → Set(names)

  playerLog.forEach(p => {
    if (!allTeamsByDate[p.date]) allTeamsByDate[p.date] = new Set();
    allTeamsByDate[p.date].add(p.name);

    if (p.crova > 0) {
      if (!crovaTeams[p.date]) crovaTeams[p.date] = [];
      crovaTeams[p.date].push(p.name);
    }
    if (p.goguma < 0) {
      if (!gogumaTeams[p.date]) gogumaTeams[p.date] = [];
      gogumaTeams[p.date].push(p.name);
    }
  });

  // 크로바 TOP5 선수 → 함께한 팀원 빈도
  const crovaIndivCount = {};
  const gogumaIndivCount = {};
  Object.values(crovaTeams).forEach(names => names.forEach(n => { crovaIndivCount[n] = (crovaIndivCount[n] || 0) + 1; }));
  Object.values(gogumaTeams).forEach(names => names.forEach(n => { gogumaIndivCount[n] = (gogumaIndivCount[n] || 0) + 1; }));

  const buildPlayerTeammates = (teams, indivCount, topN = 5) => {
    const topPlayers = Object.entries(indivCount).sort((a, b) => b[1] - a[1]).slice(0, topN);
    return topPlayers.map(([name, total]) => {
      const teammates = {};
      Object.values(teams).forEach(names => {
        if (!names.includes(name)) return;
        names.forEach(n => { if (n !== name) teammates[n] = (teammates[n] || 0) + 1; });
      });
      const topMates = Object.entries(teammates).sort((a, b) => b[1] - a[1]).slice(0, 3);
      return { name, total, mates: topMates.map(([m, c]) => ({ name: m, count: c })) };
    });
  };

  const crovaTop = buildPlayerTeammates(crovaTeams, crovaIndivCount);
  const gogumaTop = buildPlayerTeammates(gogumaTeams, gogumaIndivCount);

  // 크로바/고구마 팀 최다 등장 선수 TOP 3 (양쪽 횟수 포함)
  const crovaFrequent = Object.entries(crovaIndivCount).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([name, count]) => ({ name, crova: count, goguma: gogumaIndivCount[name] || 0 }));
  const gogumaFrequent = Object.entries(gogumaIndivCount).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([name, count]) => ({ name, goguma: count, crova: crovaIndivCount[name] || 0 }));

  // 개인별 빈도
  const countIndiv = (teams) => {
    const counts = {};
    Object.values(teams).forEach(names => names.forEach(n => { counts[n] = (counts[n] || 0) + 1; }));
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  };

  // 시즌 레이스: 선수별집계기록로그 기반 누적 포인트
  // 포인트 = goals + assists + ownGoals + cleanSheets + crova + goguma
  const datePoints = {};
  const allDates = new Set();
  playerLog.forEach(p => {
    allDates.add(p.date);
    if (!datePoints[p.name]) datePoints[p.name] = {};
    const pt = p.goals + p.assists + p.ownGoals + p.cleanSheets + p.crova + p.goguma;
    datePoints[p.name][p.date] = (datePoints[p.name][p.date] || 0) + pt;
  });

  const sortedDates = [...allDates].sort();
  const pointTotals = {};
  Object.keys(datePoints).forEach(name => {
    let cum = 0;
    sortedDates.forEach(d => { cum += (datePoints[name][d] || 0); });
    pointTotals[name] = cum;
  });
  const topN = Object.entries(pointTotals).sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);
  const pointRace = topN.map(name => {
    let cum = 0;
    const data = sortedDates.map(d => { cum += (datePoints[name]?.[d] || 0); return cum; });
    return { name, data };
  });

  return {
    crovaTop,
    gogumaTop,
    crovaFrequent,
    gogumaFrequent,
    crovaGames: Object.keys(crovaTeams).length,
    gogumaGames: Object.keys(gogumaTeams).length,
    pointRace,
    sortedDates,
  };
}

export default function PlayerAnalytics({ teamName, initialTab, isAdmin }) {
  const { C } = useTheme();
  const [events, setEvents] = useState(null);
  const [playerLog, setPlayerLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(initialTab || "combo");
  const [editingTeamIdx, setEditingTeamIdx] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [detailPlayer, setDetailPlayer] = useState(null); // 개인합 상세 보기용
  const [dualSettings, setDualSettings] = useState(null);

  useEffect(() => {
    const s = getSettings(teamName);
    console.log("분석 시트설정:", { pointLog: s.pointLogSheet, playerLog: s.playerLogSheet });
    Promise.all([
      AppSync.getPointLog(s.pointLogSheet),
      AppSync.getPlayerLog(s.playerLogSheet),
    ]).then(([evts, plog]) => { setEvents(evts); setPlayerLog(plog); }).finally(() => setLoading(false));
  }, [teamName]);

  useEffect(() => {
    if (tab === "dualteam") {
      loadSettingsFromFirebase(teamName).then(s => setDualSettings(s));
    }
  }, [tab, teamName]);

  const analysis = useMemo(() => events ? analyzeData(events) : null, [events]);
  const teamAnalysis = useMemo(() => {
    if (!playerLog) return null;
    const dates = [...new Set(playerLog.map(p => p.date))].sort();
    console.log("playerLog 날짜:", dates, "총", playerLog.length, "건");
    return analyzeTeams(playerLog);
  }, [playerLog]);

  const tabs = [
    { key: "combo", label: "골든콤비" },
    { key: "killer", label: "키퍼킬러" },
    { key: "race", label: "시즌레이스" },
    { key: "chemistry", label: "케미" },
    { key: "crovaguma", label: "🍀/🍠" },
    ...(initialTab === "dualteam" ? [{ key: "dualteam", label: "팀전" }] : []),
  ];

  const RED = "#ef4444", BLUE = "#3b82f6", GREEN = "#22c55e", ORANGE = "#f97316", PURPLE = "#a855f7";
  const COLORS = [RED, BLUE, GREEN, ORANGE, PURPLE, "#eab308", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#06b6d4", "#f43f5e", "#a3e635", "#fb923c", "#818cf8", "#34d399", "#f472b6", "#facc15"];
  const PIE_COLORS = ["#22d3ee", "#f97316", "#22c55e", "#a855f7", "#6b7280"];

  const DonutChart = ({ slices, total, size = 90 }) => {
    const r = size / 2 - 2, cx = size / 2, cy = size / 2;
    let angle = -90;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => {
          const pct = s.count / total;
          const sweep = pct * 360;
          const startAngle = angle;
          angle += sweep;
          const endAngle = angle;
          const largeArc = sweep > 180 ? 1 : 0;
          const rad = Math.PI / 180;
          const x1 = cx + r * Math.cos(startAngle * rad);
          const y1 = cy + r * Math.sin(startAngle * rad);
          const x2 = cx + r * Math.cos(endAngle * rad);
          const y2 = cy + r * Math.sin(endAngle * rad);
          return (
            <path key={i} d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`}
              fill={PIE_COLORS[i % PIE_COLORS.length]} />
          );
        })}
        <circle cx={cx} cy={cy} r={r * 0.45} fill="#1e293b" />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fill="#fff" fontWeight={800}>{total}</text>
      </svg>
    );
  };

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
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>득점 상위 TOP5 어시스트 분포</div>
          {analysis.goldenCombos.map((g, gi) => (
            <div key={gi} style={{ padding: "10px 0", borderBottom: `1px solid ${C.grayDarker}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 6 }}>{g.scorer}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <DonutChart slices={g.slices} total={g.total} size={100} />
                <div style={{ flex: 1 }}>
                  {g.slices.map((s, si) => (
                    <div key={si} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, marginBottom: 2 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: PIE_COLORS[si], flexShrink: 0 }} />
                      <span style={{ color: C.white, fontWeight: 600 }}>{s.label}</span>
                      <span style={{ color: C.accent, fontWeight: 700 }}>{s.count}</span>
                      <span style={{ color: C.gray }}>({(s.count / g.total * 100).toFixed(0)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "killer" && (
        <div>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>실점 상위 TOP5 키퍼 득점자 분포</div>
          {analysis.keeperKillers.map((k, ki) => (
            <div key={ki} style={{ padding: "10px 0", borderBottom: `1px solid ${C.grayDarker}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 6 }}>{k.keeper} <span style={{ fontSize: 10, color: C.gray }}>({k.total}실점)</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <DonutChart slices={k.slices} total={k.total} size={100} />
                <div style={{ flex: 1 }}>
                  {k.slices.map((s, si) => (
                    <div key={si} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, marginBottom: 2 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: PIE_COLORS[si], flexShrink: 0 }} />
                      <span style={{ color: C.white, fontWeight: 600 }}>{s.label}</span>
                      <span style={{ color: C.accent, fontWeight: 700 }}>{s.count}</span>
                      <span style={{ color: C.gray }}>({(s.count / k.total * 100).toFixed(0)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

          <div style={{ fontSize: 12, fontWeight: 700, color: C.white, marginTop: 16, marginBottom: 8 }}>내가 키퍼일 때 우리팀 득점 (2경기 이상)</div>
          <div style={{ fontSize: 10, color: C.gray, marginBottom: 8 }}>평균 득점이 높을수록 → 필드에 없어도 팀이 잘함 🤔</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={headerCell}>키퍼</th>
              <th style={{ ...headerCell, textAlign: "right" }}>경기</th>
              <th style={{ ...headerCell, textAlign: "right" }}>팀득점</th>
              <th style={{ ...headerCell, textAlign: "right" }}>실점</th>
              <th style={{ ...headerCell, textAlign: "right" }}>평균득</th>
              <th style={{ ...headerCell, textAlign: "right" }}>평균실</th>
            </tr></thead>
            <tbody>
              {analysis.keeperStats.map((k, i) => (
                <tr key={i}>
                  <td style={{ ...cellStyle, fontWeight: 600, color: C.white }}>{k.name}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>{k.games}</td>
                  <td style={{ ...cellStyle, textAlign: "right", color: C.accent, fontWeight: 700 }}>{k.teamGoals}</td>
                  <td style={{ ...cellStyle, textAlign: "right", color: RED }}>{k.conceded}</td>
                  <td style={{ ...cellStyle, textAlign: "right", color: GREEN, fontWeight: 700 }}>{k.avgTeamGoals}</td>
                  <td style={{ ...cellStyle, textAlign: "right", color: C.gray }}>{k.avgConceded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "race" && (
        <div>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>누적 포인트 TOP 10 레이스</div>
          <svg viewBox="0 0 320 180" width="100%" style={{ display: "block" }}>
            {(() => {
              const dates = teamAnalysis?.sortedDates;
              if (dates.length === 0) return null;
              const maxPt = Math.max(...teamAnalysis?.pointRace.map(r => Math.max(...r.data)));
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
                  {teamAnalysis?.pointRace.map((r, ri) => (
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
            {teamAnalysis?.pointRace.map((r, ri) => (
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
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>골+어시 함께 만든 조합 (전체 횟수)</div>
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

      {tab === "crovaguma" && teamAnalysis && (
        <div>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1, background: `${GREEN}15`, borderRadius: 8, padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 18 }}>🍀</div>
              <div style={{ fontSize: 11, color: C.gray }}>크로바 {teamAnalysis.crovaGames}회</div>
            </div>
            <div style={{ flex: 1, background: `${RED}15`, borderRadius: 8, padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 18 }}>🍠</div>
              <div style={{ fontSize: 11, color: C.gray }}>고구마 {teamAnalysis.gogumaGames}회</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1, background: `${GREEN}15`, borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 10, color: GREEN, marginBottom: 4 }}>🍀 1위팀 최다 등장</div>
              {teamAnalysis.crovaFrequent.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 0" }}>
                  <span style={{ color: C.white, fontWeight: 600, flex: 1 }}>{c.name}</span>
                  <span style={{ color: GREEN, fontWeight: 700, fontSize: 10 }}>🍀{c.crova}</span>
                  <span style={{ color: RED, fontWeight: 600, fontSize: 10 }}>🍠{c.goguma}</span>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, background: `${RED}15`, borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 10, color: RED, marginBottom: 4 }}>🍠 꼴찌팀 최다 등장</div>
              {teamAnalysis.gogumaFrequent.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 0" }}>
                  <span style={{ color: C.white, fontWeight: 600, flex: 1 }}>{c.name}</span>
                  <span style={{ color: RED, fontWeight: 700, fontSize: 10 }}>🍠{c.goguma}</span>
                  <span style={{ color: GREEN, fontWeight: 600, fontSize: 10 }}>🍀{c.crova}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 8 }}>🍀 크로바 TOP5 — 누가 팀원일 때 1위?</div>
          {teamAnalysis.crovaTop.map((p, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${C.grayDarker}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.white }}>{p.name}</span>
                <span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>🍀 {p.total}회</span>
              </div>
              <div style={{ display: "flex", gap: 8, paddingLeft: 8 }}>
                {p.mates.map((m, mi) => (
                  <span key={mi} style={{ fontSize: 10, color: C.gray }}>
                    {m.name} <span style={{ color: GREEN, fontWeight: 600 }}>{m.count}회</span>
                  </span>
                ))}
              </div>
            </div>
          ))}

          <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginTop: 16, marginBottom: 8 }}>🍠 고구마 TOP5 — 누가 팀원일 때 꼴찌?</div>
          {teamAnalysis.gogumaTop.map((p, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${C.grayDarker}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.white }}>{p.name}</span>
                <span style={{ fontSize: 11, color: RED, fontWeight: 700 }}>🍠 {p.total}회</span>
              </div>
              <div style={{ display: "flex", gap: 8, paddingLeft: 8 }}>
                {p.mates.map((m, mi) => (
                  <span key={mi} style={{ fontSize: 10, color: C.gray }}>
                    {m.name} <span style={{ color: RED, fontWeight: 600 }}>{m.count}회</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "dualteam" && playerLog && dualSettings && (() => {
        const s = dualSettings;
        const teams = s.dualTeams || [];
        const startDate = s.dualTeamStartDate || "2026-04-01";
        const endDate = s.dualTeamEndDate || "2026-07-01";

        if (teams.length === 0) return <div style={{ textAlign: "center", padding: 20, color: C.gray }}>설정에서 팀전 팀을 구성해주세요</div>;

        // 기간 내 선수별 승점 + 크로바 + 고구마 + 개인Pt 합산
        const playerScores = {};
        const playerDateDetails = {}; // { name: [{ date, rankScore, personalPt, crova, goguma }] }
        playerLog.forEach(p => {
          if (p.date < startDate || p.date >= endDate) return;
          if (!playerScores[p.name]) playerScores[p.name] = { rankScore: 0, crova: 0, goguma: 0, personalPt: 0 };
          playerScores[p.name].rankScore += p.rankScore || 0;
          playerScores[p.name].crova += p.crova || 0;
          playerScores[p.name].goguma += p.goguma || 0;
          const pPt = (p.goals || 0) + (p.assists || 0) + (p.ownGoals || 0) + (p.cleanSheets || 0);
          playerScores[p.name].personalPt += pPt;
          if (!playerDateDetails[p.name]) playerDateDetails[p.name] = [];
          playerDateDetails[p.name].push({
            date: p.date, rankScore: p.rankScore || 0, personalPt: pPt,
            goals: p.goals || 0, assists: p.assists || 0, ownGoals: p.ownGoals || 0, cleanSheets: p.cleanSheets || 0,
            crova: p.crova || 0, goguma: p.goguma || 0,
          });
        });

        // 팀별 점수 합산
        const teamScores = teams.map((t, origIdx) => {
          let total = 0, totalPersonalPt = 0, detail = [];
          t.members.forEach(m => {
            const ps = playerScores[m] || { rankScore: 0, crova: 0, goguma: 0, personalPt: 0 };
            const individual = ps.rankScore + ps.crova + ps.goguma;
            total += individual;
            totalPersonalPt += ps.personalPt;
            detail.push({ name: m, rankScore: ps.rankScore, personalPt: ps.personalPt, crova: ps.crova, goguma: ps.goguma, total: individual });
          });
          return { name: t.name, members: t.members, total, totalPersonalPt, detail, origIdx };
        }).sort((a, b) => (b.total - a.total) || (b.totalPersonalPt - a.totalPersonalPt));

        const handleTeamNameSave = async (origIdx, newName) => {
          const current = getSettings(teamName);
          const updated = [...(current.dualTeams || [])];
          updated[origIdx] = { ...updated[origIdx], name: newName };
          await saveSettings(teamName, { ...current, dualTeams: updated });
          setDualSettings({ ...current, dualTeams: updated });
          setEditingTeamIdx(null);
        };

        const maxScore = teamScores[0]?.total || 1;

        const tc = { padding: "5px 4px", borderBottom: `1px solid ${C.grayDarker}`, fontSize: 10, textAlign: "center" };
        const th = { ...tc, fontWeight: 700, color: C.gray, fontSize: 9 };

        return (
          <div>
            <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>
              기간: {startDate} ~ {endDate} (설정에서 변경 가능)
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>#</th>
                  <th style={th}>팀</th>
                  <th style={th}>선수</th>
                  <th style={th}>승점</th>
                  <th style={th}>개인Pt</th>
                  <th style={th}>🍀</th>
                  <th style={th}>🍠</th>
                  <th style={th}>개인합</th>
                  <th style={th}>팀합</th>
                </tr>
              </thead>
              <tbody>
                {teamScores.map((t, i) => (
                  t.detail.map((d, di) => (
                    <tr key={`${i}-${di}`} style={{ background: i % 2 === 0 ? "transparent" : `${C.grayDarker}22` }}>
                      {di === 0 && (
                        <td rowSpan={t.detail.length} style={{ ...tc, verticalAlign: "middle", padding: "4px 2px" }}>
                          {i < 3 ? (
                            <span style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 22, height: 22, borderRadius: "50%", fontSize: 11, fontWeight: 800,
                              background: i === 0 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : i === 1 ? "linear-gradient(135deg, #d1d5db, #9ca3af)" : "linear-gradient(135deg, #d97706, #92400e)",
                              color: i === 0 ? "#78350f" : i === 1 ? "#374151" : "#fef3c7",
                            }}>{i + 1}</span>
                          ) : (
                            <span style={{ fontSize: 11, color: C.gray, fontWeight: 600 }}>{i + 1}</span>
                          )}
                        </td>
                      )}
                      {di === 0 && (
                        <td rowSpan={t.detail.length} style={{ ...tc, fontWeight: 800, color: C.white, fontSize: 11, verticalAlign: "middle" }}>
                          {isAdmin && editingTeamIdx === t.origIdx ? (
                            <form onSubmit={e => { e.preventDefault(); handleTeamNameSave(t.origIdx, editingName); }} style={{ display: "flex", gap: 2, alignItems: "center" }}>
                              <input
                                value={editingName}
                                onChange={e => setEditingName(e.target.value)}
                                autoFocus
                                style={{ width: 50, fontSize: 11, fontWeight: 800, background: C.cardLight, color: C.white, border: `1px solid ${C.accent}`, borderRadius: 4, padding: "2px 4px", textAlign: "center" }}
                                onBlur={() => setEditingTeamIdx(null)}
                              />
                              <button type="submit" onMouseDown={e => e.preventDefault()} style={{ fontSize: 10, background: C.accent, color: "#fff", border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>OK</button>
                            </form>
                          ) : (
                            <span onClick={() => { if (isAdmin) { setEditingTeamIdx(t.origIdx); setEditingName(t.name); } }} style={isAdmin ? { cursor: "pointer" } : undefined}>
                              {t.name}
                            </span>
                          )}
                        </td>
                      )}
                      <td style={{ ...tc, color: C.white, fontWeight: 600 }}>{d.name}</td>
                      <td style={tc}>{d.rankScore}</td>
                      <td style={{ ...tc, color: d.personalPt > 0 ? C.white : d.personalPt < 0 ? RED : C.grayDark }}>{d.personalPt}</td>
                      <td style={{ ...tc, color: d.crova > 0 ? GREEN : C.grayDark }}>{d.crova}</td>
                      <td style={{ ...tc, color: d.goguma < 0 ? RED : C.grayDark }}>{d.goguma}</td>
                      <td onClick={() => setDetailPlayer(detailPlayer === d.name ? null : d.name)}
                        style={{ ...tc, color: C.accent, fontWeight: 700, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dashed" }}>{d.total}</td>
                      {di === 0 && (
                        <td rowSpan={t.detail.length} style={{ ...tc, fontSize: 14, fontWeight: 900, color: C.accent, verticalAlign: "middle" }}>
                          {t.total}
                        </td>
                      )}
                    </tr>
                  ))
                ))}
              </tbody>
            </table>

            {/* 개인합 상세 */}
            {detailPlayer && playerDateDetails[detailPlayer] && (
              <div style={{ marginTop: 12, background: C.cardLight, borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.white }}>{detailPlayer} 상세</span>
                  <button onClick={() => setDetailPlayer(null)} style={{ background: "transparent", border: "none", color: C.gray, fontSize: 12, cursor: "pointer" }}>닫기</button>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>날짜</th>
                      <th style={th}>승점</th>
                      <th style={th}>골</th>
                      <th style={th}>어시</th>
                      <th style={th}>역주행</th>
                      <th style={th}>CS</th>
                      <th style={th}>개인Pt</th>
                      <th style={th}>🍀</th>
                      <th style={th}>🍠</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerDateDetails[detailPlayer].sort((a, b) => a.date.localeCompare(b.date)).map((dd, di) => (
                      <tr key={di}>
                        <td style={{ ...tc, fontSize: 9 }}>{dd.date.slice(5)}</td>
                        <td style={tc}>{dd.rankScore}</td>
                        <td style={tc}>{dd.goals}</td>
                        <td style={tc}>{dd.assists}</td>
                        <td style={{ ...tc, color: dd.ownGoals < 0 ? RED : C.grayDark }}>{dd.ownGoals}</td>
                        <td style={tc}>{dd.cleanSheets}</td>
                        <td style={{ ...tc, fontWeight: 700 }}>{dd.personalPt}</td>
                        <td style={{ ...tc, color: dd.crova > 0 ? GREEN : C.grayDark }}>{dd.crova}</td>
                        <td style={{ ...tc, color: dd.goguma < 0 ? RED : C.grayDark }}>{dd.goguma}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
