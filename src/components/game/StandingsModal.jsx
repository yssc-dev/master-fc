import React from 'react';
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
            const showSplitLine = is6TeamSplit && i === 3;
            return (
              <React.Fragment key={t.name}>
                {showSplitLine && (
                  <tr>
                    <td colSpan={10} style={{ padding: 0 }}>
                      <div style={{
                        textAlign: "center", padding: "6px 0", margin: "2px 0",
                        background: `${C.grayDark}44`,
                        borderTop: `1px dashed ${C.grayDark}`, borderBottom: `1px dashed ${C.grayDark}`,
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.gray }}>
                          ── <span style={{ color: C.green }}>상위 리그</span> ↑ | ↓ <span style={{ color: C.orange }}>하위 리그</span> ──
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                <tr style={{ background: is6TeamSplit ? (i < 3 ? `${C.green}08` : `${C.orange}08`) : "transparent" }}>
                  <td style={s.td()}>{i + 1}</td><td style={s.td(true)}>{t.name}</td>
                  <td style={s.td()}>{t.games}</td><td style={s.td()}>{t.wins}</td><td style={s.td()}>{t.draws}</td><td style={s.td()}>{t.losses}</td>
                  <td style={s.td()}>{t.gf}</td><td style={s.td()}>{t.ga}</td>
                  <td style={{ ...s.td(true), color: gd > 0 ? C.green : gd < 0 ? C.red : C.white }}>{gd > 0 ? `+${gd}` : gd}</td>
                  <td style={s.td(true)}>{t.points}</td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}
