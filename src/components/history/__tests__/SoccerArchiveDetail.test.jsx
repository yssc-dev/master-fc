import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import SoccerArchiveDetail from '../SoccerArchiveDetail';

// HistoryView가 넘기는 hs 스타일 계약(th 객체 / td(highlight) 함수 / card 객체) 최소 구현
const hs = {
  th: { padding: 4 },
  td: (highlight) => ({ padding: 4, fontWeight: highlight ? 700 : 400 }),
  card: { padding: 8 },
};

const soccerMatches = [
  {
    matchIdx: 0, opponent: '한울', status: 'finished', gk: '주건호',
    lineup: ['이기세', '신관수', '주건호'],
    events: [
      { id: 'g1', type: 'goal', player: '이기세', assist: '신관수', timestamp: 1 },
      { id: 'og', type: 'opponentGoal', currentGk: '주건호', timestamp: 2 },
    ],
  },
  {
    matchIdx: 1, opponent: '아이콘', status: 'finished', gk: '주건호',
    lineup: ['강지선', '주건호'],
    events: [{ id: 'g2', type: 'goal', player: '강지선', timestamp: 3 }],
  },
  { matchIdx: 2, opponent: '휴식', status: 'finished', gk: '', lineup: [], events: [] },
];

// 프로덕션의 es(getEffectiveSettings ∪ settingsSnapshot)엔 축구 포인트 키가 존재.
const es = { ownGoalPoint: -1, cleanSheetPoint: 2 };

function render(props) {
  return renderToStaticMarkup(
    createElement(ThemeProvider, null, createElement(SoccerArchiveDetail, props))
  );
}

describe('SoccerArchiveDetail — 아카이브 축구 상세 렌더', () => {
  it('finished 경기가 있으면 크래시 없이 선수/상대/기록을 렌더한다 (0점 버그 회귀 방지)', () => {
    const html = render({ soccerMatches, es, styles: hs });
    expect(html.length).toBeGreaterThan(100);
    // 골 기록 선수와 상대팀명이 표에 나타남 (완전 0/빈 렌더가 아님)
    expect(html).toContain('이기세');
    expect(html).toContain('강지선');
    expect(html).toContain('한울');
    expect(html).toContain('선수별 기록');
    expect(html).toContain('경기 결과');
    // 골 셀에 1이 최소 한 번은 존재 (전부 0이 아님)
    expect(html).toContain('>1<');
    // 포인트가 NaN으로 새지 않음 (settings 키 존재 시)
    expect(html).not.toContain('NaN');
  });

  it('finished 경기가 없으면 안내 문구만, 크래시 없음', () => {
    const html = render({ soccerMatches: [], es, styles: hs });
    expect(html).toContain('상세 기록이 없습니다');
  });

  it('soccerMatches가 undefined여도 크래시하지 않는다', () => {
    const html = render({ soccerMatches: undefined, es, styles: hs });
    expect(html).toContain('상세 기록이 없습니다');
  });
});
