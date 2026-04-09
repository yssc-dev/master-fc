import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import AppSync from '../../services/appSync';

export default function TournamentPlayerRecords({ tournamentId, playerRecords: propPlayers, eventLog: propEvents }) {
  const { C } = useTheme();
  const [players, setPlayers] = useState(propPlayers || []);
  const [eventLog, setEventLog] = useState(propEvents || []);
  const [loading, setLoading] = useState(!propPlayers);
  const [sortKey, setSortKey] = useState("point");

  useEffect(() => {
    if (propPlayers) { setPlayers(propPlayers); setLoading(false); }
    if (propEvents) setEventLog(propEvents);
  }, [propPlayers, propEvents]);

  useEffect(() => {
    // props로 안 받았으면 직접 로드 (하위 호환)
    if (propPlayers) return;
    Promise.all([
      AppSync.getTournamentPlayerRecords(tournamentId),
      AppSync.getTournamentEventLog(tournamentId),
    ]).then(([p, e]) => { setPlayers(p); setEventLog(e); }).finally(() => setLoading(false));
  }, [tournamentId, propPlayers]);

  // 이벤트로그에서 선발/교체출전 횟수 + 출전시간 계산
  const extraStats = useMemo(() => {
    const stats = {}; // { name: { starts, subApps, totalMinutes } }
    const ensure = (n) => { if (!stats[n]) stats[n] = { starts: 0, subApps: 0, totalMinutes: 0 }; };

    // 경기별로 그룹핑
    const matchEvents = {};
    for (const e of eventLog) {
      const key = e.matchNum;
      if (!matchEvents[key]) matchEvents[key] = [];
      matchEvents[key].push(e);
    }

    for (const [, events] of Object.entries(matchEvents)) {
      // 경기 시작/종료 시간 추정 (출전 이벤트의 시간 = 시작, 마지막 이벤트 = 종료 근사)
      const timestamps = events.map(e => {
        try { return new Date(e.inputTime).getTime(); } catch { return 0; }
      }).filter(t => t > 0);
      if (timestamps.length === 0) continue;
      const matchStart = Math.min(...timestamps);
      const matchEnd = Math.max(...timestamps);
      const matchDuration = Math.max(matchEnd - matchStart, 0);

      // 선발 선수
      const starters = new Set();
      for (const e of events) {
        if (e.event === "출전") { ensure(e.player); stats[e.player].starts++; starters.add(e.player); }
        if (e.event === "교체" && e.player) { ensure(e.player); stats[e.player].subApps++; }
      }

      // 출전시간 계산 (분) - 교체 이벤트 기반
      const subEvents = events.filter(e => e.event === "교체");
      const subOutTimes = {}; // { playerOut: timestamp }
      const subInTimes = {}; // { playerIn: timestamp }
      for (const e of subEvents) {
        const ts = (() => { try { return new Date(e.inputTime).getTime(); } catch { return matchEnd; } })();
        if (e.relatedPlayer) subOutTimes[e.relatedPlayer] = ts; // OUT 선수
        if (e.player) subInTimes[e.player] = ts; // IN 선수
      }

      for (const name of starters) {
        ensure(name);
        const outTime = subOutTimes[name] || matchEnd;
        stats[name].totalMinutes += Math.round((outTime - matchStart) / 60000);
      }
      for (const [name, inTime] of Object.entries(subInTimes)) {
        ensure(name);
        stats[name].totalMinutes += Math.round((matchEnd - inTime) / 60000);
      }
    }

    return stats;
  }, [eventLog]);

  if (loading) return <div style={{ textAlign: "center", padding: 20, color: C.gray }}>불러오는 중...</div>;
  if (players.length === 0) return <div style={{ textAlign: "center", padding: 20, color: C.gray }}>선수 기록이 없습니다</div>;

  const sorted = [...players].sort((a, b) => {
    if (sortKey === "point") return b.point - a.point || b.goals - a.goals;
    if (sortKey === "goals") return b.goals - a.goals;
    if (sortKey === "assists") return b.assists - a.assists;
    return b.point - a.point;
  });

  const th = { padding: "6px 3px", textAlign: "center", color: C.gray, borderBottom: `1px solid ${C.grayDarker}`, fontWeight: 600, fontSize: 9, cursor: "pointer" };
  const td = (hl) => ({ padding: "6px 3px", textAlign: "center", borderBottom: `1px solid ${C.grayDarker}`, fontWeight: hl ? 700 : 400, color: hl ? C.white : C.gray, fontSize: 11 });

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 8 }}>개인 기록</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          <th style={th}>선수</th>
          <th style={th}>선발</th>
          <th style={th}>교체</th>
          <th style={th}>시간</th>
          <th style={{ ...th, color: sortKey === "goals" ? C.accent : C.gray }} onClick={() => setSortKey("goals")}>골</th>
          <th style={{ ...th, color: sortKey === "assists" ? C.accent : C.gray }} onClick={() => setSortKey("assists")}>어시</th>
          <th style={th}>CS</th><th style={th}>자책</th>
          <th style={{ ...th, color: sortKey === "point" ? C.accent : C.gray }} onClick={() => setSortKey("point")}>포인트</th>
        </tr></thead>
        <tbody>
          {sorted.map((p, i) => {
            const ex = extraStats[p.name] || { starts: 0, subApps: 0 };
            return (
              <tr key={p.name}>
                <td style={{ ...td(true), textAlign: "left" }}>{i < 3 && p.point > 0 ? ["🥇","🥈","🥉"][i] + " " : ""}{p.name}</td>
                <td style={td()}>{ex.starts || 0}</td>
                <td style={td(ex.subApps > 0)}>{ex.subApps || 0}</td>
                <td style={td()}>{ex.totalMinutes > 0 ? `${ex.totalMinutes}'` : "-"}</td>
                <td style={td(p.goals > 0)}>{p.goals}</td>
                <td style={td(p.assists > 0)}>{p.assists}</td>
                <td style={td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
                <td style={{ ...td(p.owngoals > 0), color: p.owngoals > 0 ? "#ef4444" : C.gray }}>{p.owngoals}</td>
                <td style={{ ...td(true), fontSize: 13, fontWeight: 800 }}>{p.point}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
