import { useMemo } from 'react';
import { TEAM_COLORS } from '../../config/constants';
import { BackIcon } from '../common/icons';
import CourtRecorder from './CourtRecorder';

export default function ScheduleMatchView({ schedule, currentRoundIdx, viewingRoundIdx, setViewingRoundIdx, confirmedRounds, onConfirmRound, teams, teamNames, teamColorIndices, gks, gksHistory, courtCount, allEvents, onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent, completedMatches, attendees, onGkChange, splitPhase, styles: s }) {
  const round = schedule[viewingRoundIdx];
  const matches = round?.matches || [];
  const isConfirmed = confirmedRounds[viewingRoundIdx] || false;

  // 확정된 라운드면 gksHistory에서, 현재 라운드면 gks에서 GK 참조
  const roundGks = isConfirmed ? (gksHistory?.[viewingRoundIdx] || {}) : gks;

  const matchInfos = useMemo(() => {
    return matches.map((pair, i) => ({
      homeIdx: pair[0], awayIdx: pair[1],
      matchId: `R${viewingRoundIdx + 1}_C${i}`,
      homeTeam: teamNames[pair[0]], awayTeam: teamNames[pair[1]],
      homeGk: roundGks[pair[0]] || null, awayGk: roundGks[pair[1]] || null,
      homeColor: TEAM_COLORS[teamColorIndices[pair[0]]],
      awayColor: TEAM_COLORS[teamColorIndices[pair[1]]],
      homePlayers: teams[pair[0]],
      awayPlayers: teams[pair[1]],
    }));
  }, [viewingRoundIdx, matches, teamNames, roundGks, teamColorIndices, teams]);

  const roundNavBtn = (disabled) => ({
    width: 36, height: 36, borderRadius: 999,
    background: "var(--app-bg-row)", border: "0.5px solid var(--app-divider)",
    color: "var(--app-text-primary)", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.3 : 1, padding: 0, fontFamily: "inherit",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  });

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8, marginBottom: 14, padding: "4px 0",
      }}>
        <button onClick={() => setViewingRoundIdx(Math.max(0, viewingRoundIdx - 1))}
          disabled={viewingRoundIdx === 0}
          style={roundNavBtn(viewingRoundIdx === 0)}>
          <BackIcon width={16} />
        </button>
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: 17, fontWeight: 600, color: "var(--app-text-primary)",
            letterSpacing: "-0.022em",
          }}>
            라운드 {viewingRoundIdx + 1} <span style={{ color: "var(--app-text-tertiary)", fontWeight: 500 }}>/ {schedule.length}</span>
          </div>
          <div style={{
            fontSize: 11, fontWeight: 600, marginTop: 2,
            color: isConfirmed ? "var(--app-green)" : "var(--app-orange)",
          }}>
            {isConfirmed ? "종료됨" : "진행중"}
          </div>
        </div>
        <button onClick={() => setViewingRoundIdx(Math.min(currentRoundIdx, viewingRoundIdx + 1))}
          disabled={viewingRoundIdx >= currentRoundIdx}
          style={roundNavBtn(viewingRoundIdx >= currentRoundIdx)}>
          <BackIcon width={16} style={{ transform: "rotate(180deg)" }} />
        </button>
      </div>

      {/* 그룹 스플릿 배너: 7라운드 시작 시 표시 */}
      {splitPhase === "second" && viewingRoundIdx === 6 && (
        <div style={{
          textAlign: "center", padding: "12px 14px", marginBottom: 12, borderRadius: 12,
          background: "rgba(0,122,255,0.1)",
          border: "0.5px solid rgba(0,122,255,0.25)",
        }}>
          <div style={{
            fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)",
            letterSpacing: "-0.014em",
          }}>그룹 스플릿</div>
          <div style={{ fontSize: 12, color: "var(--app-text-secondary)", marginTop: 2 }}>
            전반 6라운드 순위 기준으로 상위/하위 리그가 편성되었습니다
          </div>
        </div>
      )}

      {matchInfos.map((mi, i) => {
        const isSecondHalf = splitPhase === "second" && viewingRoundIdx >= 6;
        const courtLabel = isSecondHalf
          ? (i === 0 ? "상위 리그" : "하위 리그")
          : courtCount === 2 ? (i === 0 ? "A구장" : "B구장") : `매치 ${i + 1}`;
        const courtColorVar = isSecondHalf
          ? (i === 0 ? "var(--app-green)" : "var(--app-orange)")
          : (i === 0 ? "var(--app-blue)" : "var(--app-orange)");
        return (
        <div key={`${viewingRoundIdx}_${i}`} style={{ marginBottom: 18 }}>
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: courtColorVar,
            letterSpacing: "-0.01em",
            marginBottom: 8, marginLeft: 4,
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: courtColorVar }} />
            {courtLabel}
          </div>
          <CourtRecorder
            matchInfo={mi}
            homePlayers={mi.homePlayers}
            awayPlayers={mi.awayPlayers}
            allEvents={allEvents}
            onRecordEvent={onRecordEvent}
            onUndoEvent={onUndoEvent}
            onDeleteEvent={onDeleteEvent}
            onEditEvent={onEditEvent}
            onFinish={() => { }}
            onGkChange={onGkChange}
            styles={s}
            courtLabel={courtLabel}
            attendees={attendees}
            readOnly={isConfirmed}
          />
        </div>
        );
      })}
    </div>
  );
}
