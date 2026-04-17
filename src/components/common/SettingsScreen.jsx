import { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import {
  getEffectiveSettings, SPORT_DEFAULTS, PRESETS,
  saveSettings, getSourceOf,
} from '../../config/settings';
import AppSync from '../../services/appSync';

export default function SettingsScreen({ teamName, teamMode, onBack }) {
  const isSoccer = teamMode === "축구";
  const { C } = useTheme();
  const sport = teamMode;
  const [settings, setSettings] = useState(() => getEffectiveSettings(teamName, sport));
  const [currentPreset, setCurrentPreset] = useState(() => settings._meta?.preset);
  const [saved, setSaved] = useState(false);
  const [sheetList, setSheetList] = useState([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [newOpponent, setNewOpponent] = useState("");

  useEffect(() => {
    setLoadingSheets(true);
    AppSync.getSheetList().then(list => setSheetList(list)).finally(() => setLoadingSheets(false));
  }, []);

  const update = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    await saveSettings(teamName, settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = async () => {
    if (!confirm("현재 설정을 초기 상태로 되돌리시겠습니까?")) return;
    // 팀 오버라이드 전체 제거는 Task 15/16에서 완성. 지금은 UI 재로드만.
    setSettings(getEffectiveSettings(teamName, sport));
    setSaved(true);
  };

  const handlePresetChange = (newPreset) => {
    setCurrentPreset(newPreset);
    setSaved(false);
  };

  const ss = {
    container: { background: C.bg, minHeight: "100vh", color: C.white, fontFamily: "'Pretendard', -apple-system, sans-serif", maxWidth: 500, margin: "0 auto" },
    header: { background: C.headerBg, padding: 16, textAlign: "center", position: "sticky", top: 0, zIndex: 100 },
    section: { padding: "0 16px", marginBottom: 20 },
    sectionTitle: { fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 10, paddingTop: 16, borderTop: `1px solid ${C.grayDarker}` },
    row: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8 },
    label: { fontSize: 12, color: C.gray, flex: 1 },
    select: {
      flex: 1, maxWidth: 200, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.grayDark}`,
      background: C.card, color: C.white, fontSize: 12, outline: "none", appearance: "auto",
    },
    input: {
      flex: 1, maxWidth: 200, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.grayDark}`,
      background: C.card, color: C.white, fontSize: 12, outline: "none", boxSizing: "border-box",
    },
    numInput: {
      width: 70, padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.grayDark}`,
      background: C.card, color: C.white, fontSize: 13, textAlign: "center", outline: "none",
    },
    hint: { fontSize: 10, color: C.grayDark },
    btn: (bg, color) => ({
      padding: "10px 16px", borderRadius: 8, border: "none", background: bg, color: color || C.white,
      fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%",
    }),
  };

  const SheetSelect = ({ value, onChange, label }) => (
    <div style={ss.row}>
      <span style={ss.label}>{label}</span>
      {sheetList.length > 0 ? (
        <select style={ss.select} value={value} onChange={e => onChange(e.target.value)}>
          {!sheetList.find(s => s.name === value) && <option value={value}>{value}</option>}
          {sheetList.map(s => <option key={s.gid} value={s.name}>{s.name}</option>)}
        </select>
      ) : (
        <input style={ss.input} value={value} onChange={e => onChange(e.target.value)}
          placeholder={loadingSheets ? "불러오는 중..." : "시트 이름 입력"} />
      )}
    </div>
  );

  const SourceBadge = ({ k }) => {
    const src = getSourceOf(teamName, sport, k);
    const config = {
      preset:   { color: "#5b9bff", label: "프리셋" },
      override: { color: "#ffb84d", label: "오버라이드" },
      shared:   { color: "#9c9c9c", label: "공용" },
      default:  { color: "#9c9c9c", label: "표준" },
    }[src] || { color: "#9c9c9c", label: "표준" };
    return (
      <span style={{ fontSize: 10, color: config.color, marginLeft: 6 }}>
        ●{config.label}
      </span>
    );
  };

  const NumRow = ({ label, value, onChange, defaultVal, suffix, settingKey }) => (
    <div style={ss.row}>
      <span style={{ ...ss.label, minWidth: 0 }}>
        {label}
        {settingKey && <SourceBadge k={settingKey} />}
      </span>
      <input type="number" style={ss.numInput} value={value} onChange={e => onChange(Number(e.target.value))} />
      <span style={{ ...ss.hint, width: 60, textAlign: "right", flexShrink: 0 }}>기본: {defaultVal}{suffix || ""}</span>
    </div>
  );

  return (
    <div style={ss.container}>
      <div style={ss.header}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>설정</div>
        <div style={{ fontSize: 12, color: C.headerTextDim, marginTop: 2 }}>{teamName}</div>
      </div>

      <div style={ss.section}>
        <div style={ss.sectionTitle}>구글시트 설정</div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 4 }}>구글시트 ID</div>
          <input style={{ ...ss.input, maxWidth: "100%", width: "100%" }} value={settings.sheetId}
            onChange={e => update("sheetId", e.target.value)} />
          <div style={ss.hint}>구글시트 URL에서 /d/ 뒤의 값</div>
        </div>

        <SheetSelect label="참석명단 시트" value={settings.attendanceSheet} onChange={v => update("attendanceSheet", v)} />
        <SheetSelect label="대시보드 시트" value={settings.dashboardSheet} onChange={v => update("dashboardSheet", v)} />
        <SheetSelect label="포인트로그 시트" value={settings.pointLogSheet} onChange={v => update("pointLogSheet", v)} />
        <SheetSelect label="선수별집계 시트" value={settings.playerLogSheet} onChange={v => update("playerLogSheet", v)} />
        {isSoccer && (
          <SheetSelect label="이벤트로그 시트" value={settings.eventLogSheet} onChange={v => update("eventLogSheet", v)} />
        )}
      </div>

      <div style={ss.section}>
        <div style={ss.sectionTitle}>경기규칙 설정</div>
        <div style={ss.row}>
          <span style={ss.label}>경기규칙 프리셋</span>
          <select
            style={ss.select}
            value={currentPreset || ""}
            onChange={e => handlePresetChange(e.target.value)}
          >
            {Object.keys(PRESETS[sport] || {}).map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div style={ss.hint}>
          {PRESETS[sport]?.[currentPreset]?.description || ""}
        </div>
        {isSoccer ? (
          <>
            <NumRow label="자책골 포인트" value={settings.ownGoalPoint} onChange={v => update("ownGoalPoint", v)} defaultVal={SPORT_DEFAULTS.축구.ownGoalPoint} settingKey="ownGoalPoint" />
            <NumRow label="클린시트 포인트" value={settings.cleanSheetPoint} onChange={v => update("cleanSheetPoint", v)} defaultVal={SPORT_DEFAULTS.축구.cleanSheetPoint} settingKey="cleanSheetPoint" />
          </>
        ) : (
          <>
            <div style={ss.row}>
              <label style={ss.label}>
                <input type="checkbox"
                  checked={!!settings.useCrovaGoguma}
                  onChange={e => update("useCrovaGoguma", e.target.checked)}
                  style={{ marginRight: 6 }} />
                크로바/고구마 사용<SourceBadge k="useCrovaGoguma" />
              </label>
              <span style={ss.hint}>표준: 꺼짐</span>
            </div>

            <NumRow label="자책골 포인트" value={settings.ownGoalPoint} onChange={v => update("ownGoalPoint", v)} defaultVal={SPORT_DEFAULTS.풋살.ownGoalPoint} settingKey="ownGoalPoint" />

            {settings.useCrovaGoguma && (
              <>
                <NumRow label="크로바(1위팀)" value={settings.crovaPoint} onChange={v => update("crovaPoint", v)} defaultVal={0} settingKey="crovaPoint" />
                <NumRow label="고구마(꼴찌팀)" value={settings.gogumaPoint} onChange={v => update("gogumaPoint", v)} defaultVal={0} settingKey="gogumaPoint" />
                <NumRow label="황금크로바/탄고구마" value={settings.bonusMultiplier} onChange={v => update("bonusMultiplier", v)} defaultVal={1} suffix="배" settingKey="bonusMultiplier" />
                <div style={{ fontSize: 10, color: C.grayDark, marginBottom: 8 }}>※ 크로바/고구마 점수는 2구장 경기에서만 적용됩니다.</div>
                <details style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>
                  <summary style={{ cursor: "pointer", padding: "6px 0" }}>황금크로바 / 탄고구마 설명</summary>
                  <div style={{ background: C.card, borderRadius: 8, padding: 10, marginTop: 4 }}>
                    시즌 누적 크로바 1위가 꼴등팀 소속 → 고구마 {settings.gogumaPoint} × {settings.bonusMultiplier} = {settings.gogumaPoint * settings.bonusMultiplier}<br/>
                    시즌 누적 고구마 1위가 1등팀 소속 → 크로바 {settings.crovaPoint} × {settings.bonusMultiplier} = {settings.crovaPoint * settings.bonusMultiplier}
                  </div>
                </details>
              </>
            )}
          </>
        )}
      </div>

      <div style={ss.section}>
        <div style={ss.sectionTitle}>상대팀 관리</div>
        {/* 상대팀 관리 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>등록된 상대팀</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
            {(settings.opponents || []).map(name => (
              <div key={name} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: C.cardLight, fontSize: 12, color: C.white }}>
                <span>{name}</span>
                <span onClick={() => {
                  const next = (settings.opponents || []).filter(n => n !== name);
                  update("opponents", next);
                }} style={{ fontSize: 10, color: C.red, cursor: "pointer", fontWeight: 700 }}>✕</span>
              </div>
            ))}
            {(settings.opponents || []).length === 0 && <span style={{ fontSize: 12, color: C.grayDark }}>없음</span>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input placeholder="새 상대팀 이름" value={newOpponent} onChange={e => setNewOpponent(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const name = newOpponent.trim();
                  if (name && !(settings.opponents || []).includes(name)) {
                    update("opponents", [...(settings.opponents || []), name]);
                    setNewOpponent("");
                  }
                }
              }}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, background: C.cardLight, color: C.white, border: `1px solid ${C.grayDark}` }} />
            <button onClick={() => {
              const name = newOpponent.trim();
              if (name && !(settings.opponents || []).includes(name)) {
                update("opponents", [...(settings.opponents || []), name]);
                setNewOpponent("");
              }
            }} style={{ padding: "8px 14px", borderRadius: 8, background: C.accent, color: C.bg, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>추가</button>
          </div>
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
