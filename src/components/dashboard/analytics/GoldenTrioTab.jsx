import { useMemo, useState } from 'react';
import { calcGoldenTrio } from '../../../utils/analyticsV2/calcGoldenTrio';

export default function GoldenTrioTab({ matchLogs, C }) {
  const trios = useMemo(() => calcGoldenTrio({ matchLogs: matchLogs || [], minRounds: 3, topN: 5 }), [matchLogs]);
  const [expanded, setExpanded] = useState(null);

  if (!matchLogs || matchLogs.length === 0) {
    return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>로그_매치 데이터가 없습니다.</div>;
  }
  if (trios.length === 0) {
    return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>조건을 만족하는 2인 조합이 없습니다. (최소 3경기 동행)</div>;
  }

  const outcomeColor = (o) => o === 'W' ? '#22c55e' : o === 'D' ? C.gray : '#ef4444';
  const outcomeLabel = (o) => o === 'W' ? '승' : o === 'D' ? '무' : '패';

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        케미 = 듀오 승률 - 둘의 개인 평균 승률. 양수일수록 "같이 뛰면 평소보다 잘함" (최소 3경기, TOP 5)
      </div>
      {trios.map((t, i) => {
        const key = t.members.join('|');
        const isOpen = expanded === key;
        const chemPct = Math.round(t.chemistry * 100);
        const chemColor = t.chemistry > 0 ? "#22c55e" : t.chemistry < 0 ? "#ef4444" : C.gray;
        return (
          <div key={key} style={{ background: C.cardLight, borderRadius: 8, marginBottom: 8 }}>
            <div
              onClick={() => setExpanded(isOpen ? null : key)}
              style={{ padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
            >
              <div>
                <div style={{ fontSize: 10, color: C.gray, marginBottom: 2 }}>#{i + 1} {isOpen ? '▾' : '▸'}</div>
                <div style={{ fontSize: 13, color: C.white, fontWeight: 700 }}>
                  {t.members.join(" + ")}
                </div>
                <div style={{ fontSize: 10, color: C.gray, marginTop: 2 }}>
                  {t.games}경기 듀오승률 {Math.round(t.winRate * 100)}% / 개인평균 {Math.round(t.indivAvg * 100)}%
                </div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: chemColor }}>
                {chemPct > 0 ? '+' : ''}{chemPct}
              </div>
            </div>
            {isOpen && (
              <div style={{ padding: "0 12px 10px", borderTop: `1px dashed ${C.grayDarker}` }}>
                {t.matches
                  .slice()
                  .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.match_id || '').localeCompare(b.match_id || ''))
                  .map((m, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0", borderBottom: `1px dashed ${C.grayDarker}22` }}>
                      <span style={{ color: C.gray }}>{m.date} · {m.match_id}</span>
                      <span style={{ color: C.white }}>
                        {m.team || '-'} {m.our}:{m.opp} {m.opponent || '-'}
                        <span style={{ marginLeft: 6, color: outcomeColor(m.outcome), fontWeight: 700 }}>{outcomeLabel(m.outcome)}</span>
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
