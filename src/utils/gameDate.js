// gameId("g_<timestamp>")에서 경기 생성 시각(=경기 날짜)을 복원.
// 요약 헤더 등에서 "오늘"이 아니라 실제 경기 날짜를 보여주기 위함.
// 레거시 gameId(g_ 접두사 아님/잘못된 형식)는 fallback(없으면 현재 시각) 사용.
export function gameDateFromId(gameId, fallback) {
  const ts = (typeof gameId === "string" && gameId.startsWith("g_")) ? parseInt(gameId.slice(2), 10) : NaN;
  if (Number.isFinite(ts) && ts > 0) return new Date(ts);
  return fallback != null ? new Date(fallback) : new Date();
}
