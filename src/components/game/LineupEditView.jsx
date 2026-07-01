import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { FORMATIONS } from '../../utils/formations';
import FormationPitch from './FormationPitch';

// 라인업 편집기: 그 경기의 배치를 피치에서 직접 수정(라인업 변경).
//  - 출전 A 탭 → 출전 B 탭   = 위치 교대(onSwapPositions)
//  - 출전 A 탭 → 미출전 C 탭 = 정정(onCorrect; 기록 이관 confirm은 부모가 담당)
// 빈 슬롯(레드카드 등)은 탭 무시 — FormationPitch가 onEmptyTap을 안 받으면 라우팅 안 됨.
export default function LineupEditView({ formation, assignments = {}, bench = [], onSwapPositions, onCorrect, onBack, title }) {
  const { C } = useTheme();
  const [anchor, setAnchor] = useState(null); // 선택된 출전 슬롯 { idx, name }
  const positions = (FORMATIONS[formation] || FORMATIONS["4-4-2"]).positions;
  const sortedBench = [...bench].sort((a, b) => a.localeCompare(b, "ko"));

  const handlePlayerTap = (idx, name) => {
    if (!anchor) { setAnchor({ idx, name }); return; }
    if (anchor.idx === idx) { setAnchor(null); return; }   // 같은 선수 재탭 → 해제
    onSwapPositions?.(anchor.idx, idx);                     // 다른 출전 → 위치 교대
    setAnchor(null);
  };
  const handleBenchTap = (name) => {
    if (!anchor) return;                                    // 먼저 출전 선수 선택 필요
    const proceeded = onCorrect?.(anchor.name, name);       // 정정(부모 confirm)
    if (proceeded !== false) setAnchor(null);               // 취소(=false) 시 anchor 유지 → 재탭 불필요
  };

  const benchHint = !anchor
    ? "바꿀 출전 선수를 먼저 탭하세요"
    : sortedBench.length === 0
      ? "미출전 선수 없음 — 자리 교대만 가능"
      : `${anchor.name} 자리에 넣을 미출전 선수를 탭 = 정정(기록 이관)`;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button onClick={onBack} style={{ padding: "6px 10px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>← 완료</button>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{title || "라인업 편집"}</div>
      </div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        출전끼리 탭 = <b style={{ color: C.white }}>자리 교대</b> · 출전→미출전 탭 = <b style={{ color: C.white }}>정정</b>
      </div>
      <FormationPitch positions={positions} assignments={assignments}
        onPlayerTap={handlePlayerTap} highlightIdx={anchor ? anchor.idx : undefined} />
      <div style={{ marginTop: 12, padding: 12, background: C.card, borderRadius: 10, border: `1px solid ${C.grayDark}` }}>
        <div style={{ fontSize: 12, color: C.gray, fontWeight: 700, marginBottom: 8 }}>
          미출전 ({sortedBench.length}) — {benchHint}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {sortedBench.map(name => (
            <button key={name} onClick={() => handleBenchTap(name)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: anchor ? C.grayDarker : C.grayDark, color: anchor ? C.white : C.gray, opacity: anchor ? 1 : 0.6 }}>
              {name}
            </button>
          ))}
          {sortedBench.length === 0 && <span style={{ fontSize: 12, color: C.gray }}>미출전 선수 없음</span>}
        </div>
      </div>
    </div>
  );
}
