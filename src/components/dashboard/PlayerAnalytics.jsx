import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import AppSync from '../../services/appSync';
import FirebaseSync from '../../services/firebaseSync';
import { fetchSheetData } from '../../services/sheetService';
import { getSettings, getEffectiveSettings } from '../../config/settings';
import { buildGameRecordsFromLogs } from '../../utils/gameRecordBuilder';
import { calcDefenseStats, calcWinContribution, calcWinStatsFromPointLog } from '../../utils/gameStateAnalyzer';
import { buildRoundRowsFromFutsal, buildRoundRowsFromSoccer } from '../../utils/matchRowBuilder';
import { recoverFinalizedStateFromSheets } from '../../utils/recoverFinalizedFromSheets';

import PlayerCardTab from './analytics/PlayerCardTab';
import HallOfFameTab from './analytics/HallOfFameTab';
import SynergyMatrixTab from './analytics/SynergyMatrixTab';
import GoldenTrioTab from './analytics/GoldenTrioTab';
import AwardsTab from './analytics/AwardsTab';
import CrovaGogumaRankTab from './analytics/CrovaGogumaRankTab';

export default function PlayerAnalytics({ teamName, teamMode, initialTab, isAdmin }) {
  const isSoccer = teamMode === "축구";
  const { C } = useTheme();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState(null);
  const [events, setEvents] = useState(null);
  const [playerLog, setPlayerLog] = useState(null);
  const [playerGameLogs, setPlayerGameLogs] = useState([]);
  const [matchLogs, setMatchLogs] = useState([]);
  const [gameRecords, setGameRecords] = useState([]);
  const [tab, setTab] = useState(initialTab || "playercard");
  const [fbMigrating, setFbMigrating] = useState(false);
  const [fbMigrateResult, setFbMigrateResult] = useState(null);
  const [recovering, setRecovering] = useState(false);
  const [recoverResult, setRecoverResult] = useState(null);

  async function runFirebasePhaseMigration() {
    if (!teamName) return;
    const sport = isSoccer ? '축구' : '풋살';
    const ok = window.confirm(
      `[관리자] Firebase stateJSON → 로그_매치 정확 덮어쓰기\n\nteam=${teamName} sport=${sport}\n\n최근 확정 세션들의 날짜에 해당하는 로그_매치 rows를 삭제한 뒤 정확한 rows로 재기록합니다. 계속하시겠습니까?`
    );
    if (!ok) return;
    setFbMigrating(true);
    setFbMigrateResult(null);
    try {
      const history = await FirebaseSync.loadFinalizedAll(teamName);
      const buildFn = sport === '축구' ? buildRoundRowsFromSoccer : buildRoundRowsFromFutsal;
      const datesTouched = new Set();
      const allRows = [];
      for (const h of history) {
        if (!h.stateJson) continue;
        let gs;
        try { gs = JSON.parse(h.stateJson); } catch { continue; }
        const rows = buildFn({ team: teamName, mode: '기본', tournamentId: '', date: h.gameDate, stateJSON: gs, inputTime: h.savedAt || '' });
        if (rows.length > 0) { datesTouched.add(h.gameDate); allRows.push(...rows); }
      }
      for (const date of datesTouched) {
        await AppSync.deleteMatchLogByDate({ sport, date });
      }
      const BATCH = 200;
      let total = 0;
      for (let i = 0; i < allRows.length; i += BATCH) {
        const res = await AppSync.writeMatchLog(allRows.slice(i, i + BATCH));
        total += (res && res.count) || 0;
      }
      setFbMigrateResult({ ok: true, dates: datesTouched.size, rows: total });
    } catch (err) {
      setFbMigrateResult({ ok: false, error: String(err?.message || err) });
    } finally {
      setFbMigrating(false);
    }
  }

  async function runRecoverFinalized() {
    if (!teamName) return;
    const date = window.prompt('복구할 경기 날짜 (YYYY-MM-DD)\n로그_매치/로그_이벤트/로그_선수경기 시트 데이터로 finalized state를 재구성합니다.');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      if (date) alert('YYYY-MM-DD 형식으로 입력하세요');
      return;
    }
    setRecovering(true);
    setRecoverResult(null);
    try {
      const settings = getEffectiveSettings(teamName, isSoccer ? '축구' : '풋살');
      const { gameId, state, summary } = await recoverFinalizedStateFromSheets({
        team: teamName,
        date,
        settingsSnapshot: settings,
      });
      const ok = window.confirm(
        `${date} 복구 미리보기\n\n` +
        `gameId: ${gameId}\n` +
        `매치: ${summary.matches}경기\n` +
        `이벤트: ${summary.events}건\n` +
        `선수경기 row: ${summary.players}명\n` +
        `참석자: ${summary.attendeesCount}명\n` +
        `팀: ${summary.teamNames.join(', ')}\n\n` +
        `Firebase finalized 에 저장하시겠습니까?\n(이미 동일 gameId가 있으면 덮어씀)`
      );
      if (!ok) { setRecoverResult({ ok: false, error: '취소됨' }); return; }
      await FirebaseSync.saveFinalized(teamName, gameId, state);
      setRecoverResult({ ok: true, gameId, ...summary });
    } catch (err) {
      setRecoverResult({ ok: false, error: String(err?.message || err) });
    } finally {
      setRecovering(false);
    }
  }

  useEffect(() => {
    const s = getSettings(teamName);
    const sport = isSoccer ? '축구' : '풋살';
    setLoading(true);
    Promise.all([
      AppSync.getPointLog(s.pointLogSheet).catch(() => []),
      AppSync.getPlayerLog(s.playerLogSheet).catch(() => []),
      fetchSheetData().catch(() => null),
      AppSync.getMatchLog({ sport }).catch(() => ({ rows: [] })),
      AppSync.getEventLog({ sport }).catch(() => ({ rows: [] })),
      AppSync.getPlayerGameLog({ sport }).catch(() => ({ rows: [] })),
    ]).then(([evts, plog, sheetData, matchRes, eventRes, pgRes]) => {
      setEvents(evts || []);
      setPlayerLog(plog || []);
      if (sheetData) setMembers(sheetData.players);
      const mRows = matchRes?.rows || [];
      const eRows = eventRes?.rows || [];
      setMatchLogs(mRows);
      setPlayerGameLogs(pgRes?.rows || []);
      setGameRecords(buildGameRecordsFromLogs(mRows, eRows));
    }).finally(() => setLoading(false));
  }, [teamName, isSoccer]);

  const settings = useMemo(() => getEffectiveSettings(teamName, isSoccer ? '축구' : '풋살'), [teamName, isSoccer]);
  const showCrovaGoguma = !isSoccer && settings?.useCrovaGoguma === true && teamName === '마스터FC';

  const defenseStats = useMemo(() => gameRecords.length > 0 ? calcDefenseStats(gameRecords) : {}, [gameRecords]);
  const winStats = useMemo(() => {
    if (gameRecords.length > 0) return calcWinContribution(gameRecords);
    if (isSoccer && events && events.length > 0) return calcWinStatsFromPointLog(events);
    return {};
  }, [gameRecords, isSoccer, events]);

  const tabs = [
    { key: "playercard", label: "선수카드" },
    { key: "halloffame", label: "명예의전당" },
    { key: "synergy", label: "시너지매트릭스" },
    { key: "trio", label: "케미" },
    { key: "awards", label: "어워드" },
    showCrovaGoguma && { key: "crovaguma", label: "🍀/🍠" },
  ].filter(Boolean);

  if (loading) return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>불러오는 중...</div>;

  return (
    <div>
      {isAdmin && (
        <details style={{ marginBottom: 12, padding: '6px 10px', border: `1px solid ${C.grayDarker}`, borderRadius: 6, background: `${C.grayDarker}22` }}>
          <summary style={{ fontSize: 11, color: C.gray, cursor: 'pointer', fontWeight: 600 }}>관리자 툴</summary>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              onClick={runFirebasePhaseMigration}
              disabled={fbMigrating}
              style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', cursor: fbMigrating ? 'not-allowed' : 'pointer', background: C.accent, color: C.bg, opacity: fbMigrating ? 0.6 : 1 }}
            >
              {fbMigrating ? '실행 중...' : 'Firebase → 로그_매치 정확 덮어쓰기'}
            </button>
            {fbMigrateResult && (
              <div style={{ fontSize: 10, color: fbMigrateResult.ok ? '#22c55e' : '#ef4444' }}>
                {fbMigrateResult.ok
                  ? `✓ ${fbMigrateResult.dates}개 날짜, ${fbMigrateResult.rows} rows 덮어쓰기 완료`
                  : `✗ 실패: ${fbMigrateResult.error}`}
              </div>
            )}
            <button
              onClick={runRecoverFinalized}
              disabled={recovering}
              style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', cursor: recovering ? 'not-allowed' : 'pointer', background: C.orange, color: C.bg, opacity: recovering ? 0.6 : 1 }}
            >
              {recovering ? '복구 중...' : '시트 → Firebase finalized 복구 (날짜 입력)'}
            </button>
            {recoverResult && (
              <div style={{ fontSize: 10, color: recoverResult.ok ? '#22c55e' : '#ef4444' }}>
                {recoverResult.ok
                  ? `✓ ${recoverResult.gameId} 복구 완료 (매치 ${recoverResult.matches} · 이벤트 ${recoverResult.events} · 선수 ${recoverResult.players})`
                  : `✗ 실패: ${recoverResult.error}`}
              </div>
            )}
          </div>
        </details>
      )}
      <div style={{ display: "flex", gap: 6, overflow: "auto", marginBottom: 14, paddingBottom: 4 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: "6px 12px", borderRadius: 50, fontSize: 11, fontWeight: 600,
              background: tab === t.key ? C.accent : "transparent",
              color: tab === t.key ? C.black : C.gray,
              border: `1px solid ${tab === t.key ? C.accent : C.grayDarker}`,
              whiteSpace: "nowrap", cursor: "pointer",
            }}>{t.label}</button>
        ))}
      </div>

      {tab === "playercard" && (
        <PlayerCardTab
          playerLog={playerLog || []} members={members}
          defenseStats={defenseStats} winStats={winStats} gameRecords={gameRecords}
          playerGameLogs={playerGameLogs} matchLogs={matchLogs} C={C}
        />
      )}
      {tab === "halloffame" && (
        <HallOfFameTab playerGameLogs={playerGameLogs} matchLogs={matchLogs} C={C} />
      )}
      {tab === "synergy" && <SynergyMatrixTab matchLogs={matchLogs} C={C} />}
      {tab === "trio" && <GoldenTrioTab matchLogs={matchLogs} C={C} />}
      {tab === "awards" && <AwardsTab playerGameLogs={playerGameLogs} C={C} />}
      {tab === "crovaguma" && showCrovaGoguma && (
        <CrovaGogumaRankTab members={members || []} C={C} />
      )}
    </div>
  );
}
