import { useState } from 'react';
import { TEAM_COLORS } from '../../config/constants';
import { useTheme } from '../../hooks/useTheme';
import { calcMatchScore } from '../../utils/scoring';
import CourtRecorder from './CourtRecorder';

export default function FreeMatchView({ teams, teamNames, teamColorIndices, gks, gksHistory, courtCount, allEvents, onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent, onFinishMatch, onConfirmFreeRound, completedMatches, attendees, onGkChange, liveMercs, onAddLiveMerc, onRemoveLiveMerc, onEditPastGk, onEditPastMercAdd, onEditPastMercRemove, absentees, onToggleAbsent, styles: s, isExtraRound }) {
  const { C } = useTheme();
  const [courtMatches, setCourtMatches] = useState({});
  const [activeCourtTab, setActiveCourtTab] = useState(0);
  const [settingCourt, setSettingCourt] = useState(null);
  const [selection, setSelection] = useState({ home: null, away: null });
  // 과거 매치 네비게이션. completedMatches.length = 라이브, 0~length-1 = 과거 매치 단건 보기
  // free 모드는 후속 매치업에 영향이 없어 과거 매치도 즉시 편집 가능 (토글 없음).
  const [viewingIdx, setViewingIdx] = useState(completedMatches.length);

  const [lastMatchCount, setLastMatchCount] = useState(completedMatches.length);
  if (completedMatches.length !== lastMatchCount) {
    setLastMatchCount(completedMatches.length);
    setViewingIdx(completedMatches.length);
  }

  // 과거 매치는 기본 읽기 전용. "편집" 버튼으로만 수정 모드 진입.
  const [pastEditMode, setPastEditMode] = useState(false);
  const [lastViewingIdx, setLastViewingIdx] = useState(viewingIdx);
  if (viewingIdx !== lastViewingIdx) {
    setLastViewingIdx(viewingIdx);
    setPastEditMode(false); // 다른 매치로 이동하면 편집 모드 해제
  }

  const isLive = viewingIdx >= completedMatches.length;
  const viewingPast = !isLive ? completedMatches[viewingIdx] : null;

  const courtCount2 = courtCount === 2;
  const courts = courtCount2 ? [0, 1] : [0];

  const courtHasMatch = (ci) => courtMatches[ci] && courtMatches[ci].home !== null && courtMatches[ci].away !== null;

  // 동시 라이브인 다른 코트의 mercs는 본 코트 base에서 제외 (한 선수가 두 코트 동시 출전 방지)
  const getLiveMatchId = (ci) => `F${completedMatches.length + ci + 1}_C${ci}`;
  const liveBatchMatchIds = courts.map(getLiveMatchId);
  const getMatchInfo = (ci) => {
    const cm = courtMatches[ci];
    if (!cm || cm.home === null || cm.away === null) return null;
    const matchId = getLiveMatchId(ci);
    const borrowedOut = new Set();
    liveBatchMatchIds.forEach(otherMid => {
      if (otherMid === matchId) return;
      const list = liveMercs?.[otherMid] || [];
      list.forEach(m => borrowedOut.add(m.player));
    });
    return {
      homeIdx: cm.home, awayIdx: cm.away,
      matchId,
      homeTeam: teamNames[cm.home], awayTeam: teamNames[cm.away],
      homeGk: gks[cm.home] || null, awayGk: gks[cm.away] || null,
      homeColor: TEAM_COLORS[teamColorIndices[cm.home]],
      awayColor: TEAM_COLORS[teamColorIndices[cm.away]],
      homePlayers: (teams[cm.home] || []).filter(p => !borrowedOut.has(p)),
      awayPlayers: (teams[cm.away] || []).filter(p => !borrowedOut.has(p)),
    };
  };

  const activeMatchInfo = getMatchInfo(activeCourtTab);

  const handleSetCourt = () => {
    if (selection.home === null || selection.away === null || selection.home === selection.away) return;
    setCourtMatches(prev => ({ ...prev, [settingCourt]: { home: selection.home, away: selection.away } }));
    setSelection({ home: null, away: null });
    setSettingCourt(null);
  };

  const handleConfirmRound = () => {
    const results = [];
    for (const ci of courts) {
      const mi = getMatchInfo(ci);
      if (!mi) continue;
      const evts = allEvents.filter(e => e.matchId === mi.matchId);
      const homeScore = calcMatchScore(evts, mi.matchId, mi.homeTeam);
      const awayScore = calcMatchScore(evts, mi.matchId, mi.awayTeam);
      results.push({ ...mi, homeScore, awayScore, court: courtCount2 ? (ci === 0 ? "A구장" : "B구장") : "", mercenaries: [] });
    }
    if (results.length === 0) { alert("진행 중인 경기가 없습니다"); return; }
    const msg = results.map(r => `${r.court ? r.court + ": " : ""}${r.homeTeam} ${r.homeScore}:${r.awayScore} ${r.awayTeam}`).join("\n");
    if (!confirm(msg + "\n\n경기결과를 확정하시겠습니까?")) return;
    // 두 코트 atomic finalize — 차출자 base 제외 처리가 한 번에 적용됨.
    if (results.length > 1 && onConfirmFreeRound) {
      onConfirmFreeRound(results);
    } else {
      results.forEach(r => onFinishMatch(r));
    }
    setCourtMatches({});
  };

  // 과거 매치 단건 보기 / 부분 수정
  if (!isLive && viewingPast) {
    const pm = viewingPast;
    const matchInfo = {
      homeIdx: pm.homeIdx, awayIdx: pm.awayIdx, matchId: pm.matchId,
      homeTeam: pm.homeTeam, awayTeam: pm.awayTeam,
      homeGk: pm.homeGk || null, awayGk: pm.awayGk || null,
      homeColor: TEAM_COLORS[teamColorIndices[pm.homeIdx]],
      awayColor: TEAM_COLORS[teamColorIndices[pm.awayIdx]],
      homePlayers: pm.homePlayers || teams[pm.homeIdx] || [],
      awayPlayers: pm.awayPlayers || teams[pm.awayIdx] || [],
    };
    const pastMercs = (pm.mercenaries || []).map(m => ({
      player: m.player,
      side: m.teamIdx === pm.homeIdx ? "home" : (m.teamIdx === pm.awayIdx ? "away" : null),
    })).filter(m => m.side);
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 6 }}>
          <button onClick={() => setViewingIdx(Math.max(0, viewingIdx - 1))} disabled={viewingIdx === 0}
            style={{ ...s.btnSm(C.grayDark), opacity: viewingIdx === 0 ? 0.3 : 1 }}>◀</button>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.white }}>
            {viewingIdx + 1}경기
            <span style={{ fontSize: 11, marginLeft: 6, color: pastEditMode ? C.orange : C.green, fontWeight: 600 }}>
              {pastEditMode ? "편집중" : "종료됨"}
            </span>
          </span>
          <button onClick={() => setViewingIdx(Math.min(completedMatches.length, viewingIdx + 1))}
            style={{ ...s.btnSm(C.grayDark) }}>▶</button>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          {pastEditMode ? (
            <button onClick={() => setPastEditMode(false)}
              style={{ ...s.btnSm(C.green, C.bg), fontSize: 11, fontWeight: 700 }}>
              ✓ 편집 완료
            </button>
          ) : (
            <button onClick={() => setPastEditMode(true)}
              style={{ ...s.btnSm(C.orange, C.bg), fontSize: 11, fontWeight: 700 }}>
              ✎ 편집
            </button>
          )}
        </div>
        <CourtRecorder
          key={`free_past_${viewingIdx}_${pastEditMode ? "edit" : "view"}`}
          matchInfo={matchInfo}
          homePlayers={matchInfo.homePlayers}
          awayPlayers={matchInfo.awayPlayers}
          allEvents={allEvents}
          onRecordEvent={onRecordEvent}
          onUndoEvent={onUndoEvent}
          onDeleteEvent={onDeleteEvent}
          onEditEvent={onEditEvent}
          onFinish={() => {}}
          onGkChange={(teamIdx, player) => {
            const side = teamIdx === pm.homeIdx ? 'home' : (teamIdx === pm.awayIdx ? 'away' : null);
            if (side) onEditPastGk?.(pm.matchId, side, player);
          }}
          styles={s}
          courtLabel={pm.court || ""}
          attendees={attendees}
          readOnly={!pastEditMode}
          mercs={pastMercs}
          onAddMerc={(player, side) => {
            const teamIdx = side === "home" ? pm.homeIdx : pm.awayIdx;
            onEditPastMercAdd?.(pm.matchId, teamIdx, player);
          }}
          onRemoveMerc={(player) => onEditPastMercRemove?.(pm.matchId, player)}
          absentees={{ [pm.matchId]: { [pm.homeIdx]: pm.homeAbsent || [], [pm.awayIdx]: pm.awayAbsent || [] } }}
        />
      </div>
    );
  }

  if (settingCourt !== null) {
    return (
      <div>
        <div style={{ fontSize: 13, color: C.gray, marginBottom: 8 }}>{courtCount2 ? (settingCourt === 0 ? "A구장" : "B구장") : ""} 대진 선택</div>
        <div style={s.card}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6, textAlign: "center" }}>홈팀</div>
              {teamNames.map((name, idx) => (
                <button key={idx} onClick={() => setSelection(prev => ({ ...prev, home: idx }))}
                  style={{ ...s.matchBtn(selection.home === idx ? TEAM_COLORS[teamColorIndices[idx]] : null), width: "100%", marginBottom: 4, opacity: selection.away === idx ? 0.3 : 1 }}>
                  {name}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", color: C.gray, fontSize: 18, fontWeight: 900 }}>VS</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6, textAlign: "center" }}>원정팀</div>
              {teamNames.map((name, idx) => (
                <button key={idx} onClick={() => setSelection(prev => ({ ...prev, away: idx }))}
                  style={{ ...s.matchBtn(selection.away === idx ? TEAM_COLORS[teamColorIndices[idx]] : null), width: "100%", marginBottom: 4, opacity: selection.home === idx ? 0.3 : 1 }}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => { setSettingCourt(null); setSelection({ home: null, away: null }); }} style={s.btn(C.grayDark)}>취소</button>
            <button onClick={handleSetCourt}
              disabled={selection.home === null || selection.away === null || selection.home === selection.away}
              style={{ ...s.btnFull(C.green), flex: 1, opacity: (selection.home !== null && selection.away !== null && selection.home !== selection.away) ? 1 : 0.4 }}>
              확인
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {completedMatches.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
          <button onClick={() => setViewingIdx(completedMatches.length - 1)}
            style={{ ...s.btnSm(C.grayDark), fontSize: 11 }}>◀ 과거 매치</button>
          <span style={{ fontSize: 12, color: C.orange, fontWeight: 600 }}>진행중 ({completedMatches.length}경기 종료)</span>
        </div>
      )}
      {courtCount2 && (
        <div style={s.tabRow}>
          {courts.map(ci => {
            const mi = getMatchInfo(ci);
            return (
              <button key={ci} onClick={() => setActiveCourtTab(ci)}
                style={{ ...s.tab(activeCourtTab === ci), fontSize: 11, padding: "8px 4px" }}>
                <div>{ci === 0 ? "A구장" : "B구장"}</div>
                {mi && <div style={{ fontSize: 10, marginTop: 2, opacity: 0.8 }}>{mi.homeTeam} vs {mi.awayTeam}</div>}
                {!mi && <div style={{ fontSize: 10, marginTop: 2, opacity: 0.5 }}>미설정</div>}
              </button>
            );
          })}
        </div>
      )}

      {!courtHasMatch(activeCourtTab) ? (
        <div style={{ textAlign: "center", padding: 30 }}>
          <div style={{ color: C.gray, marginBottom: 12 }}>{courtCount2 ? (activeCourtTab === 0 ? "A구장" : "B구장") : ""} 대진을 설정하세요</div>
          <button onClick={() => setSettingCourt(activeCourtTab)} style={s.btn(C.accent, C.bg)}>대진 설정</button>
        </div>
      ) : (
        <div>
          <CourtRecorder
            key={`free_${activeCourtTab}_${courtMatches[activeCourtTab]?.home}_${courtMatches[activeCourtTab]?.away}`}
            matchInfo={activeMatchInfo}
            homePlayers={activeMatchInfo.homePlayers}
            awayPlayers={activeMatchInfo.awayPlayers}
            allEvents={allEvents} onRecordEvent={onRecordEvent} onUndoEvent={onUndoEvent}
            onDeleteEvent={onDeleteEvent} onEditEvent={onEditEvent}
            onFinish={() => { }} onGkChange={onGkChange} styles={s}
            courtLabel={courtCount2 ? (activeCourtTab === 0 ? "A구장" : "B구장") : ""}
            attendees={attendees}
            mercs={(liveMercs?.[activeMatchInfo.matchId] || []).map(m => ({
              player: m.player,
              side: m.teamIdx === activeMatchInfo.homeIdx ? "home" : (m.teamIdx === activeMatchInfo.awayIdx ? "away" : null),
            })).filter(m => m.side)}
            onAddMerc={(player, side) => onAddLiveMerc?.(activeMatchInfo.matchId, side === "home" ? activeMatchInfo.homeIdx : activeMatchInfo.awayIdx, player)}
            onRemoveMerc={(player) => onRemoveLiveMerc?.(activeMatchInfo.matchId, player)}
            absentees={absentees}
            onToggleAbsent={onToggleAbsent}
          />
        </div>
      )}

      {courts.some(ci => courtHasMatch(ci)) && (
        <div style={{ marginTop: 12 }}>
          <button onClick={handleConfirmRound} style={{ ...s.btnFull(C.accent, C.bg) }}>경기 종료 확정</button>
        </div>
      )}
    </div>
  );
}
