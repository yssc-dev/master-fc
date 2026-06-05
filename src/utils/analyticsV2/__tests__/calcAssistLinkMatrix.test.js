import { describe, it, expect } from 'vitest';
import { calcAssistLinkMatrix, personalLink } from '../calcAssistLinkMatrix';

describe('calcAssistLinkMatrix', () => {
  it('returns empty cells for no events', () => {
    expect(calcAssistLinkMatrix({ eventLogs: [] })).toEqual({ cells: {} });
  });

  it('sums both directions into one sorted cell', () => {
    const eventLogs = [
      { event_type: 'goal', player: '나', related_player: '가' }, // 가 어시 → 나 골
      { event_type: 'goal', player: '나', related_player: '가' },
      { event_type: 'goal', player: '가', related_player: '나' }, // 나 어시 → 가 골
    ];
    const { cells } = calcAssistLinkMatrix({ eventLogs });
    // 가 < 나 (localeCompare 'ko') → key '가|나', a='가', b='나'
    expect(cells['가|나']).toEqual({ total: 3, aToB: 1, bToA: 2 });
  });

  it('skips solo goals (no related_player)', () => {
    const eventLogs = [{ event_type: 'goal', player: '나', related_player: '' }];
    expect(calcAssistLinkMatrix({ eventLogs })).toEqual({ cells: {} });
  });

  it('skips owngoal', () => {
    const eventLogs = [{ event_type: 'owngoal', player: '나', related_player: '가' }];
    expect(calcAssistLinkMatrix({ eventLogs })).toEqual({ cells: {} });
  });

  it('skips self-assist guard', () => {
    const eventLogs = [{ event_type: 'goal', player: '나', related_player: '나' }];
    expect(calcAssistLinkMatrix({ eventLogs })).toEqual({ cells: {} });
  });
});

describe('personalLink', () => {
  const eventLogs = [
    { event_type: 'goal', player: '나', related_player: '가' }, // 가 어시 → 나 골
    { event_type: 'goal', player: '나', related_player: '가' },
    { event_type: 'goal', player: '가', related_player: '나' }, // 나 어시 → 가 골
  ];
  const linkMatrix = calcAssistLinkMatrix({ eventLogs });

  it('maps direction from selected player perspective', () => {
    // 본인 '나': 내가 어시한 수=1(가 골), 내가 득점한 수=2(가 어시)
    expect(personalLink({ linkMatrix, player: '나', partner: '가' }))
      .toEqual({ total: 3, iAssisted: 1, iScored: 2 });
    // 본인 '가': 대칭
    expect(personalLink({ linkMatrix, player: '가', partner: '나' }))
      .toEqual({ total: 3, iAssisted: 2, iScored: 1 });
  });

  it('returns zeros when no cell exists', () => {
    expect(personalLink({ linkMatrix, player: '나', partner: '없는사람' }))
      .toEqual({ total: 0, iAssisted: 0, iScored: 0 });
  });
});
