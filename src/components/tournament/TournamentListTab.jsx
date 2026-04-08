import { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import AppSync from '../../services/appSync';
import CreateTournament from './CreateTournament';
import TournamentDashboard from './TournamentDashboard';

export default function TournamentListTab({ teamName, ourTeamName, isAdmin, attendees, gameSettings }) {
  const { C } = useTheme();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);

  const loadList = () => { setLoading(true); AppSync.getTournamentList().then(list => setTournaments(list)).finally(() => setLoading(false)); };
  useEffect(() => { loadList(); }, []);

  const handleCreate = async (data) => {
    const result = await AppSync.createTournament(data);
    if (result?.success) { setCreating(false); loadList(); }
    else { alert("대회 생성 실패: " + (result?.error || "알 수 없는 오류")); }
  };

  if (selectedTournament) {
    return <TournamentDashboard tournament={selectedTournament} ourTeamName={ourTeamName} attendees={attendees} gameSettings={gameSettings}
      onBack={() => { setSelectedTournament(null); loadList(); }} />;
  }

  if (creating) {
    return <div style={{ padding: "0 16px" }}><CreateTournament ourTeamName={ourTeamName} onSubmit={handleCreate} onCancel={() => setCreating(false)} /></div>;
  }

  const active = tournaments.filter(t => t.status === "active");
  const finished = tournaments.filter(t => t.status === "finished");

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>대회</div>
        {isAdmin && <button onClick={() => setCreating(true)} style={{ padding: "6px 14px", borderRadius: 8, background: C.accent, color: C.bg, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ 새 대회</button>}
      </div>
      {loading ? <div style={{ textAlign: "center", padding: 20, color: C.gray }}>불러오는 중...</div>
      : tournaments.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: C.gray }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🏆</div>
          <div style={{ fontSize: 13 }}>등록된 대회가 없습니다</div>
          {isAdmin && <div style={{ fontSize: 11, marginTop: 4 }}>"+ 새 대회" 버튼으로 대회를 만들어보세요</div>}
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: C.gray, fontWeight: 600, marginBottom: 6 }}>진행중</div>
              {active.map(t => (
                <div key={t.id} onClick={() => setSelectedTournament(t)} style={{ padding: "12px 14px", background: C.card, borderRadius: 10, marginBottom: 6, cursor: "pointer", borderLeft: `3px solid ${C.green}` }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{t.startDate} ~ {t.endDate} · {t.teams.length}팀 · {t.format}</div>
                </div>
              ))}
            </div>
          )}
          {finished.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: C.gray, fontWeight: 600, marginBottom: 6 }}>완료</div>
              {finished.map(t => (
                <div key={t.id} onClick={() => setSelectedTournament(t)} style={{ padding: "12px 14px", background: C.cardLight, borderRadius: 10, marginBottom: 6, cursor: "pointer", opacity: 0.7 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.grayLight }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: C.grayDark, marginTop: 2 }}>{t.startDate} ~ {t.endDate}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
