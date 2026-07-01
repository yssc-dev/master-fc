import { useTheme } from '../../hooks/useTheme';
import SoccerStandingsTable from '../game/SoccerStandingsTable';
import {
  calcSoccerPlayerStats, calcSoccerPlayerPoint, calcSoccerTeamRecord,
  calcSoccerOpponentRecords, calcSoccerScore, soccerResultLabel, getCleanSheetPlayers,
} from '../../utils/soccerScoring';

// 아카이브 상세의 축구(matchMode==="soccer") 게임 렌더 — SoccerApp 최종집계(SUMMARY)와 동일 구성:
// 팀 순위(상대별 전적) · 경기 결과(스코어) · 선수별 기록. 데이터는 gs.soccerMatches에서 파생.
// HistoryView의 hs 스타일(th/td(highlight)/card)을 그대로 받아 futsal 상세와 톤을 맞춘다.
export default function SoccerArchiveDetail({ soccerMatches, es, styles: hs }) {
  const { C } = useTheme();
  const matches = soccerMatches || [];
  const finished = matches.filter(m => m.status === "finished");
  const rec = calcSoccerTeamRecord(matches);
  const oppRecords = calcSoccerOpponentRecords(matches);
  const playerRows = Object.entries(calcSoccerPlayerStats(finished)).map(([name, st]) => ({
    name, ...st, point: calcSoccerPlayerPoint(st, es),
  })).sort((a, b) =>
    b.point - a.point || b.goals - a.goals || b.assists - a.assists ||
    b.cleanSheets - a.cleanSheets || a.owngoals - b.owngoals || a.conceded - b.conceded || a.games - b.games
  );

  if (finished.length === 0) {
    return <div style={{ textAlign: "center", color: C.gray, padding: 20 }}>상세 기록이 없습니다</div>;
  }

  return (
    <>
      {/* 팀 순위 (상대별 전적) */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.white, marginBottom: 8 }}>🏆 팀 순위 (상대별 전적)</div>
        <div style={hs.card}>
          <SoccerStandingsTable records={oppRecords} total={rec} styles={hs} />
        </div>
      </div>

      {/* 경기 결과 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.white, marginBottom: 8 }}>📊 경기 결과</div>
        <div style={hs.card}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["#", "상대팀", "결과", "CS"].map(h => <th key={h} style={hs.th}>{h}</th>)}</tr></thead>
            <tbody>
              {finished.map(m => {
                const sc = calcSoccerScore(m.events);
                const cs = getCleanSheetPlayers(m);
                const result = soccerResultLabel(sc.ourScore, sc.opponentScore);
                const isRest = m.opponent === "휴식";
                return (
                  <tr key={m.matchIdx}>
                    <td style={hs.td()}>{m.matchIdx + 1}</td>
                    <td style={{ ...hs.td(true), textAlign: "left", paddingLeft: 4 }}>{m.opponent}</td>
                    <td style={{ ...hs.td(true), color: isRest ? C.gray : result === "승" ? C.green : result === "패" ? C.red : C.gray }}>
                      {isRest ? "😴 휴식" : `${sc.ourScore}:${sc.opponentScore} ${result}`}
                    </td>
                    <td style={hs.td()}>{cs.length > 0 ? "🛡" : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 선수별 기록 */}
      {playerRows.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.white, marginBottom: 8 }}>👤 선수별 기록</div>
          <div style={hs.card}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["선수", "경기", "골", "어시", "자책", "CS", "실점", "포인트"].map(h => <th key={h} style={hs.th}>{h}</th>)}</tr></thead>
              <tbody>
                {playerRows.map(p => (
                  <tr key={p.name}>
                    <td style={{ ...hs.td(true), textAlign: "left", paddingLeft: 4 }}>{p.name}</td>
                    <td style={hs.td()}>{p.games}</td>
                    <td style={hs.td(p.goals > 0)}>{p.goals}</td>
                    <td style={hs.td(p.assists > 0)}>{p.assists}</td>
                    <td style={{ ...hs.td(p.owngoals > 0), color: p.owngoals > 0 ? C.red : C.white }}>{p.owngoals}</td>
                    <td style={hs.td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
                    <td style={hs.td()}>{p.conceded}</td>
                    <td style={{ ...hs.td(true), fontSize: 14, fontWeight: 800, color: C.green }}>{p.point}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
