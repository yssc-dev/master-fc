// src/components/dashboard/analytics/AwardsTab.jsx
import { useMemo, useState } from 'react';
import { calcAwards } from '../../../utils/analyticsV2/calcAwards';
import { calcRoundSlope } from '../../../utils/analyticsV2/calcRoundSlope';
import { calcSoloGoalRatio } from '../../../utils/analyticsV2/calcSoloGoalRatio';
import { calcMonthlyRanking } from '../../../utils/analyticsV2/calcMonthlyRanking';
import { calcVolatility } from '../../../utils/analyticsV2/calcVolatility';
import { calcDarkhorse } from '../../../utils/analyticsV2/calcDarkhorse';

export default function AwardsTab({ playerGameLogs, matchLogs, eventLogs, C }) {
  const awards = useMemo(() => calcAwards({ playerLogs: playerGameLogs || [], eventLogs: eventLogs || [] }), [playerGameLogs, eventLogs]);
  const slope = useMemo(() => calcRoundSlope({ eventLogs: eventLogs || [], matchLogs: matchLogs || [], threshold: 10 }), [eventLogs, matchLogs]);
  const solo = useMemo(() => calcSoloGoalRatio({ eventLogs: eventLogs || [], threshold: 10 }), [eventLogs]);
  const volatility = useMemo(() => calcVolatility({ playerLogs: playerGameLogs || [], minGames: 5, topN: 3 }), [playerGameLogs]);

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

  const darkhorse = useMemo(() =>
    calcDarkhorse({ matchLogs: matchLogs || [], playerGameLogs: playerGameLogs || [], eventLogs: eventLogs || [] })
  , [matchLogs, playerGameLogs, eventLogs]);

  const Card = ({ title, items, valueKey, valueFmt, valueRender }) => (
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
          {valueRender
            ? valueRender(it)
            : <span style={{ color: C.green, fontWeight: 600 }}>{valueFmt(it[valueKey])}</span>
          }
        </div>
      ))}
    </div>
  );

  const SlopeRow = ({ item, maxAbs, isLate }) => {
    const ratio = Math.min(1, Math.abs(item.slope) / maxAbs);
    const barColor = isLate ? '#4ade80' : '#ff8a4c';
    const valueText = `${isLate ? '+' : ''}${item.slope.toFixed(2)}`;
    return (
      <div style={{ display: 'flex', alignItems: 'center', height: 22, marginBottom: 6, fontSize: 11 }}>
        <div style={{ flex: 1, position: 'relative', height: '100%' }}>
          {!isLate && (
            <>
              <div style={{
                position: 'absolute', right: 0, top: 4, height: 14,
                width: `${ratio * 100}%`, background: barColor,
                borderRadius: '7px 0 0 7px',
              }} />
              <div style={{
                position: 'absolute', right: `calc(${ratio * 100}% + 6px)`, top: 2,
                color: C.white, fontWeight: 600, whiteSpace: 'nowrap',
              }}>
                {item.player} <span style={{ color: C.gray, fontSize: 10 }}>{valueText}</span>
              </div>
            </>
          )}
        </div>
        <div style={{ width: 1, height: 18, background: C.grayDark, flexShrink: 0 }} />
        <div style={{ flex: 1, position: 'relative', height: '100%' }}>
          {isLate && (
            <>
              <div style={{
                position: 'absolute', left: 0, top: 4, height: 14,
                width: `${ratio * 100}%`, background: barColor,
                borderRadius: '0 7px 7px 0',
              }} />
              <div style={{
                position: 'absolute', left: `calc(${ratio * 100}% + 6px)`, top: 2,
                color: C.white, fontWeight: 600, whiteSpace: 'nowrap',
              }}>
                <span style={{ color: C.gray, fontSize: 10 }}>{valueText}</span> {item.player}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const SoloDonut = ({ player, ratio, rank }) => {
    const size = 80, stroke = 8;
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ * (1 - Math.min(1, ratio));
    return (
      <div style={{ textAlign: 'center', flex: 1 }}>
        <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
          <svg width={size} height={size}>
            <circle cx={size/2} cy={size/2} r={r}
              fill="none" stroke={C.grayDarker} strokeWidth={stroke} />
            <circle cx={size/2} cy={size/2} r={r}
              fill="none" stroke="#4ade80" strokeWidth={stroke}
              strokeDasharray={circ} strokeDashoffset={offset}
              strokeLinecap="round"
              transform={`rotate(-90 ${size/2} ${size/2})`} />
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 700, color: C.white,
          }}>{Math.round(ratio * 100)}%</div>
        </div>
        <div style={{ fontSize: 11, color: C.white, marginTop: 6 }}>
          #{rank} {player}
        </div>
      </div>
    );
  };

  // Δ 칩: 향상이면 초록, 악화면 주황. lowerIsBetter면 부호 해석 반전(실점).
  // value==null = 빌린 팀이 P 없이 뛴 매치가 없어 비교 불가.
  const Delta = ({ value, fmt, lowerIsBetter = false }) => {
    if (value == null) return <span style={{ color: C.gray }}>비교 없음</span>;
    const good = lowerIsBetter ? value < 0 : value > 0;
    const neutral = value === 0;
    const color = neutral ? C.gray : (good ? '#4ade80' : '#ff8a4c');
    const sign = value > 0 ? '+' : '';
    return <span style={{ color }}>Δ{sign}{fmt(value)}</span>;
  };

  const DarkhorseRow = ({ item, rank }) => (
    <div style={{ padding: '6px 0', borderBottom: `1px dashed ${C.grayDarker}`, fontSize: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: C.white, fontWeight: 600 }}>#{rank} {item.player}</span>
        <span style={{ color: C.gray }}>용병 {item.mercGames}경기</span>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', color: C.gray }}>
        <span>승률 <b style={{ color: C.white }}>{Math.round(item.mercWinRate * 100)}%</b>{' '}
          <Delta value={item.dWin} fmt={v => `${Math.round(v * 100)}%p`} /></span>
        <span>G+A <b style={{ color: C.white }}>{item.mercContrib.toFixed(1)}</b></span>
        <span>실점 <b style={{ color: C.white }}>{item.mercConceded.toFixed(1)}</b>{' '}
          <Delta value={item.dConceded} fmt={v => v.toFixed(1)} lowerIsBetter /></span>
      </div>
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
      <Card title="🛡 수호신 (무실점 GK 세션 · 무실점률)" items={awards.guardian}
        valueRender={(it) => (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ color: C.green, fontWeight: 600 }}>{it.count}회</span>
            <span style={{ color: C.gray, fontSize: 11 }}>
              ({Math.round(it.rate * 100)}% · {it.sessions}세션)
            </span>
          </span>
        )}
      />
      <Card title="🤦 자책 누적" items={awards.owngoalKings} valueKey="total" valueFmt={v => `${v}회`} />
      {/* 라운드 흐름: 초반강자(-) ← → 후반폭격기(+) */}
      {(() => {
        const late = slope.ranking.lateBloomers.slice(0, 3);
        const early = slope.ranking.earlyBirds.slice(0, 3);
        const maxAbs = Math.max(0.01,
          ...late.map(x => Math.abs(x.slope)),
          ...early.map(x => Math.abs(x.slope)),
        );
        return (
          <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>
              🏁 라운드 흐름 (G+A/라운드 변화)
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.gray, marginBottom: 10 }}>
              <span>← 초반 강자</span>
              <span>후반 폭격기 →</span>
            </div>
            {late.length === 0 && early.length === 0 ? (
              <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
            ) : (
              <>
                {late.map((it, i) => <SlopeRow key={`L${i}`} item={it} maxAbs={maxAbs} isLate={true} />)}
                {early.map((it, i) => <SlopeRow key={`E${i}`} item={it} maxAbs={maxAbs} isLate={false} />)}
              </>
            )}
          </div>
        );
      })()}

      {/* 단독골 도넛 */}
      <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 12 }}>
          🎯 단독드리블골 (어시 없는 골 비율)
        </div>
        {solo.ranking.soloHeroes.length === 0 ? (
          <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            {solo.ranking.soloHeroes.slice(0, 3).map((it, i) => (
              <SoloDonut key={it.player} player={it.player} ratio={it.soloRatio} rank={i + 1} />
            ))}
          </div>
        )}
      </div>

      {/* 🎢 변동성 — 몰빵형 vs 꾸준형 */}
      <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 4 }}>
          🎢 컨디션 편차 (경기당 G+A 표준편차)
        </div>
        <div style={{ fontSize: 10, color: C.gray, marginBottom: 10 }}>
          5경기 이상 · 꾸준형은 평균 G+A 중앙값 이상에서만 선정
        </div>
        {volatility.streaky.length === 0 && volatility.consistent.length === 0 ? (
          <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>💥 몰빵형 (편차 ↑)</div>
              {volatility.streaky.length === 0
                ? <div style={{ fontSize: 10, color: C.gray }}>-</div>
                : volatility.streaky.map((it, i) => (
                  <div key={it.player} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: C.white }}>{i + 1}. {it.player}</span>
                    <span style={{ color: C.white, fontWeight: 700 }}>σ {it.std.toFixed(1)}</span>
                  </div>
                ))
              }
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>🎯 꾸준형 (편차 ↓)</div>
              {volatility.consistent.length === 0
                ? <div style={{ fontSize: 10, color: C.gray }}>-</div>
                : volatility.consistent.map((it, i) => (
                  <div key={it.player} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: C.white }}>{i + 1}. {it.player}</span>
                    <span style={{ color: C.white, fontWeight: 700 }}>σ {it.std.toFixed(1)}</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}
      </div>

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

      {/* ── 🐎 다크호스 (용병 출전 시 성과) ── */}
      <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 4 }}>
          🐎 다크호스 (용병 출전 시 성과)
        </div>
        <div style={{ fontSize: 10, color: C.gray, marginBottom: 8 }}>
          누적 · 용병 4경기 이상 · Δ는 그 팀이 P 없을 때 대비 (실점은 낮을수록 좋음)
        </div>
        {(!darkhorse.ranking || darkhorse.ranking.length === 0) ? (
          <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
        ) : (
          darkhorse.ranking.map((it, i) => <DarkhorseRow key={it.player} item={it} rank={i + 1} />)
        )}
      </div>
    </div>
  );
}
