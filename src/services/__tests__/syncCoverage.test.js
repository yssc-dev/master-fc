import { describe, it, expect } from 'vitest';
import {
  META_FIELDS, WHOLE_REPLACE_FIELDS, CHILD_NODE_FIELDS, LOCAL_ONLY_FIELDS,
} from '../firebaseSyncDiff';
import { initialState } from '../../hooks/useGameReducer';

// 재발 방지 가드: 멀티유저 실시간 공유돼야 하는 reducer state가 동기화 목록에서 누락되는 버그
// (CourtRecorder GK, 자유대진 freeCourtMatches 등 "공유돼야 하는데 안 됐던" 케이스)를 막는다.
// 새 state 필드를 추가하면 반드시 아래 4분류 중 하나에 넣어야 테스트가 통과한다.
//   - META_FIELDS         : meta/{f} 단일값 동기화
//   - WHOLE_REPLACE_FIELDS : 통째 교체 동기화
//   - CHILD_NODE_FIELDS    : 자식 노드 단위 diff 동기화
//   - LOCAL_ONLY_FIELDS    : 동기화 안 함(로컬 UI/임시/참조)
describe('sync coverage 가드 (initialState ↔ 동기화 분류)', () => {
  const classified = [
    ...META_FIELDS, ...WHOLE_REPLACE_FIELDS, ...CHILD_NODE_FIELDS, ...LOCAL_ONLY_FIELDS,
  ];
  const classifiedSet = new Set(classified);

  it('initialState 의 모든 필드는 4분류 중 하나에 속해야 한다 (미분류 = 새 공유필드 동기화 누락 위험)', () => {
    const unclassified = Object.keys(initialState).filter(k => !classifiedSet.has(k));
    // 실패 시: 새로 추가한 필드를 META/WHOLE_REPLACE/CHILD_NODE(공유) 또는 LOCAL_ONLY(비공유)에 분류하라.
    expect(unclassified).toEqual([]);
  });

  it('동기화 대상으로 분류한 필드(WHOLE_REPLACE/CHILD_NODE/LOCAL_ONLY)는 실제 initialState 에 존재해야 한다 (오타/삭제 감지)', () => {
    const stale = [...WHOLE_REPLACE_FIELDS, ...CHILD_NODE_FIELDS, ...LOCAL_ONLY_FIELDS]
      .filter(f => !(f in initialState));
    expect(stale).toEqual([]);
  });

  it('한 필드가 동기화 분류와 LOCAL_ONLY 에 동시에 들어있으면 안 된다', () => {
    const syncedSet = new Set([...META_FIELDS, ...WHOLE_REPLACE_FIELDS, ...CHILD_NODE_FIELDS]);
    const overlap = LOCAL_ONLY_FIELDS.filter(f => syncedSet.has(f));
    expect(overlap).toEqual([]);
  });
});
