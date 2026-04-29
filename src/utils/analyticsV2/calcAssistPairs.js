// C3: (어시제공자 → 득점자) 페어 누적 횟수 TOP.

export function calcAssistPairs({ eventLogs, threshold = 3, topN = 10 }) {
  const counts = {};
  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;
    const scorer = e.player;
    const assister = e.related_player;
    if (!scorer || !assister) continue;
    const key = `${assister}\u0000${scorer}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, c]) => c >= threshold)
    .map(([key, count]) => {
      const [assister, scorer] = key.split('\u0000');
      return { assister, scorer, count };
    })
    .sort((a, b) =>
      b.count - a.count ||
      a.assister.localeCompare(b.assister, 'ko') ||
      a.scorer.localeCompare(b.scorer, 'ko')
    )
    .slice(0, topN);
}
