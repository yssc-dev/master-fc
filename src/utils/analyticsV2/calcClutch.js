// 클러치 골 분류: 결승골 / 동점골 / 역전골
//
// 로그_이벤트에는 경기 시계가 없지만 input_time(ms 정밀 입력 시각)이 있어
// 경기 내 골 순서를 복원할 수 있다 (입력 시각 ≈ 실제 순서 전제 — UI에 고지).
// 매치 내 이벤트 전부에 input_time이 있을 때만 그 순서를 쓰고, 아니면 시트 행 순서 유지.
//
// 신뢰 가드: goal/owngoal 재구성 스코어가 로그_매치 기록 스코어와 다르면
// 그 매치는 분류에서 제외(skippedMatches 집계) — 부분 기록으로 오분류하지 않는다.
// 골 이벤트 dedupe 금지 원칙 준수 — 행 그대로 사용.
//
// 정의 (골을 넣은 시점의 재구성 스코어 기준):
//   동점골(equalizer):   골 직후 동점이 됨
//   리드골(goAhead):     동점에서 리드로 (참고용 내부 개념)
//   역전골(comebackGoal): 리드골 중, 그 매치에서 자기 팀이 뒤진 적이 있었던 경우
//   결승골(winningGoal):  승리 매치에서 (패자 최종 득점 + 1)번째 승자 골
import { parseActualPlayers } from './parseMembers';

export function calcClutch({ eventLogs, matchLogs, topN = 5 }) {
  // (date|match_id) → 이벤트 목록
  const eventsByMatch = {};
  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal' && e.event_type !== 'owngoal') continue;
    const key = `${e.date || ''}|${e.match_id || ''}`;
    if (!eventsByMatch[key]) eventsByMatch[key] = [];
    eventsByMatch[key].push(e);
  }

  const perPlayer = {};
  const ensure = (name) => {
    if (!perPlayer[name]) perPlayer[name] = { winningGoals: 0, equalizers: 0, comebackGoals: 0 };
    return perPlayer[name];
  };

  let skippedMatches = 0;
  let classifiedMatches = 0;

  for (const m of matchLogs || []) {
    if (m.is_extra) continue;
    const key = `${m.date || ''}|${m.match_id || ''}`;
    const evs = eventsByMatch[key];
    if (!evs || evs.length === 0) continue;

    const ourSet = new Set(parseActualPlayers(m.our_members_json));
    const oppSet = new Set(parseActualPlayers(m.opponent_members_json));
    const finalOur = Number(m.our_score) || 0;
    const finalOpp = Number(m.opponent_score) || 0;

    // 순서 복원: 전 이벤트에 input_time이 있으면 그 순서, 아니면 행 순서(안정 정렬)
    let ordered = evs;
    if (evs.every(e => e.input_time)) {
      ordered = [...evs].sort((a, b) => String(a.input_time).localeCompare(String(b.input_time)));
    }

    // 득점 귀속 side 결정 + 재구성
    let our = 0, opp = 0;
    let ourWasBehind = false, oppWasBehind = false;
    const classified = []; // { player, side, equalizer, goAhead, wasBehind, sideGoalIdx }
    let valid = true;
    for (const e of ordered) {
      let side = null; // 득점이 올라가는 쪽
      if (e.event_type === 'goal') {
        if (ourSet.has(e.player)) side = 'our';
        else if (oppSet.has(e.player)) side = 'opp';
      } else { // owngoal → 반대편 득점
        if (ourSet.has(e.player)) side = 'opp';
        else if (oppSet.has(e.player)) side = 'our';
      }
      if (!side) { valid = false; break; } // 소속 불명 → 재구성 불가

      if (side === 'our') our++; else opp++;
      if (our < opp) ourWasBehind = true;
      if (opp < our) oppWasBehind = true;

      if (e.event_type === 'goal' && e.player) {
        const sideTotal = side === 'our' ? our : opp;
        const otherTotal = side === 'our' ? opp : our;
        classified.push({
          player: e.player,
          side,
          sideGoalIdx: sideTotal, // 이 골이 자기팀 몇 번째 골인지
          equalizer: sideTotal === otherTotal,
          goAhead: sideTotal === otherTotal + 1,
          wasBehind: side === 'our' ? ourWasBehind : oppWasBehind,
        });
      }
    }

    if (!valid || our !== finalOur || opp !== finalOpp) {
      skippedMatches++;
      continue;
    }
    classifiedMatches++;

    const winner = finalOur > finalOpp ? 'our' : finalOpp > finalOur ? 'opp' : null;
    const loserFinal = winner === 'our' ? finalOpp : finalOur;
    for (const c of classified) {
      const s = ensure(c.player);
      if (c.equalizer) s.equalizers++;
      // 역전골: 리드를 만든 골 + 그 시점까지 자기 팀이 뒤진 적 있음
      if (c.goAhead && c.wasBehind) s.comebackGoals++;
      // 결승골: 승리 팀의 (패자 최종 득점+1)번째 골
      if (winner && c.side === winner && c.sideGoalIdx === loserFinal + 1) s.winningGoals++;
    }
  }

  const rankBy = (field) =>
    Object.entries(perPlayer)
      .map(([player, v]) => ({ player, value: v[field] }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value || a.player.localeCompare(b.player, 'ko'))
      .slice(0, topN);

  return {
    perPlayer,
    ranking: {
      winningGoals: rankBy('winningGoals'),
      equalizers: rankBy('equalizers'),
      comebackGoals: rankBy('comebackGoals'),
    },
    skippedMatches,
    classifiedMatches,
  };
}
