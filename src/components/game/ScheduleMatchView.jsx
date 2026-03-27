import { useMemo } from 'react';
import { TEAM_COLORS } from '../../config/constants';
import { useTheme } from '../../hooks/useTheme';
import { calcMatchScore } from '../../utils/scoring';
import CourtRecorder from './CourtRecorder';

export default function ScheduleMatchView({ schedule, currentRoundIdx, viewingRoundIdx, setViewingRoundIdx, confirmedRounds, onConfirmRound, teams, teamNames, teamColorIndices, gks, gksHistory, courtCount, allEvents, onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent, completedMatches, attendees, onGkChange, splitPhase, styles: s }) {
  const { C } = useTheme();
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

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 10 }}>
        <button onClick={() => setViewingRoundIdx(Math.max(0, viewingRoundIdx - 1))} disabled={viewingRoundIdx === 0}
          style={{ ...s.btnSm(C.grayDark), opacity: viewingRoundIdx === 0 ? 0.3 : 1 }}>◀</button>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>
          라운드 {viewingRoundIdx + 1} / {schedule.length}
          <span style={{ fontSize: 11, marginLeft: 8, color: isConfirmed ? C.green : C.orange, fontWeight: 600 }}>
            {isConfirmed ? "종료됨" : "진행중"}
          </span>
        </div>
        <button onClick={() => setViewingRoundIdx(Math.min(currentRoundIdx, viewingRoundIdx + 1))} disabled={viewingRoundIdx >= currentRoundIdx}
          style={{ ...s.btnSm(C.grayDark), opacity: viewingRoundIdx >= currentRoundIdx ? 0.3 : 1 }}>▶</button>
      </div>

      {/* 그룹 스플릿 배너: 7라운드 시작 시 표시 */}
      {splitPhase === "second" && viewingRoundIdx === 6 && (
        <div style={{
          textAlign: "center", padding: "10px 12px", marginBottom: 10, borderRadius: 8,
          background: `linear-gradient(135deg, ${C.accent}22, ${C.orange}22)`,
          border: `1px solid ${C.accent}44`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.white, marginBottom: 4 }}>그룹 스플릿</div>
          <div style={{ fontSize: 11, color: C.gray }}>전반 6라운드 순위 기준으로 상위/하위 리그가 편성되었습니다</div>
        </div>
      )}

      {/* 스플릿 후반 라운드 라벨 */}
      {splitPhase === "second" && viewingRoundIdx >= 6 && courtCount === 2 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: 700, color: C.green, padding: "4px 0", background: `${C.green}15`, borderRadius: 6 }}>
            🏆 상위 리그 (1~3위)
          </div>
          <div style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: 700, color: C.orange, padding: "4px 0", background: `${C.orange}15`, borderRadius: 6 }}>
            하위 리그 (4~6위)
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {matchInfos.map((mi, i) => {
          const evts = allEvents.filter(e => e.matchId === mi.matchId);
          const hs = calcMatchScore(evts, mi.matchId, mi.homeTeam);
          const as_ = calcMatchScore(evts, mi.matchId, mi.awayTeam);
          const isSecondHalf = splitPhase === "second" && viewingRoundIdx >= 6;
          const courtLabel = isSecondHalf
            ? (i === 0 ? "상위 리그" : "하위 리그")
            : courtCount === 2 ? (i === 0 ? "A구장" : "B구장") : `매치${i + 1}`;
          const courtColor = isSecondHalf
            ? (i === 0 ? C.green : C.orange)
            : (i === 0 ? C.accent : C.orange);
          return (
            <div key={i} style={{ flex: 1, background: C.card, borderRadius: 10, padding: "8px 6px", textAlign: "center", borderTop: `3px solid ${courtColor}` }}>
              <div style={{ fontSize: 10, color: courtColor, fontWeight: 700, marginBottom: 4 }}>{courtLabel}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: hs > as_ ? C.green : C.white }}>{mi.homeTeam}</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: C.white }}>{hs} : {as_}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: as_ > hs ? C.green : C.white }}>{mi.awayTeam}</span>
              </div>
            </div>
          );
        })}
      </div>

      {matchInfos.map((mi, i) => {
        const isSecondHalf = splitPhase === "second" && viewingRoundIdx >= 6;
        const courtLabel = isSecondHalf
          ? (i === 0 ? "🏆 상위 리그" : "하위 리그")
          : courtCount === 2 ? (i === 0 ? "A구장" : "B구장") : `매치 ${i + 1}`;
        const courtColor = isSecondHalf
          ? (i === 0 ? C.green : C.orange)
          : (i === 0 ? C.accent : C.orange);
        return (
        <div key={`${viewingRoundIdx}_${i}`} style={{ marginBottom: 16, borderLeft: `3px solid ${courtColor}`, paddingLeft: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: courtColor, marginBottom: 6 }}>
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
