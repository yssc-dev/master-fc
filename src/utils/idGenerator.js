let _eventIdCounter = 0;

export function generateEventId() {
  return `evt_${Date.now()}_${++_eventIdCounter}`;
}

// 이벤트별 input_time 문자열. ms 정밀도 KST 포맷.
// 시트 dedupe 키에 들어가므로 동일 매치·동일 (선수, 어시, 상대 GK) 패턴의
// 골이 2회 이상 발생해도 row 고유성 보장.
export function formatEventInputTime(timestamp, fallback = '') {
  if (!timestamp) return fallback;
  const d = new Date(timestamp);
  const base = d.toLocaleString('ko-KR', { hour12: false });
  const ms = String(timestamp % 1000).padStart(3, '0');
  return `${base}.${ms}`;
}
