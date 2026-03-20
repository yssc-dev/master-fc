import { getPlayerPoint } from './scoring';

export function snakeDraft(players, teamCount, seasonPlayers) {
  // 포인트 내림차순, 동점 시 이름 오름차순으로 안정적 정렬
  const sorted = [...players].sort((a, b) => {
    const diff = getPlayerPoint(b, seasonPlayers) - getPlayerPoint(a, seasonPlayers);
    return diff !== 0 ? diff : a.localeCompare(b, 'ko');
  });
  const teams = Array.from({ length: teamCount }, () => []);
  sorted.forEach((player, idx) => {
    const round = Math.floor(idx / teamCount);
    const pos = idx % teamCount;
    const teamIdx = round % 2 === 0 ? pos : teamCount - 1 - pos;
    teams[teamIdx].push(player);
  });
  return teams;
}
