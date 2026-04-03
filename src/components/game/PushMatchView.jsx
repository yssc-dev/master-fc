import { useState } from 'react';
import { TEAM_COLORS } from '../../config/constants';
import { useTheme } from '../../hooks/useTheme';
import { calcMatchScore } from '../../utils/scoring';
import { calcNextPushMatch } from '../../utils/pushMatch';
import CourtRecorder from './CourtRecorder';

export default function PushMatchView({
  teams, teamNames, teamColorIndices, gks, gksHistory, allEvents,
  onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent,
  onConfirmPushRound, onUnconfirmLastRound, completedMatches, attendees, onGkChange,
  pushState, styles: s,
}) {
  const { C } = useTheme();
  const [currentMatch, setCurrentMatch] = useState(
    pushState?.suggestedMatch || { home: 0, away: 1 }
  );
  const [editingMatch, setEditingMatch] = useState(false);
  const [editSelection, setEditSelection] = useState({ home: null, away: null });
  // viewingIdx: completedMatches.length = 현재(라이브), 0~length-1 = 과거 경기
  const [viewingIdx, setViewingIdx] = useState(completedMatches.length);

  const [lastMatchCount, setLastMatchCount] = useState(completedMatches.length);
  if (completedMatches.length !== lastMatchCount) {
    setLastMatchCount(completedMatches.length);
    setViewingIdx(completedMatches.length); // 새 경기 확정 시 라이브로 이동
    if (pushState?.suggestedMatch) {
      setCurrentMatch(pushState.suggestedMatch);
    }
  }

  const isLive = viewingIdx >= completedMatches.length;
  const viewingPast = !isLive ? completedMatches[viewingIdx] : null;

  // 라이브 경기 정보
  const liveMatchId = `P${completedMatches.length + 1}_C0`;
  const homeIdx = isLive ? currentMatch.home : viewingPast.homeIdx;
  const awayIdx = isLive ? currentMatch.away : viewingPast.awayIdx;
  const currentMatchId = isLive ? liveMatchId : viewingPast.matchId;

  // 과거 경기면 gksHistory에서, 라이브면 gks에서
  const viewGks = isLive ? gks : (gksHistory?.[viewingIdx] || {});

  const matchInfo = {
    homeIdx, awayIdx, matchId: currentMatchId,
    homeTeam: teamNames[homeIdx], awayTeam: teamNames[awayIdx],
    homeGk: viewGks[homeIdx] || null, awayGk: viewGks[awayIdx] || null,
    homeColor: TEAM_COLORS[teamColorIndices[homeIdx]],
    awayColor: TEAM_COLORS[teamColorIndices[awayIdx]],
    homePlayers: teams[homeIdx],
    awayPlayers: teams[awayIdx],
  };

  const handleConfirmRound = () => {
    const evts = allEvents.filter(e => e.matchId === liveMatchId);
    const homeScore = calcMatchScore(evts, liveMatchId, teamNames[currentMatch.home]);
    const awayScore = calcMatchScore(evts, liveMatchId, teamNames[currentMatch.away]);

    const result = {
      matchId: liveMatchId, homeIdx: currentMatch.home, awayIdx: currentMatch.away,
      homeTeam: teamNames[currentMatch.home], awayTeam: teamNames[currentMatch.away],
      homeGk: gks[currentMatch.home] || "", awayGk: gks[currentMatch.away] || "",
      homeScore, awayScore,
      court: "", mercenaries: [], isExtra: false,
    };

    const msg = `${result.homeTeam} ${homeScore}:${awayScore} ${result.awayTeam}`;
    if (!confirm(msg + "\n\n경기결과를 확정하시겠습니까?")) return;

    const newPushState = calcNextPushMatch(
      pushState, { homeIdx: currentMatch.home, awayIdx: currentMatch.away, homeScore, awayScore },
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
          const isPlaying = isLive && (idx === homeIdx || idx === awayIdx);
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

      {/* 경기 네비게이션 + 대진변경 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 6 }}>
        <button onClick={() => setViewingIdx(Math.max(0, viewingIdx - 1))} disabled={viewingIdx === 0}
          style={{ ...s.btnSm(C.grayDark), opacity: viewingIdx === 0 ? 0.3 : 1 }}>◀</button>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.white }}>
          {viewingIdx + 1}경기{!isLive && <span style={{ fontSize: 11, marginLeft: 6, color: C.green, fontWeight: 600 }}>종료됨</span>}
          {isLive && <span style={{ fontSize: 11, marginLeft: 6, color: C.orange, fontWeight: 600 }}>진행중</span>}
        </span>
        <button onClick={() => setViewingIdx(Math.min(completedMatches.length, viewingIdx + 1))} disabled={isLive}
          style={{ ...s.btnSm(C.grayDark), opacity: isLive ? 0.3 : 1 }}>▶</button>
        {isLive && streakInfo && (
          <span style={{ fontSize: 12, color: C.orange, fontWeight: 700 }}>
            {teamNames[streakInfo.teamIdx]} {streakInfo.count}연승
          </span>
        )}
        {isLive && (
          <button onClick={handleStartEdit} style={{ ...s.btnSm(C.grayDark, C.white), fontSize: 10 }}>
            대진변경
          </button>
        )}
      </div>

      {/* 경기 기록 */}
      <CourtRecorder
        key={`push_${viewingIdx}_${homeIdx}_${awayIdx}`}
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
        readOnly={!isLive}
      />

      {/* 하단 버튼 */}
      <div style={{ marginTop: 12 }}>
        {isLive ? (
          <button onClick={handleConfirmRound} style={{ ...s.btnFull(C.accent, C.bg) }}>
            경기 확정
          </button>
        ) : viewingIdx === completedMatches.length - 1 ? (
          <button onClick={onUnconfirmLastRound} style={{ ...s.btnFull(C.orange, C.bg) }}>
            {viewingIdx + 1}경기 확정취소
          </button>
        ) : null}
      </div>
    </div>
  );
}
