import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { generateFullLeague, generateKnockout, generateManual } from '../../utils/tournamentBrackets';

export default function CreateTournament({ ourTeamName, onSubmit, onCancel }) {
  const { C } = useTheme();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [format, setFormat] = useState("fullLeague");
  const [teamInput, setTeamInput] = useState("");
  const [teams, setTeams] = useState([ourTeamName]);
  const [matchCount, setMatchCount] = useState(6);

  const addTeam = () => {
    const t = teamInput.trim();
    if (t && !teams.includes(t)) { setTeams(prev => [...prev, t]); setTeamInput(""); }
  };
  const removeTeam = (t) => { if (t === ourTeamName) return; setTeams(prev => prev.filter(x => x !== t)); };

  const handleSubmit = () => {
    if (!name.trim()) { alert("대회명을 입력하세요."); return; }
    if (teams.length < 2) { alert("참가팀이 2팀 이상이어야 합니다."); return; }
    let matches = [];
    if (format === "fullLeague") matches = generateFullLeague(teams);
    else if (format === "knockout") matches = generateKnockout(teams);
    else matches = generateManual(matchCount);
    onSubmit({ id: "t_" + Date.now(), name: name.trim(), startDate, endDate, teams, format, matches, ourTeam: ourTeamName });
  };

  const is = {
    input: { padding: "8px 12px", borderRadius: 8, fontSize: 14, background: C.cardLight, color: C.white, border: `1px solid ${C.grayDark}`, width: "100%", boxSizing: "border-box" },
    label: { fontSize: 12, color: C.gray, marginBottom: 4, display: "block" },
    section: { marginBottom: 14 },
  };

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.white, marginBottom: 16 }}>새 대회 만들기</div>
      <div style={is.section}>
        <label style={is.label}>대회명</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="2026 여름 챔피언스컵" style={is.input} />
      </div>
      <div style={{ display: "flex", gap: 8, ...is.section }}>
        <div style={{ flex: 1 }}><label style={is.label}>시작일</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={is.input} /></div>
        <div style={{ flex: 1 }}><label style={is.label}>종료일</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={is.input} /></div>
      </div>
      <div style={is.section}>
        <label style={is.label}>참가팀 ({teams.length}팀)</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {teams.map(t => (
            <div key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: t === ourTeamName ? `${C.accent}22` : C.cardLight, fontSize: 12, color: t === ourTeamName ? C.accent : C.white, border: t === ourTeamName ? `1px solid ${C.accent}` : "none" }}>
              <span>{t}</span>
              {t !== ourTeamName && <span onClick={() => removeTeam(t)} style={{ fontSize: 10, color: C.red, cursor: "pointer", fontWeight: 700 }}>✕</span>}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={teamInput} onChange={e => setTeamInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addTeam()} placeholder="상대팀 이름" style={{ ...is.input, flex: 1 }} />
          <button onClick={addTeam} style={{ padding: "8px 14px", borderRadius: 8, background: C.accent, color: C.bg, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>추가</button>
        </div>
      </div>
      <div style={is.section}>
        <label style={is.label}>대진 형태</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[{ key: "fullLeague", label: "풀리그" }, { key: "knockout", label: "녹아웃" }, { key: "manual", label: "자유(수동)" }].map(f => (
            <button key={f.key} onClick={() => setFormat(f.key)}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: format === f.key ? C.accent : C.grayDark, color: format === f.key ? C.bg : C.white }}>{f.label}</button>
          ))}
        </div>
        {format === "manual" && <div style={{ marginTop: 8 }}><label style={is.label}>경기 수</label><input type="number" value={matchCount} onChange={e => setMatchCount(Number(e.target.value) || 1)} min={1} style={{ ...is.input, width: 80 }} /></div>}
        {format === "fullLeague" && teams.length >= 2 && <div style={{ marginTop: 6, fontSize: 11, color: C.gray }}>{teams.length}팀 풀리그 = {teams.length * (teams.length - 1) / 2}경기</div>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", background: C.grayDark, color: C.grayLight }}>취소</button>
        <button onClick={handleSubmit} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", background: C.accent, color: C.bg }}>대회 생성</button>
      </div>
    </div>
  );
}
