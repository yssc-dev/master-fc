// src/components/dashboard/analytics/AwardsTab.jsx
import { useMemo } from 'react';
import { calcAwards } from '../../../utils/analyticsV2/calcAwards';
import { calcRoundSlope } from '../../../utils/analyticsV2/calcRoundSlope';
import { calcSoloGoalRatio } from '../../../utils/analyticsV2/calcSoloGoalRatio';

export default function AwardsTab({ playerGameLogs, eventLogs, C }) {
  const awards = useMemo(() => calcAwards({ playerLogs: playerGameLogs || [] }), [playerGameLogs]);
  const slope = useMemo(() => calcRoundSlope({ eventLogs: eventLogs || [], threshold: 10 }), [eventLogs]);
  const solo = useMemo(() => calcSoloGoalRatio({ eventLogs: eventLogs || [], threshold: 10 }), [eventLogs]);

  const Card = ({ title, items, valueKey, valueFmt }) => (
    <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 8 }}>{title}</div>
      {(!items || items.length === 0) ? (
        <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
      ) : items.map((it, i) => (
        <div key={`${it.player}|${i}`} style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '4px 0', fontSize: 12,
          borderBottom: i < items.length - 1 ? `1px dashed ${C.grayDarker}` : 'none',
        }}>
          <span style={{ color: C.gray }}>#{i + 1} {it.player}</span>
          <span style={{ color: C.green, fontWeight: 600 }}>{valueFmt(it[valueKey])}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <Card title="🔥 불꽃 (해트트릭+ 횟수)" items={awards.fireStarter} valueKey="count" valueFmt={v => `${v}회`} />
      <Card title="🛡 수호신 (세션 무실점 GK 횟수)" items={awards.guardian} valueKey="count" valueFmt={v => `${v}회`} />
      <Card title="🤦 자책 누적" items={awards.owngoalKings} valueKey="total" valueFmt={v => `${v}회`} />
      <Card title="🏃 후반 폭격기 (라운드 ↑ → G+A ↑)"
        items={slope.ranking.lateBloomers.slice(0, 3)} valueKey="slope"
        valueFmt={v => `+${v.toFixed(2)}/라운드`} />
      <Card title="🎯 초반 강자 (라운드 ↑ → G+A ↓)"
        items={slope.ranking.earlyBirds.slice(0, 3)} valueKey="slope"
        valueFmt={v => `${v.toFixed(2)}/라운드`} />
      <Card title="🎯 혼자 박는 자 (단독골 비율)"
        items={solo.ranking.soloHeroes.slice(0, 3)} valueKey="soloRatio"
        valueFmt={v => `${Math.round(v * 100)}%`} />
    </div>
  );
}
