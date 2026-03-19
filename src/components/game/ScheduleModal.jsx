import { useTheme } from '../../hooks/useTheme';
import Modal from '../common/Modal';

export default function ScheduleModal({ schedule, currentRoundIdx, viewingRoundIdx, setViewingRoundIdx, confirmedRounds, allEvents, teamNames, courtCount, onClose, styles: s }) {
  const { C } = useTheme();
  const getMatchScore = (pair, ci, ri) => {
    if (!pair || !confirmedRounds[ri]) return `${teamNames[pair[0]]} vs ${teamNames[pair[1]]}`;
    const matchId = `R${ri + 1}_C${ci}`;
    const evts = allEvents.filter(e => e.matchId === matchId);
    const hs = evts.filter(e => e.scoringTeam === teamNames[pair[0]]).reduce((s, e) => s + (e.type === "owngoal" ? 2 : 1), 0);
    const as_ = evts.filter(e => e.scoringTeam === teamNames[pair[1]]).reduce((s, e) => s + (e.type === "owngoal" ? 2 : 1), 0);
    return `${teamNames[pair[0]]} ${hs}:${as_} ${teamNames[pair[1]]}`;
  };

  return (
    <Modal onClose={onClose} title="대진표">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={s.th}>라운드</th>
            {courtCount === 2 ? (
              <><th style={s.th}>A구장</th><th style={s.th}>B구장</th></>
            ) : (
              <th style={s.th}>대진</th>
            )}
            <th style={s.th}>상태</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((round, ri) => (
            <tr key={ri} style={{ background: ri === currentRoundIdx ? `${C.accent}11` : "transparent", cursor: "pointer" }}
              onClick={() => { setViewingRoundIdx(ri <= currentRoundIdx ? ri : viewingRoundIdx); onClose(); }}>
              <td style={s.td(ri === currentRoundIdx)}>{ri + 1}</td>
              {courtCount === 2 ? (
                <>
                  <td style={{ ...s.td(), fontSize: 11 }}>{round.matches[0] ? getMatchScore(round.matches[0], 0, ri) : "-"}</td>
                  <td style={{ ...s.td(), fontSize: 11 }}>{round.matches[1] ? getMatchScore(round.matches[1], 1, ri) : "-"}</td>
                </>
              ) : (
                <td style={{ ...s.td(), fontSize: 11 }}>{round.matches.map((p, mi) => getMatchScore(p, mi, ri)).join(", ")}</td>
              )}
              <td style={{ ...s.td(), color: confirmedRounds[ri] ? C.green : ri <= currentRoundIdx ? C.orange : C.gray, fontSize: 10 }}>
                {confirmedRounds[ri] ? "종료" : ri <= currentRoundIdx ? "진행중" : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
