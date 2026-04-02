import { useState } from 'react';
import { TEAM_COLORS } from '../../config/constants';
import { useTheme } from '../../hooks/useTheme';
import { calcMatchScore } from '../../utils/scoring';
import { calcNextPushMatch } from '../../utils/pushMatch';
import CourtRecorder from './CourtRecorder';

export default function PushMatchView({
  teams, teamNames, teamColorIndices, gks, allEvents,
  onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent,
  onConfirmPushRound, completedMatches, attendees, onGkChange,
  pushState, styles: s,
}) {
  const { C } = useTheme();
  const [currentMatch, setCurrentMatch] = useState(
    pushState?.suggestedMatch || { home: 0, away: 1 }
  );
  const [editingMatch, setEditingMatch] = useState(false);
  const [editSelection, setEditSelection] = useState({ home: null, away: null });

  const [lastMatchCount, setLastMatchCount] = useState(completedMatches.length);
  if (completedMatches.length !== lastMatchCount) {
    setLastMatchCount(completedMatches.length);
    if (pushState?.suggestedMatch) {
      setCurrentMatch(pushState.suggestedMatch);
    }
  }

  const matchId = `P${completedMatches.length + 1}_C0`;
  const homeIdx = currentMatch.home;
  const awayIdx = currentMatch.away;

  const matchInfo = {
    homeIdx, awayIdx, matchId,
    homeTeam: teamNames[homeIdx], awayTeam: teamNames[awayIdx],
    homeGk: gks[homeIdx] || null, awayGk: gks[awayIdx] || null,
    homeColor: TEAM_COLORS[teamColorIndices[homeIdx]],
    awayColor: TEAM_COLORS[teamColorIndices[awayIdx]],
    homePlayers: teams[homeIdx],
    awayPlayers: teams[awayIdx],
  };

  const handleConfirmRound = () => {
    const evts = allEvents.filter(e => e.matchId === matchId);
    const homeScore = calcMatchScore(evts, matchId, matchInfo.homeTeam);
    const awayScore = calcMatchScore(evts, matchId, matchInfo.awayTeam);

    const result = {
      matchId, homeIdx, awayIdx,
      homeTeam: matchInfo.homeTeam, awayTeam: matchInfo.awayTeam,
      homeGk: gks[homeIdx] || "", awayGk: gks[awayIdx] || "",
      homeScore, awayScore,
      court: "", mercenaries: [], isExtra: false,
    };

    const msg = `${matchInfo.homeTeam} ${homeScore}:${awayScore} ${matchInfo.awayTeam}`;
    if (!confirm(msg + "\n\n경기결과를 확정하시겠습니까?")) return;

    const newPushState = calcNextPushMatch(
      pushState, { homeIdx, awayIdx, homeScore, awayScore },
      teams.length, teamNames
    );

    onConfirmPushRound(result, newPushState);
  };

  const handleStartEdit = () => {
    setEditSelection({ home: currentMatch.home, away: currentMatch.away });
    setEditingMatch(true);
  };

  const handleConfirmEdit = () => {
    if (editSelection.home === null || editSelection.away === null || editSelection.home === editSelection.away) return;
    setCurrentMatch({ home: editSelection.home, away: editSelection.away });
    setEditingMatch(false);
  };

  const streakInfo = pushState?.winStreak;

  if (editingMatch) {
    return (
      <div>
        <div style={{ fontSize: 13, color: C.gray, marginBottom: 8 }}>대진 변경</div>
        <div style={s.card}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6, textAlign: "center" }}>홈팀</div>
              {teamNames.map((name, idx) => (
                <button key={idx} onClick={() => setEditSelection(prev => ({ ...prev, home: idx }))}
                  style={{ ...s.matchBtn(editSelection.home === idx ? TEAM_COLORS[teamColorIndices[idx]] : null), width: "100%", marginBottom: 4, opacity: editSelection.away === idx ? 0.3 : 1 }}>
                  {name}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", color: C.gray, fontSize: 18, fontWeight: 900 }}>VS</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6, textAlign: "center" }}>원정팀</div>
              {teamNames.map((name, idx) => (
                <button key={idx} onClick={() => setEditSelection(prev => ({ ...prev, away: idx }))}
                  style={{ ...s.matchBtn(editSelection.away === idx ? TEAM_COLORS[teamColorIndices[idx]] : null), width: "100%", marginBottom: 4, opacity: editSelection.home === idx ? 0.3 : 1 }}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => setEditingMatch(false)} style={s.btn(C.grayDark)}>취소</button>
            <button onClick={handleConfirmEdit}
              disabled={editSelection.home === null || editSelection.away === null || editSelection.home === editSelection.away}
              style={{ ...s.btnFull(C.green), flex: 1, opacity: (editSelection.home !== null && editSelection.away !== null && editSelection.home !== editSelection.away) ? 1 : 0.4 }}>
              확인
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* 상단: 팀별 출전횟수 대시보드 */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {teamNames.map((name, idx) => {
          const isPlaying = idx === homeIdx || idx === awayIdx;
          const isResting = pushState?.forcedRest === idx;
          const color = TEAM_COLORS[teamColorIndices[idx]];
          return (
            <div key={idx} style={{
              flex: 1, minWidth: 60, background: C.card, borderRadius: 8, padding: "6px 4px",
              textAlign: "center", borderTop: `3px solid ${color?.bg || C.accent}`,
              opacity: isPlaying ? 1 : 0.6,
              outline: isPlaying ? `2px solid ${color?.bg || C.accent}` : "none",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: color?.bg || C.white, marginBottom: 2 }}>
                {name}
              </div>
              <div style={{ fontSize: 10, color: C.gray }}>
                {pushState?.teamPlayCounts?.[idx] || 0}경기
              </div>
              <div style={{ fontSize: 10, color: C.gray }}>
                {pushState?.teamTotalGoals?.[idx] || 0}골
              </div>
              {isResting && (
                <div style={{ fontSize: 9, color: C.orange, fontWeight: 700, marginTop: 2 }}>휴식</div>
              )}
            </div>
          );
        })}
      </div>

      {/* 중단: 대진 + 연승 정보 */}
      <div style={{ ...s.card, marginBottom: 12, textAlign: "center" }}>
        <div style={{ fontSize: 12, color: C.gray, marginBottom: 4 }}>
          {completedMatches.length + 1}경기
          {streakInfo && (
            <span style={{ marginLeft: 8, color: C.orange, fontWeight: 700 }}>
              {teamNames[streakInfo.teamIdx]} {streakInfo.count}연승 중
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: TEAM_COLORS[teamColorIndices[homeIdx]]?.bg || C.white }}>
            {teamNames[homeIdx]}
          </span>
          <span style={{ fontSize: 14, color: C.gray, fontWeight: 900 }}>VS</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: TEAM_COLORS[teamColorIndices[awayIdx]]?.bg || C.white }}>
            {teamNames[awayIdx]}
          </span>
        </div>
        <button onClick={handleStartEdit} style={{ ...s.btnSm(C.grayDark, C.white), fontSize: 11 }}>
          대진 변경
        </button>
      </div>

      {/* 하단: 경기 기록 */}
      <CourtRecorder
        key={`push_${completedMatches.length}_${homeIdx}_${awayIdx}`}
        matchInfo={matchInfo}
        homePlayers={matchInfo.homePlayers}
        awayPlayers={matchInfo.awayPlayers}
        allEvents={allEvents}
        onRecordEvent={onRecordEvent}
        onUndoEvent={onUndoEvent}
        onDeleteEvent={onDeleteEvent}
        onEditEvent={onEditEvent}
        onFinish={() => {}}
        onGkChange={onGkChange}
        styles={s}
        courtLabel=""
        attendees={attendees}
      />

      {/* 경기 확정 버튼 */}
      <div style={{ marginTop: 12 }}>
        <button onClick={handleConfirmRound} style={{ ...s.btnFull(C.accent, C.bg) }}>
          경기 확정
        </button>
      </div>
    </div>
  );
}
