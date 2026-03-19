import { getPlayerPoint } from './scoring';

export function snakeDraft(players, teamCount, seasonPlayers) {
  const sorted = [...players].sort((a, b) => getPlayerPoint(b, seasonPlayers) - getPlayerPoint(a, seasonPlayers));
  const teams = Array.from({ length: teamCount }, () => []);
  sorted.forEach((player, idx) => {
    const round = Math.floor(idx / teamCount);
    const pos = idx % teamCount;
    const teamIdx = round % 2 === 0 ? pos : teamCount - 1 - pos;
    teams[teamIdx].push(player);
  });
  return teams;
}
