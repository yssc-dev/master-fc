import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { ref, set, get } from 'firebase/database';
import { firebaseDb } from '../../config/firebase';
import AppSync from '../../services/appSync';
import TournamentStandings from './TournamentStandings';
import TournamentSchedule from './TournamentSchedule';
import TournamentPlayerRecords from './TournamentPlayerRecords';
import TournamentMatchManager from './TournamentMatchManager';

export default function TournamentDashboard({ tournament, ourTeamName, gameSettings, isAdmin, onBack, onGoHome }) {
  const { C } = useTheme();
  const [tab, setTab] = useState("dashboard");
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedule, setSchedule] = useState([]);
  const [roster, setRoster] = useState([]);
  const [playerRecords, setPlayerRecords] = useState([]);
  const [eventLog, setEventLog] = useState([]);
  const [loading, setLoading] = useState(true);

  const teamSafe = (ourTeamName || "").replace(/[.#$/[\]]/g, "_");
  const cachePath = `tournaments/${teamSafe}/${tournament.id}/cache`;

  // Firebase에서 캐시 로드 → 구글시트에서 동기화
  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Firebase 캐시에서 먼저 로드 (즉시 표시)
      const cacheSnap = await get(ref(firebaseDb, cachePath));
      if (cacheSnap.exists()) {
        const cached = cacheSnap.val();
        if (cached.schedule) setSchedule(JSON.parse(cached.schedule));
        if (cached.roster) setRoster(JSON.parse(cached.roster));
        if (cached.playerRecords) setPlayerRecords(JSON.parse(cached.playerRecords));
        if (cached.eventLog) setEventLog(JSON.parse(cached.eventLog));
        setLoading(false);
      }

      // 2. 구글시트에서 최신 데이터 가져오기 (백그라운드)
      const [sched, rost, players, events] = await Promise.all([
        AppSync.getTournamentSchedule(tournament.id, ourTeamName),
        AppSync.getTournamentRoster(tournament.id),
        AppSync.getTournamentPlayerRecords(tournament.id),
        AppSync.getTournamentEventLog(tournament.id),
      ]);

      setSchedule(sched || []);
      setRoster(rost || []);
      setPlayerRecords(players || []);
      setEventLog(events || []);

      // 3. Firebase 캐시 업데이트
      await set(ref(firebaseDb, cachePath), {
        schedule: JSON.stringify(sched || []),
        roster: JSON.stringify(rost || []),
        playerRecords: JSON.stringify(players || []),
        eventLog: JSON.stringify(events || []),
        updatedAt: Date.now(),
      }).catch(() => {});
    } catch (e) {
      console.warn("대회 데이터 로드 실패:", e.message);
    } finally {
      setLoading(false);
    }
  }, [tournament.id, ourTeamName, cachePath]);

  useEffect(() => { loadAllData(); }, [loadAllData]);

  // 데이터 변경 후 리로드 (경기 종료, 스코어 입력 등)
  const refreshData = useCallback(() => { loadAllData(); }, [loadAllData]);

  const attendees = roster.map(p => p.name);

  const handleUpdateScore = async (matchNum, homeScore, awayScore) => {
    await AppSync.updateTournamentMatchScore(tournament.id, matchNum, homeScore, awayScore);
    refreshData();
  };

  const handleUpdateMatch = async (matchNum, updates) => {
    await AppSync.updateTournamentMatch(tournament.id, matchNum, updates);
    refreshData();
  };

  // 팀 성적 카드
  const teamRecord = useMemo(() => {
    const r = { games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, streak: 0, streakType: "" };
    const ourMatches = (schedule || []).filter(m => m.isOurs && m.homeScore !== null && m.awayScore !== null);
    const results = [];
    for (const m of ourMatches) {
      const isHome = m.home === ourTeamName;
      const ourGoals = isHome ? m.homeScore : m.awayScore;
      const theirGoals = isHome ? m.awayScore : m.homeScore;
      r.games++; r.gf += ourGoals; r.ga += theirGoals;
      if (ourGoals > theirGoals) { r.wins++; results.push("W"); }
      else if (ourGoals < theirGoals) { r.losses++; results.push("L"); }
      else { r.draws++; results.push("D"); }
    }
    if (results.length > 0) {
      const last = results[results.length - 1];
      let count = 0;
      for (let i = results.length - 1; i >= 0; i--) { if (results[i] === last) count++; else break; }
      r.streak = count;
      r.streakType = last === "W" ? "연승" : last === "L" ? "연패" : "무승부";
    }
    return r;
  }, [schedule, ourTeamName]);

  const nextMatch = useMemo(() => {
    return (schedule || []).filter(m => m.isOurs).find(m => m.homeScore === null || m.awayScore === null);
  }, [schedule]);

  const topPlayers = useMemo(() => {
    const p = playerRecords || [];
    return {
      goals: [...p].sort((a, b) => b.goals - a.goals).slice(0, 3).filter(x => x.goals > 0),
      assists: [...p].sort((a, b) => b.assists - a.assists).slice(0, 3).filter(x => x.assists > 0),
    };
  }, [playerRecords]);

  const tabStyle = (active) => ({
    flex: 1, padding: "10px 8px", textAlign: "center", fontSize: 13, fontWeight: 700,
    border: "none", cursor: "pointer", background: active ? C.card : "transparent",
    color: active ? C.white : C.gray, borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
  });

  if (loading) return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>불러오는 중...</div>;

  return (
    <div>
      <div style={{ padding: "0 16px 4px" }}>
        <div style={{ fontSize: 11, color: C.gray }}>{tournament.startDate} ~ {tournament.endDate} · {tournament.teams.length}팀</div>
      </div>
      <div style={{ display: "flex", background: C.bg, borderBottom: `1px solid ${C.grayDarker}`, marginBottom: 12 }}>
        {[{ key: "dashboard", label: "대시보드" }, { key: "standings", label: "순위/기록" }, { key: "manage", label: "경기관리" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabStyle(tab === t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === "dashboard" && (
        <div style={{ padding: "0 16px" }}>
          {nextMatch ? (
            <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 12, borderLeft: `3px solid ${C.accent}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: C.gray }}>다음 경기</div>
                <button onClick={() => setShowScheduleModal(true)} style={{ padding: "3px 8px", borderRadius: 6, border: "none", fontSize: 10, cursor: "pointer", background: C.grayDarker, color: C.grayLight }}>전체 일정 →</button>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.white }}>vs {nextMatch.home === ourTeamName ? nextMatch.away : nextMatch.home}</div>
                  <div style={{ fontSize: 12, color: C.grayLight, marginTop: 2 }}>{nextMatch.date || "날짜 미정"}</div>
                </div>
                <div style={{ fontSize: 11, color: C.grayDark }}>#{nextMatch.matchNum}</div>
              </div>
            </div>
          ) : (
            <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 12, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: C.gray }}>모든 경기가 완료되었습니다</div>
            </div>
          )}
          {teamRecord.games > 0 && (
            <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>팀 성적</div>
              <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
                <div><div style={{ fontSize: 22, fontWeight: 900, color: C.white }}>{teamRecord.games}</div><div style={{ fontSize: 10, color: C.gray }}>경기</div></div>
                <div><div style={{ fontSize: 22, fontWeight: 900, color: C.green }}>{teamRecord.wins}</div><div style={{ fontSize: 10, color: C.gray }}>승</div></div>
                <div><div style={{ fontSize: 22, fontWeight: 900, color: C.gray }}>{teamRecord.draws}</div><div style={{ fontSize: 10, color: C.gray }}>무</div></div>
                <div><div style={{ fontSize: 22, fontWeight: 900, color: C.red }}>{teamRecord.losses}</div><div style={{ fontSize: 10, color: C.gray }}>패</div></div>
                <div><div style={{ fontSize: 22, fontWeight: 900, color: C.white }}>{teamRecord.gf}</div><div style={{ fontSize: 10, color: C.gray }}>득점</div></div>
                <div><div style={{ fontSize: 22, fontWeight: 900, color: C.white }}>{teamRecord.ga}</div><div style={{ fontSize: 10, color: C.gray }}>실점</div></div>
              </div>
              {teamRecord.streak >= 2 && (
                <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, fontWeight: 700, color: teamRecord.streakType === "연승" ? C.green : teamRecord.streakType === "연패" ? C.red : C.gray }}>
                  {teamRecord.streak}{teamRecord.streakType} 중
                </div>
              )}
            </div>
          )}
          {(topPlayers.goals.length > 0 || topPlayers.assists.length > 0) && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {topPlayers.goals.length > 0 && (
                <div style={{ flex: 1, background: C.cardLight, borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 10, color: C.gray, marginBottom: 4 }}>득점왕</div>
                  {topPlayers.goals.map((p, i) => <div key={p.name} style={{ fontSize: 12, color: C.white, fontWeight: i === 0 ? 700 : 400 }}>{p.name} {p.goals}골</div>)}
                </div>
              )}
              {topPlayers.assists.length > 0 && (
                <div style={{ flex: 1, background: C.cardLight, borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 10, color: C.gray, marginBottom: 4 }}>어시왕</div>
                  {topPlayers.assists.map((p, i) => <div key={p.name} style={{ fontSize: 12, color: C.white, fontWeight: i === 0 ? 700 : 400 }}>{p.name} {p.assists}어시</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "standings" && (
        <div style={{ padding: "0 4px" }}>
          <TournamentStandings schedule={schedule} ourTeamName={ourTeamName} />
          <div style={{ marginTop: 16 }}>
            <TournamentPlayerRecords tournamentId={tournament.id} playerRecords={playerRecords} eventLog={eventLog} />
          </div>
        </div>
      )}

      {tab === "manage" && (
        <TournamentMatchManager tournament={tournament} schedule={schedule || []} ourTeamName={ourTeamName}
          attendees={attendees || []} gameSettings={gameSettings} onScheduleUpdate={refreshData} />
      )}

      {showScheduleModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowScheduleModal(false)}>
          <div style={{ background: C.card, borderRadius: 16, padding: 20, maxWidth: 420, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.white }}>전체 일정</div>
              <button onClick={() => setShowScheduleModal(false)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", fontSize: 12, cursor: "pointer", background: C.grayDarker, color: C.grayLight }}>닫기</button>
            </div>
            <TournamentSchedule schedule={schedule} ourTeamName={ourTeamName} teams={tournament.teams} onUpdateScore={handleUpdateScore} onUpdateMatch={handleUpdateMatch} isAdmin={isAdmin} defaultDate={tournament.startDate} forceShowAll />
          </div>
        </div>
      )}
    </div>
  );
}
