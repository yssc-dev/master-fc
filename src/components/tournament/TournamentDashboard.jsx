import { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import AppSync from '../../services/appSync';
import TournamentStandings from './TournamentStandings';
import TournamentSchedule from './TournamentSchedule';
import TournamentPlayerRecords from './TournamentPlayerRecords';
import TournamentMatchManager from './TournamentMatchManager';

export default function TournamentDashboard({ tournament, ourTeamName, gameSettings, isAdmin, onBack }) {
  const { C } = useTheme();
  const [tab, setTab] = useState("dashboard");
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

  const tabStyle = (active) => ({
    flex: 1, padding: "10px 8px", textAlign: "center", fontSize: 13, fontWeight: 700,
    border: "none", cursor: "pointer", background: active ? C.card : "transparent",
    color: active ? C.white : C.gray, borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
  });

  if (loading) return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>불러오는 중...</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button onClick={onBack} style={{ padding: "6px 12px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>← 대회 목록</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.white }}>{tournament.name}</div>
          <div style={{ fontSize: 11, color: C.gray }}>{tournament.startDate} ~ {tournament.endDate} · {tournament.teams.length}팀</div>
        </div>
      </div>
      <div style={{ display: "flex", background: C.bg, borderBottom: `1px solid ${C.grayDarker}`, marginBottom: 12 }}>
        {[{ key: "dashboard", label: "대시보드" }, { key: "players", label: "개인기록" }, { key: "manage", label: "경기관리" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabStyle(tab === t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === "dashboard" && (
        <div style={{ padding: "0 4px" }}>
          <TournamentStandings schedule={schedule} ourTeamName={ourTeamName} />
          <div style={{ marginTop: 16 }}><TournamentSchedule schedule={schedule} ourTeamName={ourTeamName} teams={tournament.teams} onUpdateScore={handleUpdateScore} onUpdateMatch={handleUpdateMatch} isAdmin={false} defaultDate={tournament.startDate} /></div>
          {(topPlayers.goals.length > 0 || topPlayers.assists.length > 0) && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 8 }}>개인 TOP</div>
              <div style={{ display: "flex", gap: 8 }}>
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
            </div>
          )}
        </div>
      )}
      {tab === "players" && <TournamentPlayerRecords tournamentId={tournament.id} />}
      {tab === "manage" && (
        <TournamentMatchManager tournament={tournament} schedule={schedule} ourTeamName={ourTeamName}
          attendees={attendees} gameSettings={gameSettings} onScheduleUpdate={loadSchedule} />
      )}
    </div>
  );
}
