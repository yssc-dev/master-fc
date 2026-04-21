import { useState } from 'react';
import AppSync from '../../services/appSync';
import { useTheme } from '../../hooks/useTheme';
import { SunIcon, MoonIcon } from '../common/icons';

export default function LoginScreen({ onLogin }) {
  const { mode, toggle } = useTheme();
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
    <div style={{
      background: "var(--app-bg-grouped)", minHeight: "100vh",
      display: "flex", flexDirection: "column",
      padding: "60px 16px 40px",
      fontFamily: "var(--app-font-sans)", letterSpacing: "-0.014em",
      maxWidth: 500, margin: "0 auto", color: "var(--app-text-primary)",
    }}>
      <button onClick={toggle} style={{
        position: "fixed", top: 16, right: 16, zIndex: 10,
        background: "var(--app-bg-row)", border: "0.5px solid var(--app-divider)",
        borderRadius: 999, width: 36, height: 36,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: "var(--app-text-primary)", cursor: "pointer",
      }}>
        {mode === "dark" ? <SunIcon width={16} /> : <MoonIcon width={16} />}
      </button>

      <div style={{ padding: "32px 4px 40px" }}>
        <div style={{ fontSize: 13, color: "var(--app-blue)", fontWeight: 600, marginBottom: 8 }}>
          Master FC
        </div>
        <h1 style={{
          fontSize: 40, fontWeight: 700, letterSpacing: "-0.022em",
          lineHeight: 1.05, margin: 0, color: "var(--app-text-primary)",
        }}>
          모든 경기를<br/>정확하게.
        </h1>
        <p style={{ fontSize: 17, color: "var(--app-text-secondary)", marginTop: 16, maxWidth: 320, lineHeight: 1.4 }}>
          골·어시·실점을 정확히. 팀의 모든 기록은 여기서.
        </p>
      </div>

      <div className="app-grouped" style={{ marginBottom: 16 }}>
        <div className="app-row" style={{ padding: "10px 16px" }}>
          <label style={{ fontSize: 15, color: "var(--app-text-primary)", width: 90 }}>이름</label>
          <input className="app-input" style={{ flex: 1, background: "transparent", border: "none", padding: "6px 0" }}
            placeholder="홍길동" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleVerify()} />
        </div>
        <div className="app-row" style={{ padding: "10px 16px" }}>
          <label style={{ fontSize: 15, color: "var(--app-text-primary)", width: 90 }}>휴대폰 뒷자리</label>
          <input className="app-input" style={{ flex: 1, background: "transparent", border: "none", padding: "6px 0", fontVariantNumeric: "tabular-nums" }}
            type="tel" inputMode="numeric" maxLength={4} placeholder="1234" value={phone4}
            onChange={e => setPhone4(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={e => e.key === "Enter" && handleVerify()} />
        </div>
      </div>

      {error && (
        <div style={{
          fontSize: 13, color: "var(--app-red)",
          background: "rgba(255,59,48,0.1)", border: "0.5px solid rgba(255,59,48,0.3)",
          padding: "10px 14px", borderRadius: 10, marginBottom: 16,
        }}>{error}</div>
      )}

      <button onClick={handleVerify} disabled={loading} style={{
        width: "100%", padding: "14px 16px", borderRadius: 12,
        background: "var(--app-blue)", color: "#fff",
        border: "none", fontSize: 16, fontWeight: 600, cursor: "pointer",
        fontFamily: "inherit", letterSpacing: "-0.01em",
        opacity: loading ? 0.6 : 1,
      }}>
        {loading ? "확인 중..." : "로그인"}
      </button>
    </div>
  );
}
