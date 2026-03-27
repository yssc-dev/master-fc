import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { getSettings, saveSettings, getDefaults } from '../../config/settings';

export default function SettingsScreen({ teamName, onBack }) {
  const { C } = useTheme();
  const [settings, setSettings] = useState(() => getSettings(teamName));
  const defaults = getDefaults();
  const [saved, setSaved] = useState(false);

  const update = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    saveSettings(teamName, settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (!confirm("모든 설정을 기본값으로 초기화하시겠습니까?")) return;
    setSettings({ ...defaults });
    saveSettings(teamName, defaults);
    setSaved(true);
  };

  const ss = {
    container: { background: C.bg, minHeight: "100vh", color: C.white, fontFamily: "'Pretendard', -apple-system, sans-serif", maxWidth: 500, margin: "0 auto" },
    header: { background: C.headerBg, padding: 16, textAlign: "center", position: "sticky", top: 0, zIndex: 100 },
    section: { padding: "0 16px", marginBottom: 20 },
    sectionTitle: { fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 10, paddingTop: 16, borderTop: `1px solid ${C.grayDarker}` },
    label: { fontSize: 12, color: C.gray, marginBottom: 4, display: "block" },
    input: {
      width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.grayDark}`,
      background: C.card, color: C.white, fontSize: 13, outline: "none", boxSizing: "border-box",
    },
    row: { marginBottom: 12 },
    numRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
    numInput: {
      width: 70, padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.grayDark}`,
      background: C.card, color: C.white, fontSize: 13, textAlign: "center", outline: "none",
    },
    hint: { fontSize: 10, color: C.grayDark, marginTop: 2 },
    btn: (bg, color) => ({
      padding: "10px 16px", borderRadius: 8, border: "none", background: bg, color: color || C.white,
      fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%",
    }),
  };

  return (
    <div style={ss.container}>
      <div style={ss.header}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>설정</div>
        <div style={{ fontSize: 12, color: C.headerTextDim, marginTop: 2 }}>{teamName}</div>
      </div>

      <div style={ss.section}>
        <div style={ss.sectionTitle}>구글시트 설정</div>

        <div style={ss.row}>
          <label style={ss.label}>구글시트 ID</label>
          <input style={ss.input} value={settings.sheetId} onChange={e => update("sheetId", e.target.value)} />
          <div style={ss.hint}>구글시트 URL에서 /d/ 뒤의 값</div>
        </div>

        <div style={ss.row}>
          <label style={ss.label}>참석명단 시트 GID</label>
          <input style={ss.input} value={settings.attendanceGid} onChange={e => update("attendanceGid", e.target.value)} />
          <div style={ss.hint}>시트 탭 URL의 gid= 값</div>
        </div>

        <div style={ss.row}>
          <label style={ss.label}>대시보드(선수별집계) 시트 GID</label>
          <input style={ss.input} value={settings.dashboardGid} onChange={e => update("dashboardGid", e.target.value)} />
        </div>

        <div style={ss.row}>
          <label style={ss.label}>포인트로그 저장 시트 이름</label>
          <input style={ss.input} value={settings.pointLogSheet} onChange={e => update("pointLogSheet", e.target.value)} />
          <div style={ss.hint}>Apps Script Code.js의 POINT_LOG_SHEET와 일치해야 함</div>
        </div>

        <div style={ss.row}>
          <label style={ss.label}>선수별집계 저장 시트 이름</label>
          <input style={ss.input} value={settings.playerLogSheet} onChange={e => update("playerLogSheet", e.target.value)} />
          <div style={ss.hint}>Apps Script Code.js의 PLAYER_LOG_SHEET와 일치해야 함</div>
        </div>
      </div>

      <div style={ss.section}>
        <div style={ss.sectionTitle}>경기규칙 설정</div>

        <div style={ss.numRow}>
          <label style={{ ...ss.label, flex: 1, marginBottom: 0 }}>자책골 포인트</label>
          <input type="number" style={ss.numInput} value={settings.ownGoalPoint}
            onChange={e => update("ownGoalPoint", Number(e.target.value))} />
          <span style={{ fontSize: 10, color: C.grayDark }}>기본: {defaults.ownGoalPoint}</span>
        </div>

        <div style={ss.numRow}>
          <label style={{ ...ss.label, flex: 1, marginBottom: 0 }}>크로바(1위팀) 포인트</label>
          <input type="number" style={ss.numInput} value={settings.crovaPoint}
            onChange={e => update("crovaPoint", Number(e.target.value))} />
          <span style={{ fontSize: 10, color: C.grayDark }}>기본: {defaults.crovaPoint}</span>
        </div>

        <div style={ss.numRow}>
          <label style={{ ...ss.label, flex: 1, marginBottom: 0 }}>고구마(꼴찌팀) 포인트</label>
          <input type="number" style={ss.numInput} value={settings.gogumaPoint}
            onChange={e => update("gogumaPoint", Number(e.target.value))} />
          <span style={{ fontSize: 10, color: C.grayDark }}>기본: {defaults.gogumaPoint}</span>
        </div>

        <div style={ss.numRow}>
          <label style={{ ...ss.label, flex: 1, marginBottom: 0 }}>황금크로바/탄고구마 배율</label>
          <input type="number" style={ss.numInput} value={settings.bonusMultiplier}
            onChange={e => update("bonusMultiplier", Number(e.target.value))} />
          <span style={{ fontSize: 10, color: C.grayDark }}>기본: {defaults.bonusMultiplier}배</span>
        </div>

        <div style={{ fontSize: 11, color: C.gray, background: C.card, borderRadius: 8, padding: 10, marginTop: 4 }}>
          시즌 누적 1위가 1위팀 소속 → 크로바 ×{settings.bonusMultiplier}<br/>
          시즌 누적 꼴찌가 꼴찌팀 소속 → 고구마 ×{settings.bonusMultiplier}
        </div>
      </div>

      <div style={{ padding: "0 16px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={handleSave} style={ss.btn(saved ? C.green : C.accent, C.bg)}>
          {saved ? "저장 완료" : "설정 저장"}
        </button>
        <button onClick={handleReset} style={ss.btn(C.grayDark, C.gray)}>기본값으로 초기화</button>
        <button onClick={onBack} style={ss.btn(C.grayDarker, C.white)}>돌아가기</button>
      </div>
    </div>
  );
}
