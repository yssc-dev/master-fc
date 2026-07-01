import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import LineupEditView from '../LineupEditView';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

const render = (props) => renderToStaticMarkup(createElement(ThemeProvider, null,
  createElement(LineupEditView, {
    formation: '4-4-2', assignments: { 0: 'GK1', 1: 'D1' }, bench: ['BN1'],
    onSwapPositions(){}, onCorrect(){}, onBack(){}, ...props,
  })));

describe('LineupEditView', () => {
  it('피치 배치 + 후보 칩 렌더, 크래시 없음', () => {
    const html = render({});
    expect(html).toContain('D1');
    expect(html).toContain('BN1');
    expect(html).not.toContain('NaN');
  });
  it('빈 bench도 안전', () => {
    expect(() => render({ bench: [] })).not.toThrow();
  });
});
