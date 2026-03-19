import { useTheme } from '../../hooks/useTheme';
import { TEAM_COLORS } from '../../config/constants';
import Modal from '../common/Modal';

export default function ScheduleModal({ schedule, currentRoundIdx, viewingRoundIdx, setViewingRoundIdx, confirmedRounds, allEvents, teamNames, teamColorIndices, courtCount, onClose, styles: s }) {
  const { C } = useTheme();

  const pill = (teamIdx) => {
    const color = TEAM_COLORS[teamColorIndices?.[teamIdx]] || { bg: C.cardLight, text: C.white };
    return {
      display: "inline-block", padding: "3px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700,
      background: color.bg, color: color.text, whiteSpace: "nowrap",
    };
  };

  const getMatchDisplay = (pair, ci, ri) => {
    if (!pair) return <span style={{ color: C.grayDark }}>-</span>;
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
          <span style={{ fontSize: 11, fontWeight: 800, color: C.white, minWidth: 28, textAlign: "center" }}>{score.home}:{score.away}</span>
        ) : (
          <span style={{ fontSize: 10, color: C.grayDark }}>vs</span>
        )}
        <span style={pill(pair[1])}>{teamNames[pair[1]]}</span>
      </div>
    );
  };

  return (
    <Modal onClose={onClose} title="대진표">
      <div>
        {schedule.map((round, ri) => {
          const isCurrent = ri === currentRoundIdx;
          const isConfirmed = confirmedRounds[ri];
          return (
            <div key={ri} onClick={() => { setViewingRoundIdx(ri <= currentRoundIdx ? ri : viewingRoundIdx); onClose(); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 6px", cursor: "pointer", background: isCurrent ? `${C.accent}11` : "transparent", borderBottom: `1px solid ${C.grayDarker}`, borderRadius: isCurrent ? 8 : 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: isCurrent ? C.accent : C.gray, minWidth: 20 }}>{ri + 1}</span>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                {round.matches.map((pair, mi) => (
                  <div key={mi}>
                    {courtCount === 2 && <span style={{ fontSize: 9, color: C.gray, marginRight: 4 }}>{mi === 0 ? "A" : "B"}</span>}
                    {getMatchDisplay(pair, mi, ri)}
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: isConfirmed ? "#22c55e22" : isCurrent || ri < currentRoundIdx ? `${C.orange}22` : "transparent", color: isConfirmed ? "#22c55e" : isCurrent || ri < currentRoundIdx ? C.orange : C.grayDark }}>
                {isConfirmed ? "종료" : isCurrent || ri < currentRoundIdx ? "진행" : "-"}
              </span>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
