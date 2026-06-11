import { useRef, useEffect, useCallback } from 'react';
import FirebaseSync from '../services/firebaseSync';

// 풋살(App.jsx)/축구(SoccerApp.jsx) 공용 RTDB 자동저장+구독 인프라.
// 두 앱에 글자 단위로 복제돼 있던 블록을 단일화 — "한쪽만 고치는 버그" 재발 방지.
//
// 책임 분담:
// - 이 훅: 탭 단위 editorTag 생성, 300ms 디바운스 자동저장(diff), 구독 + echo 방지,
//   원격 RESTORE 직후 500ms 재push 잠금, diff 베이스라인(lastSyncedStateRef) 관리.
// - 호출부: gameState 구성(lastEditor: editorTag 포함), autoSync(gameState) 트리거
//   (모드별로 감시하는 state 키가 다르므로 deps는 호출부 책임), 마감 시
//   lastSyncedStateRef 직접 갱신.
// 탭 단위 고유 ID — 같은 사용자가 멀티탭일 때 echo 판별용 (이름만으론 구분 불가).
// 모듈 스코프라 페이지 로드당 1회 생성 — 같은 탭에서 모드 전환해도 동일 태그 유지.
const TAB_SESSION_ID = Math.random().toString(36).slice(2, 10);

export function useFirebaseSync({ teamContext, gameId, authUser, dispatch, setSyncStatus }) {
  const saveTimerRef = useRef(null);
  const isSyncingRef = useRef(false);
  const lastSyncedStateRef = useRef(null);
  const editorTag = `${authUser?.name || "알 수 없음"}#${TAB_SESSION_ID}`;

  // 변경된 노드만 diff 해서 RTDB update. 동시 편집자끼리 다른 노드를 동시에 써도 안전.
  const autoSync = useCallback((gameState) => {
    if (isSyncingRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSyncStatus('saving');
      const team = teamContext?.team || "";
      try {
        const written = await FirebaseSync.syncDiff(team, gameId || "legacy", lastSyncedStateRef.current, gameState);
        lastSyncedStateRef.current = gameState;
        if (written > 0) {
          setSyncStatus('saved');
          setTimeout(() => setSyncStatus(''), 2000);
        } else {
          setSyncStatus('');
        }
      } catch (e) {
        console.warn("자동저장 실패:", e.message);
        setSyncStatus('error');
      }
    }, 300);
  }, [teamContext, gameId, setSyncStatus]);

  // Firebase 노드별 구독 — 어떤 자식이라도 바뀌면 재조립된 state 가 콜백으로 옴.
  const lastRemoteUpdateRef = useRef(0);
  useEffect(() => {
    const team = teamContext?.team;
    if (!team) return;
    const gid = gameId || "legacy";
    const unsub = FirebaseSync.subscribe(team, gid, (remoteState, meta) => {
      if (!remoteState) return;
      // 자기 변경 echo 무시 — 탭 단위 ID 비교 (같은 사용자 멀티탭 구분 위해)
      // updatedAt 없는 노드(레거시/복구 직후)도 자기 태그면 echo로 간주 — stale 덮어쓰기 방지
      if (meta?.lastEditor === editorTag) {
        if (!meta?.updatedAt || Math.abs(Date.now() - meta.updatedAt) < 1500) return;
      }
      // 같은 updatedAt 재방송 무시
      if (meta?.updatedAt && meta.updatedAt <= lastRemoteUpdateRef.current) return;
      lastRemoteUpdateRef.current = meta?.updatedAt || Date.now();
      isSyncingRef.current = true;
      dispatch({ type: 'RESTORE_STATE', state: remoteState });
      // 원격 state 를 베이스라인으로 잡아 다음 diff 의 prev 로 사용 (echo 방지)
      lastSyncedStateRef.current = remoteState;
      setTimeout(() => { isSyncingRef.current = false; }, 500);
    });
    return unsub;
  }, [teamContext?.team, editorTag, gameId, dispatch]);

  // 마감처럼 직접 syncDiff/clearState 하는 경로에서 호출 — 펜딩 디바운스 타이머가
  // 이후에 stale state를 다시 쓰는 레이스 방지.
  const cancelPendingSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  return { editorTag, autoSync, lastSyncedStateRef, isSyncingRef, cancelPendingSave };
}
