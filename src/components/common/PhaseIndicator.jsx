import { C } from '../../config/constants';

const phases = ["참석자", "팀편성", "경기", "집계"];

export default function PhaseIndicator({ activeIndex }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "8px 0", background: "rgba(0,0,0,0.2)" }}>
      {phases.map((l, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: i === activeIndex ? C.accent : C.grayDark }} />
          <span style={{ fontSize: 10, color: i === activeIndex ? C.accent : C.grayDark }}>{l}</span>
        </div>
      ))}
    </div>
  );
}
