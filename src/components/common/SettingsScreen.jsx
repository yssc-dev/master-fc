import { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import {
  getEffectiveSettings, SPORT_DEFAULTS, PRESETS,
  saveSettings, getSourceOf, loadSettingsFromFirebase,
} from '../../config/settings';
import AppSync from '../../services/appSync';

export default function SettingsScreen({ teamName, teamMode, teamEntries, onBack }) {
  const isSoccer = teamMode === "축구";
  const { C } = useTheme();
  const sport = teamMode;
  const [settings, setSettings] = useState(() => getEffectiveSettings(teamName, sport));
  const [currentPreset, setCurrentPreset] = useState(() => settings._meta?.preset);
  const [saved, setSaved] = useState(false);
  const [sheetList, setSheetList] = useState([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [newOpponent, setNewOpponent] = useState("");
  const [presetChangeDialog, setPresetChangeDialog] = useState(null);
  // null | { newPreset, diffs: [{key, from, to}], overrides: {k:v} }

  useEffect(() => {
    setLoadingSheets(true);
    AppSync.getSheetList().then(list => setSheetList(list)).finally(() => setLoadingSheets(false));
  }, []);

  // Firebase async load가 Root의 fire-and-forget보다 늦으면 초기 state가 fallback(defaults)으로 고정됨.
  // 마운트 시 다시 await해서 cache 확정 후 state 재동기화. 사용자가 편집 시작한 경우(_meta.preset 이미 있음)는 덮지 않음.
  useEffect(() => {
    if (settings._meta?.preset) return;
    let cancelled = false;
    loadSettingsFromFirebase(teamName, teamEntries || [{ mode: sport }]).then(() => {
      if (cancelled) return;
      const fresh = getEffectiveSettings(teamName, sport);
      setSettings(fresh);
      setCurrentPreset(fresh._meta?.preset);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만
  }, []);

  // "기본:" 라벨은 현재 프리셋의 기본값을 반영 (프리셋에 없으면 sport default로 폴백)
  const getDefaultFor = (key) => {
    const presetVal = PRESETS[sport]?.[currentPreset]?.values?.[key];
    return presetVal !== undefined ? presetVal : SPORT_DEFAULTS[sport]?.[key];
  };

  const update = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    await saveSettings(teamName, sport, settings, currentPreset);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = async () => {
    if (!confirm("이 종목 설정을 프리셋 기본값으로 초기화하시겠습니까?")) return;
    const sportDef = SPORT_DEFAULTS[sport] || {};
    const presetValues = PRESETS[sport]?.[currentPreset]?.values || {};
    const resetSettings = {
      ...settings,  // shared 보존
      ...sportDef,
      ...presetValues,
    };
    setSettings(resetSettings);
    await saveSettings(teamName, sport, resetSettings, currentPreset);
    setSaved(true);
  };

  const handlePresetChange = (newPreset) => {
    if (newPreset === currentPreset) return;
    const newPresetValues = PRESETS[sport]?.[newPreset]?.values || {};
    const oldPresetValues = PRESETS[sport]?.[currentPreset]?.values || {};
    const sportDef = SPORT_DEFAULTS[sport] || {};

    const before = { ...sportDef, ...oldPresetValues };
    const after = { ...sportDef, ...newPresetValues };
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const diffs = [];
    for (const k of keys) {
      if (before[k] !== after[k]) diffs.push({ key: k, from: before[k], to: after[k] });
    }

    // 현재 오버라이드 추출 (지금 settings와 preset+defaults 비교)
    const combined = { ...sportDef, ...oldPresetValues };
    const overrides = {};
    for (const k of Object.keys(settings)) {
      if (k === "_meta" || k.startsWith("_")) continue;
      if (SPORT_DEFAULTS[sport] && !(k in SPORT_DEFAULTS[sport]) && !(k in oldPresetValues)) continue;
      if (settings[k] !== combined[k]) overrides[k] = settings[k];
    }

    setPresetChangeDialog({ newPreset, diffs, overrides });
  };

  const applyPresetChange = (keepOverrides) => {
    if (!presetChangeDialog) return;
    const { newPreset, overrides } = presetChangeDialog;
    const newPresetValues = PRESETS[sport]?.[newPreset]?.values || {};
    const sportDef = SPORT_DEFAULTS[sport] || {};

    // settings 재구성
    const newSettings = { ...settings, ...sportDef, ...newPresetValues };
    if (keepOverrides) {
      Object.assign(newSettings, overrides);
    }

    setCurrentPreset(newPreset);
    setSettings({ ...newSettings, _meta: { ...settings._meta, preset: newPreset } });
    setPresetChangeDialog(null);
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
            <NumRow label="자책골 포인트" value={settings.ownGoalPoint} onChange={v => update("ownGoalPoint", v)} defaultVal={getDefaultFor("ownGoalPoint")} settingKey="ownGoalPoint" />
            <NumRow label="클린시트 포인트" value={settings.cleanSheetPoint} onChange={v => update("cleanSheetPoint", v)} defaultVal={getDefaultFor("cleanSheetPoint")} settingKey="cleanSheetPoint" />
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
              <span style={ss.hint}>기본: {getDefaultFor("useCrovaGoguma") ? "켜짐" : "꺼짐"}</span>
            </div>

            <NumRow label="자책골 포인트" value={settings.ownGoalPoint} onChange={v => update("ownGoalPoint", v)} defaultVal={getDefaultFor("ownGoalPoint")} settingKey="ownGoalPoint" />

            {settings.useCrovaGoguma && (
              <>
                <NumRow label="크로바(1위팀)" value={settings.crovaPoint} onChange={v => update("crovaPoint", v)} defaultVal={getDefaultFor("crovaPoint")} settingKey="crovaPoint" />
                <NumRow label="고구마(꼴찌팀)" value={settings.gogumaPoint} onChange={v => update("gogumaPoint", v)} defaultVal={getDefaultFor("gogumaPoint")} settingKey="gogumaPoint" />
                <NumRow label="황금크로바/탄고구마" value={settings.bonusMultiplier} onChange={v => update("bonusMultiplier", v)} defaultVal={getDefaultFor("bonusMultiplier")} suffix="배" settingKey="bonusMultiplier" />
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

      {presetChangeDialog && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500,
        }}>
          <div style={{ background: C.bg, borderRadius: 12, padding: 20, maxWidth: 360, width: "90%" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: C.white }}>
              "{currentPreset}" → "{presetChangeDialog.newPreset}"
            </div>
            {presetChangeDialog.diffs.length > 0 && (
              <>
                <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>다음 값이 바뀝니다:</div>
                <ul style={{ fontSize: 12, color: C.white, paddingLeft: 20, marginBottom: 12 }}>
                  {presetChangeDialog.diffs.map(d => (
                    <li key={d.key}>{d.key}: {String(d.from)} → {String(d.to)}</li>
                  ))}
                </ul>
              </>
            )}
            {Object.keys(presetChangeDialog.overrides).length > 0 && (
              <>
                <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>
                  이 팀이 덮어쓴 값({Object.keys(presetChangeDialog.overrides).length}개):
                </div>
                <ul style={{ fontSize: 11, color: C.grayDark, paddingLeft: 20, marginBottom: 12 }}>
                  {Object.entries(presetChangeDialog.overrides).map(([k, v]) => (
                    <li key={k}>{k} = {String(v)}</li>
                  ))}
                </ul>
              </>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.keys(presetChangeDialog.overrides).length > 0 && (
                <button onClick={() => applyPresetChange(true)} style={ss.btn(C.grayDark, C.white)}>
                  오버라이드 유지
                </button>
              )}
              <button onClick={() => applyPresetChange(false)} style={ss.btn(C.accent, C.bg)}>
                전부 초기화
              </button>
              <button onClick={() => setPresetChangeDialog(null)} style={ss.btn(C.grayDarker, C.gray)}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
