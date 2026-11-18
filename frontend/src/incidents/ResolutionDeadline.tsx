import { dateFormat, type ResolutionSla } from './api';

export const resolutionLabels = {
  ACTIVE: 'Đang tính giờ',
  PAUSED: 'Đang tạm dừng',
  OVERDUE: 'Quá hạn giải quyết',
  ON_TIME: 'Giải quyết đúng hạn',
  LATE: 'Giải quyết trễ hạn',
} as const;

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours === 0 ? rest + ' phút' : hours + ' giờ' + (rest ? ' ' + rest + ' phút' : '');
}

export function ResolutionDeadline({ sla }: { sla: ResolutionSla }) {
  const lateMinutes = sla.usedMinutes - sla.targetMinutes;
  return <section className="it-sla" data-sla={sla.state}>
    <h3>Hạn giải quyết</h3>
    <span className="sla-badge">{resolutionLabels[sla.state]}</span>
    <dl>
      <div><dt>Thời lượng theo ưu tiên ban đầu</dt><dd>{duration(sla.targetMinutes)}</dd></div>
      <div><dt>Đã tính</dt><dd>{duration(sla.usedMinutes)}</dd></div>
      {!sla.resolvedAt && lateMinutes <= 0 && <div><dt>Còn lại</dt><dd>{duration(sla.remainingMinutes)}</dd></div>}
      {lateMinutes > 0 && <div><dt>Vượt hạn</dt><dd>{duration(lateMinutes)}</dd></div>}
      {sla.dueAt && <div><dt>Hạn phải giải quyết</dt>
        <dd><time dateTime={sla.dueAt}>{dateFormat.format(new Date(sla.dueAt))}</time></dd></div>}
      {sla.resolvedAt && <div><dt>Đã giải quyết lúc</dt>
        <dd><time dateTime={sla.resolvedAt}>{dateFormat.format(new Date(sla.resolvedAt))}</time></dd></div>}
    </dl>
    {sla.state === 'PAUSED' && <p className="sla-calculation">Đồng hồ chạy tiếp khi nhân viên trả lời.</p>}
  </section>;
}
