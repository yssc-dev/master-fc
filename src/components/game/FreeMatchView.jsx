import { useState } from 'react';
import { TEAM_COLORS } from '../../config/constants';
import { useTheme } from '../../hooks/useTheme';
import { calcMatchScore } from '../../utils/scoring';
import { BackIcon } from '../common/icons';
import CourtRecorder from './CourtRecorder';

export default function FreeMatchView({ teams, teamNames, teamColorIndices, gks, gksHistory, courtCount, allEvents, onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent, onFinishMatch, onConfirmFreeRound, completedMatches, attendees, onGkChange, liveMercs, onAddLiveMerc, onRemoveLiveMerc, onEditPastGk, onEditPastMercAdd, onEditPastMercRemove, absentees, onToggleAbsent, styles: s, isExtraRound, forcedPastIdx, onExitForcedPast }) {
  const { C } = useTheme();
  const [courtMatches, setCourtMatches] = useState({});
  const [activeCourtTab, setActiveCourtTab] = useState(0);
  const [settingCourt, setSettingCourt] = useState(null);
  const [selection, setSelection] = useState({ home: null, away: null });
  // 과거 매치 네비게이션. completedMatches.length = 라이브, 0~length-1 = 과거 매치 단건 보기
  // forcedPastIdx가 있으면 그 인덱스부터 시작(=다른 화면에서 자유 라운드 보기 진입한 경우)
  const isForcedPast = typeof forcedPastIdx === "number";
  const [viewingIdx, setViewingIdx] = useState(isForcedPast ? forcedPastIdx : completedMatches.length);

  const [lastMatchCount, setLastMatchCount] = useState(completedMatches.length);
  if (completedMatches.length !== lastMatchCount) {
    setLastMatchCount(completedMatches.length);
    // forced 모드면 라이브로 점프하지 않고 현재 보던 과거 매치 유지
    if (!isForcedPast) setViewingIdx(completedMatches.length);
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
    const matchNavBtn = (disabled) => ({
      width: 36, height: 36, borderRadius: 999,
      background: "var(--app-bg-row)", border: "0.5px solid var(--app-divider)",
      color: "var(--app-text-primary)", cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.3 : 1, padding: 0, fontFamily: "inherit",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    });
    // forced 모드(스케줄에서 자유 라운드로 점프)면 F-id 매치들 사이에서만 이동.
    // ◀ F1에서 더 이상 못 감. ▶ 마지막 F에서는 스케줄(R1)로 복귀(onExitForcedPast).
    const fMatchIndices = isForcedPast
      ? completedMatches.map((m, i) => m?.matchId?.startsWith?.('F') ? i : -1).filter(i => i >= 0)
      : null;
    const fPos = fMatchIndices ? fMatchIndices.indexOf(viewingIdx) : -1;
    const canPrev = isForcedPast ? (fPos > 0) : (viewingIdx > 0);
    // 일반 모드는 라이브 진입(viewingIdx === completedMatches.length) 금지 — 과거 매치 범위로 한정.
    const canNext = isForcedPast ? true : (viewingIdx < completedMatches.length);
    const goPrev = () => {
      if (isForcedPast && fMatchIndices && fPos > 0) {
        setViewingIdx(fMatchIndices[fPos - 1]);
      } else if (!isForcedPast) {
        setViewingIdx(Math.max(0, viewingIdx - 1));
      }
    };
    const goNext = () => {
      if (isForcedPast && fMatchIndices) {
        if (fPos < fMatchIndices.length - 1) {
          setViewingIdx(fMatchIndices[fPos + 1]);
        } else {
          // 마지막 F → 스케줄로 복귀
          onExitForcedPast?.();
        }
      } else if (!isForcedPast) {
        setViewingIdx(Math.min(completedMatches.length, viewingIdx + 1));
      }
    };
    return (
      <div>
        {/* forced 모드: 스케줄로 돌아가는 exit 버튼 */}
        {isForcedPast && (
          <div style={{ marginBottom: 8 }}>
            <button onClick={() => onExitForcedPast?.()}
              style={{
                background: "var(--app-bg-row)", border: "0.5px solid var(--app-divider)",
                color: "var(--app-text-primary)", padding: "6px 12px", borderRadius: 999,
                fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>
              ← 스케줄로 돌아가기
            </button>
          </div>
        )}
        {/* 매치 네비게이션 — ScheduleMatchView와 동일 패턴 */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 8, marginBottom: 14, padding: "4px 0",
        }}>
          <button onClick={goPrev}
            disabled={!canPrev} style={matchNavBtn(!canPrev)}>
            <BackIcon width={16} />
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 17, fontWeight: 600, color: "var(--app-text-primary)",
              letterSpacing: "-0.022em",
            }}>
              라운드 {viewingIdx + 1} <span style={{ color: "var(--app-text-tertiary)", fontWeight: 500 }}>/ {completedMatches.length}</span>
            </div>
            <div style={{
              fontSize: 11, fontWeight: 600, marginTop: 2,
              color: pastEditMode ? "var(--app-orange)" : "var(--app-green)",
            }}>
              {pastEditMode ? "확정취소됨" : "종료됨"}
            </div>
          </div>
          <button onClick={goNext}
            disabled={!canNext} style={matchNavBtn(!canNext)}>
            <BackIcon width={16} style={{ transform: "rotate(180deg)" }} />
          </button>
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
        {/* 하단 고정 바 — 대진표 모드의 라운드 종료/확정취소와 동일 패턴 */}
        <div style={s.bottomBar}>
          {pastEditMode ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: C.orange, fontWeight: 700, padding: 10 }}>라운드 {viewingIdx + 1} 확정취소됨</span>
              <button onClick={() => setPastEditMode(false)}
                style={{ ...s.btnSm(C.green, C.bg), fontSize: 11 }}>라운드 확정</button>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: C.green, fontWeight: 700, padding: 10 }}>라운드 {viewingIdx + 1} 종료됨</span>
              <button onClick={() => setPastEditMode(true)}
                style={{ ...s.btnSm(C.orange, C.bg), fontSize: 11 }}>확정취소</button>
            </div>
          )}
        </div>
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
