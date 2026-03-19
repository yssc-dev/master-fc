import { useState } from 'react';
import AppSync from '../../services/appSync';

const ls = {
  container: { background: "#0f172a", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif" },
  card: { background: "#1e293b", borderRadius: 16, padding: 28, width: "100%", maxWidth: 340 },
  title: { fontSize: 22, fontWeight: 800, color: "#f8fafc", textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 13, color: "#94a3b8", textAlign: "center", marginBottom: 24 },
  label: { fontSize: 12, color: "#94a3b8", marginBottom: 6, display: "block" },
  input: { background: "#334155", border: "1px solid #475569", borderRadius: 8, padding: "10px 14px", color: "#f8fafc", fontSize: 15, outline: "none", width: "100%", marginBottom: 14 },
  btn: { background: "#22d3ee", color: "#0f172a", border: "none", borderRadius: 8, padding: "12px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%", marginTop: 4 },
  error: { fontSize: 12, color: "#ef4444", textAlign: "center", marginBottom: 10 },
};

export default function LoginScreen({ onLogin }) {
  const [name, setName] = useState("");
  const [phone4, setPhone4] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleVerify = async () => {
    const trimName = name.trim();
    if (!trimName) { setError("이름을 입력하세요"); return; }
    if (!/^\d{4}$/.test(phone4)) { setError("휴대폰 뒷자리 4자리를 입력하세요"); return; }
    setError("");
    setLoading(true);
    try {
      const result = await AppSync.verifyAuth(trimName, phone4);
      if (result.success) {
        const teams = (result.teams && result.teams.length > 0)
          ? result.teams
          : [{ team: result.name || trimName, mode: "풋살", role: "멤버" }];
        onLogin({ name: trimName, phone4 }, teams);
      } else {
        setError(result.message || "이름 또는 번호가 일치하지 않습니다");
      }
    } catch (e) {
      setError("인증 서버 연결 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={ls.container}>
      <div style={ls.card}>
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>⚽</div>
        <div style={ls.title}>경기 기록</div>
        <div style={ls.subtitle}>로그인</div>
        <label style={ls.label}>이름</label>
        <input style={ls.input} placeholder="홍길동" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleVerify()} />
        <label style={ls.label}>휴대폰 뒷자리 (4자리)</label>
        <input style={ls.input} type="tel" inputMode="numeric" maxLength={4} placeholder="1234" value={phone4}
          onChange={e => setPhone4(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={e => e.key === "Enter" && handleVerify()} />
        {error && <div style={ls.error}>{error}</div>}
        <button style={{ ...ls.btn, opacity: loading ? 0.6 : 1 }} onClick={handleVerify} disabled={loading}>
          {loading ? "확인 중..." : "로그인"}
        </button>
      </div>
    </div>
  );
}
