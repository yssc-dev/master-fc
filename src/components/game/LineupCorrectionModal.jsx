import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import Modal from '../common/Modal';

// 라인업 정정: 잘못 기록된 출전(b) → 실제로 뛴 미출전(a) 선택 → onCorrect(b, a).
// 교체 아님(로스터 정정, sub 이벤트 없음, b의 이벤트는 a로 이관됨 — 리듀서에서).
export default function LineupCorrectionModal({ played, bench, onCorrect, onClose }) {
  const { C } = useTheme();
  const [outPlayer, setOutPlayer] = useState(null);
  const btn = { padding: "10px 14px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.cardLight, color: C.white };
  return (
    <Modal onClose={onClose} title="라인업 변경 (선발 정정)" maxWidth={380}>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 12 }}>
        잘못 기록된 <b>출전</b> 선수를 실제로 뛴 <b>미출전</b> 선수로 정정합니다. 교체가 아니라 기록을 바로잡는 것이며, 그 선수의 골·어시 기록도 함께 이관됩니다.
      </div>
      {!outPlayer ? (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 6 }}>① 잘못 기록된 출전 선수</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {played.map(n => <button key={n} onClick={() => setOutPlayer(n)} style={btn}>{n}</button>)}
            {played.length === 0 && <span style={{ color: C.gray, fontSize: 12 }}>출전 선수 없음</span>}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 6 }}>
            ② <span style={{ color: C.white }}>{outPlayer}</span> 대신 실제로 뛴 선수
            <button onClick={() => setOutPlayer(null)} style={{ marginLeft: 8, fontSize: 10, background: "none", border: "none", color: C.accent, cursor: "pointer" }}>← 다시</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {bench.map(n => (
              <button key={n} onClick={() => {
                if (confirm(`${outPlayer} → ${n} 으로 정정할까요?\n(${outPlayer}=미출전, ${n}=출전, 기록 이관)`)) { onCorrect(outPlayer, n); onClose(); }
              }} style={btn}>{n}</button>
            ))}
            {bench.length === 0 && <span style={{ color: C.gray, fontSize: 12 }}>미출전 선수 없음</span>}
          </div>
        </>
      )}
    </Modal>
  );
}
