// src/components/dashboard/analytics/ChemistryTab.jsx
import { useState, useMemo } from 'react';
import { calcAssistPairs } from '../../../utils/analyticsV2/calcAssistPairs';
import { calcGkChemistry } from '../../../utils/analyticsV2/calcGkChemistry';
import GoldenTrioView from './GoldenTrioView';
import AssistPairList from './AssistPairList';
import GkChemistryView from './GkChemistryView';

export default function ChemistryTab({ matchLogs, eventLogs, C }) {
  const [sub, setSub] = useState('trio');

  const assistPairs = useMemo(
    () => calcAssistPairs({ eventLogs: eventLogs || [], threshold: 3, topN: 10 }),
    [eventLogs]
  );
  const gkChem = useMemo(
    () => calcGkChemistry({ matchLogs: matchLogs || [], threshold: 5 }),
    [matchLogs]
  );

  const subs = [
    { key: 'trio', label: '골든트리오' },
    { key: 'assist', label: '어시페어' },
    { key: 'gk', label: 'GK케미' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {subs.map(s => (
          <button key={s.key} onClick={() => setSub(s.key)} style={{
            padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 600,
            background: sub === s.key ? C.accent : 'transparent',
            color: sub === s.key ? C.black : C.gray,
            border: `1px solid ${sub === s.key ? C.accent : C.grayDarker}`,
            cursor: 'pointer',
          }}>{s.label}</button>
        ))}
      </div>
      {sub === 'trio' && <GoldenTrioView matchLogs={matchLogs} C={C} />}
      {sub === 'assist' && <AssistPairList pairs={assistPairs} C={C} />}
      {sub === 'gk' && <GkChemistryView chem={gkChem} C={C} />}
    </div>
  );
}
