import { useTheme } from '../../hooks/useTheme';
import { TEAM_COLORS } from '../../config/constants';
import Modal from '../common/Modal';

export default function ScheduleModal({ schedule, currentRoundIdx, viewingRoundIdx, setViewingRoundIdx, confirmedRounds, allEvents, teamNames, teamColorIndices, courtCount, onClose, styles: s }) {
  const { C } = useTheme();

  const pill = (teamIdx) => {
    const ci = teamColorIndices?.[teamIdx];
    const tc = ci != null ? TEAM_COLORS[ci] : null;
    return {
      display: "inline-block", padding: "3px 8px", borderRadius: 12, fontSize: 12, fontWeight: 700,
      background: tc ? `${tc.bg}55` : C.cardLight,
      color: C.white,
      border: tc ? `1px solid ${tc.bg}88` : "none",
      whiteSpace: "nowrap",
    };
  };

  const getMatchCell = (pair, ci, ri) => {
    if (!pair) return <span style={{ color: C.grayDark, fontSize: 12 }}>-</span>;
    const confirmed = confirmedRounds[ri];
    let score = null;
    if (confirmed) {
      const matchId = `R${ri + 1}_C${ci}`;
      const evts = allEvents.filter(e => e.matchId === matchId);
      const hs = evts.filter(e => e.scoringTeam === teamNames[pair[0]]).reduce((s, e) => s + (e.type === "owngoal" ? 2 : 1), 0);
      const as_ = evts.filter(e => e.scoringTeam === teamNames[pair[1]]).reduce((s, e) => s + (e.type === "owngoal" ? 2 : 1), 0);
      score = { home: hs, away: as_ };
    }
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <span style={pill(pair[0])}>{teamNames[pair[0]]}</span>
        {score ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: C.white, minWidth: 28, textAlign: "center" }}>{score.home}:{score.away}</span>
        ) : (
          <span style={{ fontSize: 11, color: C.grayDark }}>vs</span>
        )}
        <span style={pill(pair[1])}>{teamNames[pair[1]]}</span>
      </div>
    );
  };

  const is2Court = courtCount === 2;

  return (
    <Modal onClose={onClose} title="대진표">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...s.th, minWidth: 28 }}>R</th>
            {is2Court ? (
              <>
                <th style={s.th}>A구장</th>
                <th style={s.th}>B구장</th>
              </>
            ) : (
              <th style={s.th}>대진</th>
            )}
            <th style={{ ...s.th, minWidth: 30 }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((round, ri) => {
            const isCurrent = ri === currentRoundIdx;
            const isConfirmed = confirmedRounds[ri];
            return (
              <tr key={ri} onClick={() => { setViewingRoundIdx(ri <= currentRoundIdx ? ri : viewingRoundIdx); onClose(); }}
                style={{ cursor: "pointer", background: isCurrent ? `${C.accent}11` : "transparent" }}>
                <td style={{ ...s.td(isCurrent), fontSize: 13, fontWeight: 700 }}>{ri + 1}</td>
                {is2Court ? (
                  <>
                    <td style={{ ...s.td(), padding: "6px 2px" }}>{getMatchCell(round.matches[0], 0, ri)}</td>
                    <td style={{ ...s.td(), padding: "6px 2px" }}>{getMatchCell(round.matches[1], 1, ri)}</td>
                  </>
                ) : (
                  <td style={{ ...s.td(), padding: "6px 2px" }}>
                    {round.matches.map((pair, mi) => (
                      <div key={mi} style={{ marginBottom: mi < round.matches.length - 1 ? 4 : 0 }}>
                        {getMatchCell(pair, mi, ri)}
                      </div>
                    ))}
                  </td>
                )}
                <td style={{ ...s.td(), padding: "4px 2px" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 6px", borderRadius: 4, background: isConfirmed ? "#22c55e22" : isCurrent || ri < currentRoundIdx ? `${C.orange}22` : "transparent", color: isConfirmed ? "#22c55e" : isCurrent || ri < currentRoundIdx ? C.orange : C.grayDark }}>
                    {isConfirmed ? "종료" : isCurrent || ri < currentRoundIdx ? "진행" : "-"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}
