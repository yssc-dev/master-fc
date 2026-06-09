import { useTheme } from '../../hooks/useTheme';
import Modal from '../common/Modal';
import { calcSoccerScore, soccerResultLabel } from '../../utils/soccerScoring';

// 축구 대진표: 오늘 치른(또는 진행 중) 경기 목록 — 제N경기 · 우리팀 vs 상대 · 스코어
export default function SoccerScheduleModal({ soccerMatches, onClose, styles: s }) {
  const { C } = useTheme();
  const matches = [...(soccerMatches || [])].sort((a, b) => a.matchIdx - b.matchIdx);

  const chip = (label, ours) => (
    <span style={{
      display: "inline-block", padding: "3px 8px", borderRadius: 12, fontSize: 12, fontWeight: 700,
      background: ours ? `${C.green}22` : C.cardLight, color: ours ? C.green : C.white,
      border: ours ? `1px solid ${C.green}55` : "none", whiteSpace: "nowrap",
    }}>{label}</span>
  );

  return (
    <Modal onClose={onClose} title="대진표">
      {matches.length === 0 ? (
        <div style={{ fontSize: 13, color: C.gray, textAlign: "center", padding: 20 }}>아직 경기가 없습니다.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["경기", "대진", "결과"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {matches.map(m => {
              const rest = m.opponent === "휴식";
              const { ourScore, opponentScore } = calcSoccerScore(m.events || []);
              const finished = m.status === "finished";
              const result = soccerResultLabel(ourScore, opponentScore);
              const resultColor = result === "승" ? C.green : result === "패" ? C.red : C.gray;
              return (
                <tr key={m.matchIdx}>
                  <td style={s.td(true)}>제{m.matchIdx + 1}경기</td>
                  <td style={s.td()}>
                    {rest ? <span style={{ color: C.gray }}>😴 휴식</span> : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {chip("우리팀", true)}<span style={{ color: C.gray, fontSize: 11 }}>vs</span>{chip(m.opponent, false)}
                      </span>
                    )}
                  </td>
                  <td style={s.td()}>
                    {rest ? <span style={{ color: C.grayDark }}>-</span>
                      : finished ? <span style={{ fontWeight: 800, color: resultColor }}>{ourScore}:{opponentScore} {result}</span>
                        : <span style={{ color: C.accent, fontSize: 12, fontWeight: 700 }}>진행</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
