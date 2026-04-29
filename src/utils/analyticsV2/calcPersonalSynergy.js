// C5: 시너지매트릭스 본인 row 발췌. 베스트/워스트 페어.

export function calcPersonalSynergy({ matrix, player, topN = 3 }) {
  if (!matrix || !matrix.cells || !player) return { best: [], worst: [] };
  const minRounds = matrix.minRounds ?? 1;
  const partners = [];
  for (const other of matrix.players || []) {
    if (other === player) continue;
    const [a, b] = [player, other].sort((x, y) => x.localeCompare(y, 'ko'));
    const cell = matrix.cells[`${a}|${b}`];
    if (!cell) continue;
    if (cell.games < minRounds) continue;
    partners.push({
      partner: other,
      games: cell.games,
      wins: cell.wins,
      draws: cell.draws,
      losses: cell.losses,
      winRate: cell.winRate,
    });
  }
  const best = [...partners].sort((a, b) =>
    b.winRate - a.winRate ||
    b.games - a.games ||
    a.partner.localeCompare(b.partner, 'ko')
  ).slice(0, topN);
  const worst = [...partners].sort((a, b) =>
    a.winRate - b.winRate ||
    b.games - a.games ||
    a.partner.localeCompare(b.partner, 'ko')
  ).slice(0, topN);
  return { best, worst };
}
