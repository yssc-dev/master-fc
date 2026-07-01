import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import SoccerMatchResults from '../SoccerMatchResults';

const s = {
  th: { padding: 4 },
  td: (highlight) => ({ padding: 4, fontWeight: highlight ? 700 : 400 }),
};

const matches = [
  {
    matchIdx: 0, opponent: '한울', status: 'finished',
    events: [
      { id: 'g1', type: 'goal', player: '이기세', assist: '신관수', timestamp: 1 },
      { id: 'g2', type: 'goal', player: '강지선', assist: null, timestamp: 2 },
      { id: 'oo', type: 'opponentOwnGoal', timestamp: 3 },
    ],
  },
  { matchIdx: 1, opponent: '아이콘', status: 'finished', events: [{ id: 'x', type: 'opponentGoal', currentGk: 'A', timestamp: 1 }] },
  { matchIdx: 2, opponent: '휴식', status: 'finished', events: [] },
  { matchIdx: 3, opponent: '터틀파크', status: 'playing', events: [] }, // playing은 제외
];

function render(props) {
  return renderToStaticMarkup(createElement(ThemeProvider, null, createElement(SoccerMatchResults, props)));
}

describe('SoccerMatchResults — 경기 결과 표(득점자/어시)', () => {
  it('CS 대신 각 경기 득점자(어시)를 표기한다', () => {
    const html = render({ matches, styles: s });
    // 헤더에 CS 없고 득점 열 존재
    expect(html).toContain('득점');
    expect(html).not.toContain('>CS<');
    // 골: 어시 있으면 "선수(어시)", 없으면 "선수", 상대자책 표기
    expect(html).toContain('이기세(신관수)');
    expect(html).toContain('강지선');
    expect(html).toContain('상대자책');
    // 무득점 경기(아이콘, 상대골만)는 "-"
    expect(html).toContain('-');
    // 휴식 경기 표기
    expect(html).toContain('휴식');
    // playing 경기(터틀파크)는 미표시
    expect(html).not.toContain('터틀파크');
    expect(html).not.toContain('NaN');
  });

  it('빈 배열/undefined에도 크래시하지 않는다', () => {
    expect(render({ matches: [], styles: s })).toContain('<table');
    expect(render({ matches: undefined, styles: s })).toContain('<table');
  });
});
