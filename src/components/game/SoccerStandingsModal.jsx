import Modal from '../common/Modal';
import SoccerStandingsTable from './SoccerStandingsTable';

// 축구 팀순위: 상대별 전적 표(우리팀 기준) + 합계 행
export default function SoccerStandingsModal({ records, total, onClose, styles: s }) {
  return (
    <Modal onClose={onClose} title="팀 순위 (상대별 전적)">
      <SoccerStandingsTable records={records} total={total} styles={s} />
    </Modal>
  );
}
