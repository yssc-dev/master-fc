import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
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
  const [loading, setLoading] = useState(true);
  const [topPlayers, setTopPlayers] = useState({ goals: [], assists: [] });

  const loadSchedule = () => { AppSync.getTournamentSchedule(tournament.id, ourTeamName).then(m => setSchedule(m)).finally(() => setLoading(false)); };
  useEffect(() => {
    loadSchedule();
    AppSync.getTournamentRoster(tournament.id).then(p => setRoster(p));
  }, [tournament.id]);

  const attendees = roster.map(p => p.name);

  useEffect(() => {
    AppSync.getTournamentPlayerRecords(tournament.id).then(players => {
      setTopPlayers({
        goals: [...players].sort((a, b) => b.goals - a.goals).slice(0, 3).filter(p => p.goals > 0),
        assists: [...players].sort((a, b) => b.assists - a.assists).slice(0, 3).filter(p => p.assists > 0),
      });
    });
  }, [tournament.id, tab]);

  const handleUpdateScore = async (matchNum, homeScore, awayScore) => {
    await AppSync.updateTournamentMatchScore(tournament.id, matchNum, homeScore, awayScore);
    loadSchedule();
  };

  const handleUpdateMatch = async (matchNum, updates) => {
    await AppSync.updateTournamentMatch(tournament.id, matchNum, updates);
    loadSchedule();
  };

  // 팀 성적 카드 (우리팀)
  const teamRecord = useMemo(() => {
    const r = { games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, streak: 0, streakType: "" };
    const ourMatches = schedule.filter(m => m.isOurs && m.homeScore !== null && m.awayScore !== null);
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
    // 연승/연패 계산
    if (results.length > 0) {
      const last = results[results.length - 1];
      let count = 0;
      for (let i = results.length - 1; i >= 0; i--) {
        if (results[i] === last) count++; else break;
      }
      r.streak = count;
      r.streakType = last === "W" ? "연승" : last === "L" ? "연패" : "무승부";
    }
    return r;
  }, [schedule, ourTeamName]);

  // 다음 경기
  const nextMatch = useMemo(() => {
    return schedule.filter(m => m.isOurs).find(m => m.homeScore === null || m.awayScore === null);
  }, [schedule]);

  const tabStyle = (active) => ({
    flex: 1, padding: "10px 8px", textAlign: "center", fontSize: 13, fontWeight: 700,
    border: "none", cursor: "pointer", background: active ? C.card : "transparent",
    color: active ? C.white : C.gray, borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
  });

  if (loading) return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>불러오는 중...</div>;

  return (
    <div>
      <div style={{ padding: "0 16px 8px" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.white }}>{tournament.name}</div>
        <div style={{ fontSize: 11, color: C.gray }}>{tournament.startDate} ~ {tournament.endDate} · {tournament.teams.length}팀</div>
      </div>
      <div style={{ display: "flex", background: C.bg, borderBottom: `1px solid ${C.grayDarker}`, marginBottom: 12 }}>
        {[{ key: "dashboard", label: "대시보드" }, { key: "standings", label: "순위/기록" }, { key: "manage", label: "경기관리" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabStyle(tab === t.key)}>{t.label}</button>
        ))}
      </div>

      {/* 대시보드: 다음경기 → 팀성적 → 개인TOP */}
      {tab === "dashboard" && (
        <div style={{ padding: "0 16px" }}>
          {/* 1. 다음 경기 */}
          {nextMatch ? (
            <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 12, borderLeft: `3px solid ${C.accent}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: C.gray }}>다음 경기</div>
                <button onClick={() => setShowScheduleModal(true)} style={{ padding: "3px 8px", borderRadius: 6, border: "none", fontSize: 10, cursor: "pointer", background: C.grayDarker, color: C.grayLight }}>
                  전체 일정 →
                </button>
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

          {/* 2. 팀 성적 카드 */}
          {teamRecord.games > 0 && (
            <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>팀 성적</div>
              <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: C.white }}>{teamRecord.games}</div>
                  <div style={{ fontSize: 10, color: C.gray }}>경기</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: C.green }}>{teamRecord.wins}</div>
                  <div style={{ fontSize: 10, color: C.gray }}>승</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: C.gray }}>{teamRecord.draws}</div>
                  <div style={{ fontSize: 10, color: C.gray }}>무</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: C.red }}>{teamRecord.losses}</div>
                  <div style={{ fontSize: 10, color: C.gray }}>패</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: C.white }}>{teamRecord.gf}</div>
                  <div style={{ fontSize: 10, color: C.gray }}>득점</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: C.white }}>{teamRecord.ga}</div>
                  <div style={{ fontSize: 10, color: C.gray }}>실점</div>
                </div>
              </div>
              {teamRecord.streak >= 2 && (
                <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, fontWeight: 700, color: teamRecord.streakType === "연승" ? C.green : teamRecord.streakType === "연패" ? C.red : C.gray }}>
                  {teamRecord.streak}{teamRecord.streakType} 중
                </div>
              )}
            </div>
          )}

          {/* 3. 개인 TOP */}
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

      {/* 순위/기록: 팀순위(타팀 스코어 입력 가능) + 일정 + 개인기록 */}
      {tab === "standings" && (
        <div style={{ padding: "0 4px" }}>
          <TournamentStandings schedule={schedule} ourTeamName={ourTeamName} onUpdateScore={isAdmin ? handleUpdateScore : null} />
          <div style={{ marginTop: 16 }}>
            <TournamentPlayerRecords tournamentId={tournament.id} />
          </div>
        </div>
      )}

      {/* 경기관리 */}
      {tab === "manage" && (
        <TournamentMatchManager tournament={tournament} schedule={schedule || []} ourTeamName={ourTeamName}
          attendees={attendees || []} gameSettings={gameSettings} onScheduleUpdate={loadSchedule} />
      )}

      {/* 전체 일정 모달 */}
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
