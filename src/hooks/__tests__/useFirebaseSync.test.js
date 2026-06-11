import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('../../services/firebaseSync', () => ({
  default: {
    subscribe: vi.fn(() => () => {}),
    syncDiff: vi.fn(async () => 1),
  },
}));

import FirebaseSync from '../../services/firebaseSync';
import { useFirebaseSync } from '../useFirebaseSync';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ onApi, teamContext, gameId, authUser, dispatch, setSyncStatus }) {
  const api = useFirebaseSync({ teamContext, gameId, authUser, dispatch, setSyncStatus });
  onApi(api);
  return null;
}

function mount(props) {
  const container = document.createElement('div');
  const root = createRoot(container);
  let api = null;
  act(() => {
    root.render(createElement(Harness, { ...props, onApi: (a) => { api = a; } }));
  });
  return { root, getApi: () => api };
}

const baseProps = () => ({
  teamContext: { team: '마스터FC' },
  gameId: 'g_1',
  authUser: { name: '홍길동' },
  dispatch: vi.fn(),
  setSyncStatus: vi.fn(),
});

describe('useFirebaseSync — 풋살/축구 공용 동기화 인프라', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('마운트 시 팀/게임ID로 구독을 등록한다', () => {
    const props = baseProps();
    mount(props);
    expect(FirebaseSync.subscribe).toHaveBeenCalledTimes(1);
    expect(FirebaseSync.subscribe.mock.calls[0][0]).toBe('마스터FC');
    expect(FirebaseSync.subscribe.mock.calls[0][1]).toBe('g_1');
  });

  it('다른 편집자의 원격 업데이트는 RESTORE_STATE로 dispatch되고 베이스라인이 갱신된다', () => {
    const props = baseProps();
    const { getApi } = mount(props);
    const callback = FirebaseSync.subscribe.mock.calls[0][2];
    const remote = { phase: 'match', attendees: ['A'] };
    act(() => {
      callback(remote, { updatedAt: Date.now(), lastEditor: '딴사람#zzz' });
    });
    expect(props.dispatch).toHaveBeenCalledWith({ type: 'RESTORE_STATE', state: remote });
    expect(getApi().lastSyncedStateRef.current).toBe(remote);
  });

  it('자기 태그의 최근 write는 echo로 무시된다', () => {
    const props = baseProps();
    const { getApi } = mount(props);
    const callback = FirebaseSync.subscribe.mock.calls[0][2];
    act(() => {
      callback({ phase: 'match' }, { updatedAt: Date.now(), lastEditor: getApi().editorTag });
    });
    expect(props.dispatch).not.toHaveBeenCalled();
  });

  it('updatedAt 없는 자기 태그 write도 echo로 무시된다 (레거시/복구 노드)', () => {
    const props = baseProps();
    const { getApi } = mount(props);
    const callback = FirebaseSync.subscribe.mock.calls[0][2];
    act(() => {
      callback({ phase: 'match' }, { lastEditor: getApi().editorTag });
    });
    expect(props.dispatch).not.toHaveBeenCalled();
  });

  it('autoSync는 300ms 디바운스 후 syncDiff를 호출하고 베이스라인을 넘긴다', async () => {
    vi.useFakeTimers();
    const props = baseProps();
    const { getApi } = mount(props);
    const s1 = { phase: 'match', gks: { 0: 'A' } };
    const s2 = { phase: 'match', gks: { 0: 'B' } };

    act(() => { getApi().autoSync(s1); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(FirebaseSync.syncDiff).toHaveBeenCalledTimes(1);
    expect(FirebaseSync.syncDiff.mock.calls[0]).toEqual(['마스터FC', 'g_1', null, s1]);

    act(() => { getApi().autoSync(s2); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(FirebaseSync.syncDiff).toHaveBeenCalledTimes(2);
    // 두 번째 diff 의 prev 는 첫 번째로 저장한 state
    expect(FirebaseSync.syncDiff.mock.calls[1]).toEqual(['마스터FC', 'g_1', s1, s2]);
  });

  it('디바운스 내 연속 호출은 마지막 state만 저장한다', async () => {
    vi.useFakeTimers();
    const props = baseProps();
    const { getApi } = mount(props);
    act(() => { getApi().autoSync({ v: 1 }); });
    act(() => { getApi().autoSync({ v: 2 }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(FirebaseSync.syncDiff).toHaveBeenCalledTimes(1);
    expect(FirebaseSync.syncDiff.mock.calls[0][3]).toEqual({ v: 2 });
  });

  it('원격 RESTORE 직후 500ms 동안 autoSync는 무시된다 (re-push 루프 방지)', async () => {
    vi.useFakeTimers();
    const props = baseProps();
    const { getApi } = mount(props);
    const callback = FirebaseSync.subscribe.mock.calls[0][2];
    act(() => {
      callback({ phase: 'match' }, { updatedAt: Date.now(), lastEditor: '딴사람#zzz' });
    });
    act(() => { getApi().autoSync({ v: 1 }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(FirebaseSync.syncDiff).not.toHaveBeenCalled();
  });
});
