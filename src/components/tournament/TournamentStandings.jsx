import { useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function TournamentStandings({ schedule, ourTeamName }) {
  const { C } = useTheme();
  const standings = useMemo(() => {
    const stats = {};
    const ensure = (name) => { if (!stats[name]) stats[name] = { team: name, games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0 }; };
    for (const m of schedule) {
      if (m.homeScore === null || m.awayScore === null) continue;
      if (!m.home || !m.away) continue;
      ensure(m.home); ensure(m.away);
      stats[m.home].games++; stats[m.away].games++;
      stats[m.home].gf += m.homeScore; stats[m.home].ga += m.awayScore;
      stats[m.away].gf += m.awayScore; stats[m.away].ga += m.homeScore;
      if (m.homeScore > m.awayScore) { stats[m.home].wins++; stats[m.home].points += 3; stats[m.away].losses++; }
      else if (m.awayScore > m.homeScore) { stats[m.away].wins++; stats[m.away].points += 3; stats[m.home].losses++; }
      else { stats[m.home].draws++; stats[m.away].draws++; stats[m.home].points++; stats[m.away].points++; }
    }
    return Object.values(stats).sort((a, b) => (b.points - a.points) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf));
  }, [schedule]);

  if (standings.length === 0) return <div style={{ textAlign: "center", padding: 16, color: C.gray, fontSize: 13 }}>아직 완료된 경기가 없습니다</div>;
  const th = { padding: "6px 3px", textAlign: "center", color: C.gray, borderBottom: `1px solid ${C.grayDarker}`, fontWeight: 600, fontSize: 10 };
  const td = (hl) => ({ padding: "6px 3px", textAlign: "center", borderBottom: `1px solid ${C.grayDarker}`, fontWeight: hl ? 700 : 400, color: hl ? C.white : C.gray, fontSize: 11 });

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 8 }}>팀 순위</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{["#", "팀", "경기", "승", "무", "패", "득", "실", "득실", "승점"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {standings.map((t, i) => (
            <tr key={t.team} style={{ background: t.team === ourTeamName ? `${C.accent}11` : "transparent" }}>
              <td style={td()}>{i + 1}</td>
              <td style={{ ...td(true), textAlign: "left" }}>{t.team}{t.team === ourTeamName && " ★"}</td>
              <td style={td()}>{t.games}</td><td style={td()}>{t.wins}</td><td style={td()}>{t.draws}</td><td style={td()}>{t.losses}</td>
              <td style={td()}>{t.gf}</td><td style={td()}>{t.ga}</td><td style={td()}>{t.gf - t.ga}</td><td style={td(true)}>{t.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
