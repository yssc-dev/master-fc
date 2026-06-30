import { describe, it, expect, beforeEach, vi } from 'vitest';
import AuthUtil from '../authUtil';
import { AUTH_STORAGE_KEY } from '../../config/constants';

const TEAMS_KEY = 'masterfc_teams';

// 이 프로젝트 jsdom 설정은 동작하는 localStorage를 제공하지 않으므로 직접 stub (settings.test.js와 동일 패턴)
let _store = {};
const mockLocalStorage = {
  getItem: (k) => _store[k] ?? null,
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  clear: () => { _store = {}; },
};

describe('AuthUtil teams 캐시', () => {
  beforeEach(() => {
    _store = {};
    vi.stubGlobal('localStorage', mockLocalStorage);
  });

  it('saveTeams → getStoredTeams 라운드트립', () => {
    const teams = [
      { team: '하버FC', mode: '축구', role: '관리자' },
      { team: '마스터FC', mode: '풋살', role: '멤버' },
    ];
    AuthUtil.saveTeams(teams);
    expect(AuthUtil.getStoredTeams()).toEqual(teams);
  });

  it('캐시가 없으면 null', () => {
    expect(AuthUtil.getStoredTeams()).toBeNull();
  });

  it('clear()가 auth와 teams 캐시를 모두 제거', () => {
    AuthUtil.save('홍길동', '1234', '하버FC', '축구', '관리자');
    AuthUtil.saveTeams([{ team: '하버FC', mode: '축구', role: '관리자' }]);
    AuthUtil.clear();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(AuthUtil.getStoredTeams()).toBeNull();
  });

  it('만료된 캐시는 null 반환 + 제거', () => {
    localStorage.setItem(TEAMS_KEY, JSON.stringify({ teams: [{ team: 'A' }], timestamp: 0 }));
    expect(AuthUtil.getStoredTeams()).toBeNull();
    expect(localStorage.getItem(TEAMS_KEY)).toBeNull();
  });

  it('손상된 JSON은 null (크래시 없음)', () => {
    localStorage.setItem(TEAMS_KEY, '{not json');
    expect(AuthUtil.getStoredTeams()).toBeNull();
  });
});
