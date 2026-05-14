import { useTheme } from '../../hooks/useTheme';
import Modal from '../common/Modal';

export default function StandingsModal({ standings, splitPhase, teamCount, onClose, styles: s }) {
  const { C } = useTheme();
  const is6TeamSplit = teamCount === 6 && splitPhase === "second";

  return (
    <Modal onClose={onClose} title="팀 순위">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{["#", "팀", "경기", "승", "무", "패", "득", "실", "득실", "승점"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
        <tbody>
          {standings.map((t, i) => {
            const gd = t.gf - t.ga;
            // ★ 팀 순위는 승점 기준 통합 정렬. 리그는 소속 표시(상/하)로만 표현.
            const league = is6TeamSplit ? (t.league === 'upper' ? 'upper' : t.league === 'lower' ? 'lower' : null) : null;
            return (
              <tr key={t.name}>
                <td style={s.td()}>{i + 1}</td>
                <td style={s.td(true)}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {t.name}
                    {league && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                        background: league === 'upper' ? `${C.green}22` : `${C.orange}22`,
                        color: league === 'upper' ? C.green : C.orange,
                      }}>{league === 'upper' ? '상위' : '하위'}</span>
                    )}
                  </span>
                </td>
                <td style={s.td()}>{t.games}</td><td style={s.td()}>{t.wins}</td><td style={s.td()}>{t.draws}</td><td style={s.td()}>{t.losses}</td>
                <td style={s.td()}>{t.gf}</td><td style={s.td()}>{t.ga}</td>
                <td style={{ ...s.td(true), color: gd > 0 ? C.green : gd < 0 ? C.red : C.white }}>{gd > 0 ? `+${gd}` : gd}</td>
                <td style={s.td(true)}>{t.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}
