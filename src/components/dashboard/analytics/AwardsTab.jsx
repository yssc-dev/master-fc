// src/components/dashboard/analytics/AwardsTab.jsx
import { useMemo, useState } from 'react';
import { calcAwards } from '../../../utils/analyticsV2/calcAwards';
import { calcRoundSlope } from '../../../utils/analyticsV2/calcRoundSlope';
import { calcSoloGoalRatio } from '../../../utils/analyticsV2/calcSoloGoalRatio';
import { calcMonthlyRanking } from '../../../utils/analyticsV2/calcMonthlyRanking';

export default function AwardsTab({ playerGameLogs, matchLogs, eventLogs, C }) {
  const awards = useMemo(() => calcAwards({ playerLogs: playerGameLogs || [], eventLogs: eventLogs || [] }), [playerGameLogs, eventLogs]);
  const slope = useMemo(() => calcRoundSlope({ eventLogs: eventLogs || [], threshold: 10 }), [eventLogs]);
  const solo = useMemo(() => calcSoloGoalRatio({ eventLogs: eventLogs || [], threshold: 10 }), [eventLogs]);

  const months = useMemo(() => {
    const set = new Set();
    (playerGameLogs || []).forEach(p => {
      if (p.date && p.date.length >= 7) set.add(p.date.substring(0, 7));
    });
    return [...set].sort().reverse();
  }, [playerGameLogs]);

  const [selectedMonth, setSelectedMonth] = useState('');
  const effectiveMonth = selectedMonth || months[0] || '';

  const ranking = useMemo(() =>
    effectiveMonth ? calcMonthlyRanking({ yearMonth: effectiveMonth, playerLogs: playerGameLogs || [], matchLogs: matchLogs || [] }) : null
  , [effectiveMonth, playerGameLogs, matchLogs]);

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

  const RankingCol = ({ title, rows, suffix }) => (
    <div>
      <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>{title}</div>
      {(!rows || rows.length === 0) ? (
        <div style={{ fontSize: 10, color: C.gray }}>-</div>
      ) : rows.map((r, i) => (
        <div key={r.player} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
          <span style={{ color: C.white }}>{i + 1}. {r.player}</span>
          <span style={{ color: C.white, fontWeight: 700 }}>{r.value}{suffix}</span>
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

      {/* ── 월별 랭킹 ── */}
      <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gray }}>📅 월별 랭킹</div>
          <select value={effectiveMonth} onChange={e => setSelectedMonth(e.target.value)}
            style={{ padding: "4px 10px", borderRadius: 50, fontSize: 11, fontWeight: 480, background: "transparent", color: C.white, border: `1px dashed ${C.grayDark}`, fontFamily: "inherit", appearance: "none", cursor: "pointer" }}>
            {months.length === 0 ? <option value="">-</option> : months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {ranking ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <RankingCol title="⚽ 득점" rows={ranking.goals} suffix="골" />
            <RankingCol title="🅰 어시" rows={ranking.assists} suffix="어시" />
            <RankingCol title="🏁 승률" rows={ranking.winRate.map(x => ({ player: x.player, value: `${Math.round(x.value * 100)}%` }))} suffix="" />
          </div>
        ) : (
          <div style={{ fontSize: 11, color: C.gray }}>월 데이터 없음</div>
        )}
      </div>
    </div>
  );
}
