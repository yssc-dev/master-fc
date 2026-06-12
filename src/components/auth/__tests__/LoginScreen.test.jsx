import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('../../../services/appSync', () => ({
  default: { warmup: vi.fn(), verifyAuth: vi.fn() },
}));
vi.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({ mode: 'light', toggle: vi.fn() }),
}));
vi.mock('../../common/icons', () => ({ SunIcon: () => null, MoonIcon: () => null }));

import AppSync from '../../../services/appSync';
import LoginScreen from '../LoginScreen';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount() {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => { root.render(createElement(LoginScreen, { onLogin: vi.fn() })); });
  return { root };
}

beforeEach(() => vi.clearAllMocks());

describe('LoginScreen 프리워밍', () => {
  it('마운트 시 Apps Script를 미리 깨운다(콜드스타트를 입력 시간과 겹치게)', () => {
    mount();
    expect(AppSync.warmup).toHaveBeenCalledTimes(1);
  });
});
