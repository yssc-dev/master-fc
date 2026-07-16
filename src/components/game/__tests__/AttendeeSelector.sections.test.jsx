import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import { makeStyles } from '../../../styles/theme';
import AttendeeSelector from '../AttendeeSelector';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

// 컴포넌트가 styles prop을 요구한다. makeStyles가 실제로 읽는 8개 키를 모두 채운다
// (accent/bg/borderColor/card/cardLight/gray/grayDarker/white) — 하나라도 빠지면
// 스타일 문자열에 'undefined'가 새어 아래 크래시 단언이 잡아낸다.
const s = makeStyles({
  accent: '#2563eb', bg: '#fff', borderColor: '#eee', card: '#fff',
  cardLight: '#fafafa', gray: '#888', grayDarker: '#eee', white: '#000',
  // 컴포넌트가 useTheme()로 직접 쓰는 키
  grayDark: '#ddd', accentDim: '#3b82f6', green: '#22c55e',
});

const ROSTER = [
  { name: '주건호', point: 60, games: 12 },
  { name: '김형욱', point: 44, games: 10 },
  { name: '박동휘', point: 31, games: 8 },
  { name: '선효림', point: 26, games: 5 },
];

const render = (props) => renderToStaticMarkup(createElement(ThemeProvider, null,
  createElement(AttendeeSelector, {
    attendees: ['주건호', '김형욱'],
    sortedPlayers: ROSTER,
    playerSortMode: 'point',
    lockedNames: ['주건호'],
    onSyncSheet(){}, onToggle(){}, onSetAll(){}, onClear(){}, onToggleSort(){},
    onAddManual(){}, newPlayer: '', onNewPlayerChange(){}, attendanceLoading: false,
    styles: s, ...props,
  })));

// 유저 요구: 참석자와 불참석자를 위아래로 구분, 각 섹션 헤더에 인원수.
describe('AttendeeSelector — 참석/불참 섹션 분리', () => {
  it('크래시 없이 렌더된다', () => {
    const html = render();
    expect(html).toContain('주건호');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });

  it('섹션 헤더에 참석/불참 인원수가 뜬다', () => {
    const html = render();
    expect(html).toContain('참석 2');
    expect(html).toContain('불참 2');
  });

  it('참석자가 불참자보다 위에 온다', () => {
    const html = render();
    // 참석 섹션 헤더 → 참석자 칩 → 불참 섹션 헤더 → 불참자 칩 순서
    expect(html.indexOf('참석 2')).toBeLessThan(html.indexOf('김형욱'));
    expect(html.indexOf('김형욱')).toBeLessThan(html.indexOf('불참 2'));
    expect(html.indexOf('불참 2')).toBeLessThan(html.indexOf('박동휘'));
  });

  it('출전 기록 있는 참석자에 자물쇠가 붙는다', () => {
    const html = render();
    expect(html).toContain('🔒');
    // 잠금 힌트는 참석 섹션 쪽(불참 헤더보다 위)
    expect(html.indexOf('해제할 수 없습니다')).toBeLessThan(html.indexOf('불참 2'));
  });

  it('lockedNames가 비면 자물쇠 힌트가 없다', () => {
    const html = render({ lockedNames: [] });
    expect(html).not.toContain('해제할 수 없습니다');
  });

  it('참석자가 없으면 참석 0으로 뜨고 전원이 불참 섹션에 간다', () => {
    const html = render({ attendees: [], lockedNames: [] });
    expect(html).toContain('참석 0');
    expect(html).toContain('불참 4');
  });

  it('전원 참석이면 불참 0', () => {
    const html = render({ attendees: ROSTER.map(p => p.name), lockedNames: [] });
    expect(html).toContain('참석 4');
    expect(html).toContain('불참 0');
  });
});
