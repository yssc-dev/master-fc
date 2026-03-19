import { C } from '../../config/constants';
import Modal from '../common/Modal';

export default function StandingsModal({ standings, onClose, styles: s }) {
  return (
    <Modal onClose={onClose} title="팀 순위">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{["#", "팀", "경기", "승", "무", "패", "득", "실", "득실", "승점"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
        <tbody>
          {standings.map((t, i) => {
            const gd = t.gf - t.ga;
            return (
              <tr key={t.name}>
                <td style={s.td()}>{i + 1}</td><td style={s.td(true)}>{t.name}</td>
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
