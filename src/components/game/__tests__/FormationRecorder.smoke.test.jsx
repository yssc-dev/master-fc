import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import FormationRecorder from '../FormationRecorder';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

const render = (props) => renderToStaticMarkup(createElement(ThemeProvider, null,
  createElement(FormationRecorder, {
    formation: '4-4-2', assignments: { 0: 'GK1', 1: 'D1' }, positionMap: { GK1: 'GK', D1: 'DF' },
    subs: ['BN1'], gk: 'GK1', opponent: '상대', startedAt: 1, events: [],
    onAddEvent(){}, onDeleteEvent(){}, onFinishMatch(){}, onStateChange(){}, onFlowActiveChange(){}, ...props,
  })));

describe('FormationRecorder 렌더 스모크', () => {
  it('크래시 없이 렌더', () => {
    const html = render({});
    expect(html).toContain('D1');
    expect(html).not.toContain('NaN');
  });
});
