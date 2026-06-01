import { useState } from 'react';
import { TEAM_COLORS } from '../../config/constants';
import { useTheme } from '../../hooks/useTheme';
import { calcMatchScore } from '../../utils/scoring';
import { BackIcon } from '../common/icons';
import CourtRecorder from './CourtRecorder';

export default function FreeMatchView({ teams, teamNames, teamColorIndices, gks, gksHistory, courtCount, allEvents, onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent, onFinishMatch, onConfirmFreeRound, completedMatches, attendees, onGkChange, liveMercs, onAddLiveMerc, onRemoveLiveMerc, onEditPastGk, onEditPastMercAdd, onEditPastMercRemove, onEditPastAbsent, absentees, onToggleAbsent, freeCourtMatches, onSetFreeCourtMatch, styles: s, isExtraRound, forcedPastIdx, onExitForcedPast, roundDisplayOffset = 0, totalRoundsForDisplay }) {
  const { C } = useTheme();
  // 수동 편성 대진은 reducer state(freeCourtMatches)에서 옴 — RTDB로 실시간 공유됨(예전엔 로컬 useState라 공유 안 됐던 버그).
  const courtMatches = freeCourtMatches || {};
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
    onSetFreeCourtMatch?.(settingCourt, selection.home, selection.away);
    setSelection({ home: null, away: null });
    setSettingCourt(null);
  };

  // 라이브 매치 대진(팀) 재선택 — 확정 전에 팀을 잘못 고른 경우. 기록된 이벤트가 있으면
  // 옛 팀에 묶인 골이 오귀속되므로 차단(먼저 삭제 요구). 없으면 기존 팀 선택 화면 재오픈.
  const handleChangeMatchup = (ci) => {
    const mid = getLiveMatchId(ci);
    const evCount = allEvents.filter(e => e.matchId === mid).length;
    if (evCount > 0) {
      alert(`이 코트에 기록된 골/이벤트 ${evCount}건이 있어 대진을 바꿀 수 없습니다.\n먼저 기록을 삭제한 뒤 변경해주세요.`);
      return;
    }
    const cur = courtMatches[ci];
    setSelection({ home: cur?.home ?? null, away: cur?.away ?? null });
    setSettingCourt(ci);
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
    // GK 필수 체크 — 대진표 모드의 handleConfirmScheduleRound와 동일 패턴
    for (const r of results) {
      if (!r.homeGk || !r.awayGk) {
        const courtPrefix = r.court ? r.court + ": " : "";
        alert(`${courtPrefix}키퍼를 지정하세요: ${!r.homeGk ? r.homeTeam : ""}${!r.homeGk && !r.awayGk ? ", " : ""}${!r.awayGk ? r.awayTeam : ""}`);
        return;
      }
    }
    const msg = results.map(r => `${r.court ? r.court + ": " : ""}${r.homeTeam} ${r.homeScore}:${r.awayScore} ${r.awayTeam}`).join("\n");
    if (!confirm(msg + "\n\n경기결과를 확정하시겠습니까?")) return;
    // 두 코트 atomic finalize — 차출자 base 제외 처리가 한 번에 적용됨.
    if (results.length > 1 && onConfirmFreeRound) {
      onConfirmFreeRound(results);
    } else {
      results.forEach(r => onFinishMatch(r));
    }
    // freeCourtMatches는 reducer가 확정 액션(FINISH_MATCH/CONFIRM_FREE_ROUND)에서 {}로 클리어함.
  };

  // 과거 매치 단건 보기 / 부분 수정
  if (!isLive && viewingPast) {
    const pm = viewingPast;

    // 같은 라운드 묶음 계산 — F는 각 매치가 1라운드, R은 같은 R{N}의 A/B를 하나로.
    const displayRounds = [];
    const rGroupIdx = new Map(); // roundN → displayRounds 내 인덱스
    completedMatches.forEach((m, i) => {
      const id = m?.matchId;
      if (!id) return;
      if (id.startsWith('F')) {
        displayRounds.push({ matches: [{ m, idx: i }], anchorIdx: i, type: 'F' });
      } else {
        const r = id.match(/^R(\d+)_C/);
        if (!r) return;
        const n = r[1];
        if (rGroupIdx.has(n)) {
          displayRounds[rGroupIdx.get(n)].matches.push({ m, idx: i });
        } else {
          rGroupIdx.set(n, displayRounds.length);
          displayRounds.push({ matches: [{ m, idx: i }], anchorIdx: i, type: 'R', roundN: parseInt(n, 10) });
        }
      }
    });
    const myDisplayIdx = displayRounds.findIndex(dr => dr.matches.some(x => x.idx === viewingIdx));
    const currentDr = displayRounds[myDisplayIdx] || displayRounds[0];

    const matchNavBtn = (disabled) => ({
      width: 36, height: 36, borderRadius: 999,
      background: "var(--app-bg-row)", border: "0.5px solid var(--app-divider)",
      color: "var(--app-text-primary)", cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.3 : 1, padding: 0, fontFamily: "inherit",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    });

    // forced 모드면 F 라운드만 이동.
    const fDisplayIndices = isForcedPast
      ? displayRounds.map((dr, idx) => dr.type === 'F' ? idx : -1).filter(i => i >= 0)
      : null;
    const fPos = fDisplayIndices ? fDisplayIndices.indexOf(myDisplayIdx) : -1;
    const canPrev = isForcedPast ? (fPos > 0) : (myDisplayIdx > 0);
    const canNext = isForcedPast ? true : (myDisplayIdx < displayRounds.length - 1 || (!isForcedPast && myDisplayIdx === displayRounds.length - 1));

    const goPrev = () => {
      if (isForcedPast && fDisplayIndices && fPos > 0) {
        setViewingIdx(displayRounds[fDisplayIndices[fPos - 1]].anchorIdx);
      } else if (!isForcedPast && myDisplayIdx > 0) {
        setViewingIdx(displayRounds[myDisplayIdx - 1].anchorIdx);
      }
    };
    const goNext = () => {
      if (isForcedPast && fDisplayIndices) {
        if (fPos < fDisplayIndices.length - 1) {
          setViewingIdx(displayRounds[fDisplayIndices[fPos + 1]].anchorIdx);
        } else {
          // 마지막 F → 스케줄로 복귀
          onExitForcedPast?.();
        }
      } else if (!isForcedPast) {
        if (myDisplayIdx < displayRounds.length - 1) {
          setViewingIdx(displayRounds[myDisplayIdx + 1].anchorIdx);
        } else {
          // 마지막 과거 → 라이브로
          setViewingIdx(completedMatches.length);
        }
      }
    };

    // 라운드 번호 계산
    const labelNumber = currentDr?.type === 'F'
      ? (() => {
          const fm = currentDr.matches[0].m?.matchId?.match?.(/^F(\d+)_C\d+$/);
          return fm ? parseInt(fm[1], 10) : (currentDr.matches[0].idx + 1);
        })()
      : (currentDr?.roundN || 0) + (roundDisplayOffset || 0);
    const denom = typeof totalRoundsForDisplay === 'number' ? totalRoundsForDisplay : displayRounds.length;
    const isMultiCourt = currentDr && currentDr.matches.length > 1;

    return (
      <div>
        {/* 매치 네비게이션 */}
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
              라운드 {labelNumber} <span style={{ color: "var(--app-text-tertiary)", fontWeight: 500 }}>/ {denom}</span>
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

        {/* 같은 라운드의 모든 매치 (단일 또는 A구장/B구장) 스택 렌더링 */}
        {currentDr?.matches.map((entry, ci) => {
          const cm = entry.m;
          const courtLabel = isMultiCourt
            ? (ci === 0 ? "A구장" : "B구장")
            : (cm.court || "");
          const matchInfo = {
            homeIdx: cm.homeIdx, awayIdx: cm.awayIdx, matchId: cm.matchId,
            homeTeam: cm.homeTeam, awayTeam: cm.awayTeam,
            homeGk: cm.homeGk || null, awayGk: cm.awayGk || null,
            homeColor: TEAM_COLORS[teamColorIndices[cm.homeIdx]],
            awayColor: TEAM_COLORS[teamColorIndices[cm.awayIdx]],
            homePlayers: cm.homePlayers || teams[cm.homeIdx] || [],
            awayPlayers: cm.awayPlayers || teams[cm.awayIdx] || [],
          };
          const courtMercs = (cm.mercenaries || []).map(mc => ({
            player: mc.player,
            side: mc.teamIdx === cm.homeIdx ? "home" : (mc.teamIdx === cm.awayIdx ? "away" : null),
          })).filter(mc => mc.side);
          const courtColorVar = ci === 0 ? "var(--app-blue)" : "var(--app-orange)";
          return (
            <div key={cm.matchId} style={{ marginBottom: 18 }}>
              {isMultiCourt && (
                <div style={{
                  fontSize: 12, fontWeight: 600, color: courtColorVar,
                  marginBottom: 8, marginLeft: 4,
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: courtColorVar }} />
                  {courtLabel}
                </div>
              )}
              <CourtRecorder
                key={`free_past_${entry.idx}_${pastEditMode ? "edit" : "view"}`}
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
                  const side = teamIdx === cm.homeIdx ? 'home' : (teamIdx === cm.awayIdx ? 'away' : null);
                  if (side) onEditPastGk?.(cm.matchId, side, player);
                }}
                styles={s}
                courtLabel={courtLabel}
                attendees={attendees}
                readOnly={!pastEditMode}
                mercs={courtMercs}
                onAddMerc={(player, side) => {
                  const teamIdx = side === "home" ? cm.homeIdx : cm.awayIdx;
                  onEditPastMercAdd?.(cm.matchId, teamIdx, player);
                }}
                onRemoveMerc={(player) => onEditPastMercRemove?.(cm.matchId, player)}
                absentees={{ [cm.matchId]: { [cm.homeIdx]: cm.homeAbsent || [], [cm.awayIdx]: cm.awayAbsent || [] } }}
                onToggleAbsent={onEditPastAbsent
                  ? ({ matchId, teamIdx, player }) => onEditPastAbsent({ matchId, teamIdx, player })
                  : undefined}
              />
            </div>
          );
        })}

        {/* 하단 고정 바 */}
        <div style={s.bottomBar}>
          {pastEditMode ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: C.orange, fontWeight: 700, padding: 10 }}>라운드 {labelNumber} 확정취소됨</span>
              <button onClick={() => setPastEditMode(false)}
                style={{ ...s.btnSm(C.green, C.bg), fontSize: 11 }}>라운드 확정</button>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: C.green, fontWeight: 700, padding: 10 }}>라운드 {labelNumber} 종료됨</span>
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
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
            <button onClick={() => handleChangeMatchup(activeCourtTab)}
              style={{ ...s.btnSm(C.grayDark), fontSize: 11 }}>대진 변경</button>
          </div>
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
