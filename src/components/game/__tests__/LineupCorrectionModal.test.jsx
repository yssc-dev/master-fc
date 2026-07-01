import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import LineupCorrectionModal from '../LineupCorrectionModal';

// jsdom은 matchMedia 미구현 — renderToStaticMarkup 경로에서 Modal이 호출하므로 stub
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

const render = (props) => renderToStaticMarkup(
  createElement(ThemeProvider, null, createElement(LineupCorrectionModal, { onCorrect: () => {}, onClose: () => {}, ...props }))
);

describe('LineupCorrectionModal', () => {
  it('출전/미출전 선수를 렌더하고 크래시하지 않는다', () => {
    const html = render({ played: ['장치광', 'GK1'], bench: ['장주성', 'BN1'] });
    expect(html).toContain('장치광');
    expect(html).toContain('선발 정정');
    expect(html).not.toContain('NaN');
  });
  it('빈 목록도 안전', () => {
    expect(render({ played: [], bench: [] })).toContain('출전 선수 없음');
  });
});
