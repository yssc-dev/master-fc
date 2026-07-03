// 선수 분석 탭 순수 계산 함수 모음.
// React/DOM 의존성 없음 — 테스트 가능성 최우선.
// (2026-07-03 죽은 코드 정리: PlayerAnalyticsLegacy 전용이던 calcTeamRanking/
//  calcCrovaGogumaFreq/calcRoundMidpointTimePattern/sortSynergyWithTieBreak/
//  classifyTimeSlot/calcAttendance/calcComboEfficiency 제거.
//  현행 사용처는 PersonalAnalysisTab의 calcTrend/calcRelativePosition 뿐.)

/**
 * @param {number[]} sessions — 세션별 비음수 지표 값 (예: 세션당 득점). NaN/음수 전제로 호출 금지.
 */
export function calcTrend(sessions) {
  if (!sessions || sessions.length < 5) return null;
  if (sessions.some(v => !Number.isFinite(v))) return null;
  const seasonAvg = sessions.reduce((a, b) => a + b, 0) / sessions.length;
  const recent = sessions.slice(-5);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  if (seasonAvg === 0) return { direction: 'flat', icon: '➡️', label: '유지' };
  const ratio = recentAvg / seasonAvg;
  if (ratio >= 1.1) return { direction: 'up', icon: '🔺', label: '상승세' };
  if (ratio <= 0.9) return { direction: 'down', icon: '🔻', label: '하락세' };
  return { direction: 'flat', icon: '➡️', label: '유지' };
}

/**
 * @param {number} playerValue — 비음수 유한값 (NaN/Infinity/음수 전제 호출 금지)
 * @param {number[]} teamValues — 비음수 유한값 배열
 */
export function calcRelativePosition(playerValue, teamValues) {
  if (!teamValues || teamValues.length === 0) return 0;
  const avg = teamValues.reduce((a, b) => a + b, 0) / teamValues.length;
  if (avg === 0) return 0;
  return Math.round(((playerValue / avg) - 1) * 100);
}
