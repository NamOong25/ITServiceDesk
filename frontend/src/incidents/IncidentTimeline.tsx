import { dateFormat, type Activity } from './api';

const labels = {
  ASSIGNED: 'Đã nhận xử lý',
  PUBLIC_REPLY: 'Phản hồi từ IT',
  INTERNAL_NOTE: 'Ghi chú nội bộ',
  RESOLVED: 'Đã giải quyết',
};

export function IncidentTimeline({ createdAt, activity, employee = false }: {
  createdAt: string; activity: Activity[]; employee?: boolean;
}) {
  return (
    <section className="incident-card incident-timeline">
      <h2>Hoạt động</h2>
      <div className="incident-event">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>{employee ? 'Bạn đã gửi yêu cầu' : 'Nhân viên đã gửi yêu cầu'}</strong>
          <time dateTime={createdAt}>{dateFormat.format(new Date(createdAt))}</time>
        </div>
      </div>
      {activity.map((item) => (
        <div key={item.id} className={'incident-event' + (item.kind === 'INTERNAL_NOTE' ? ' internal-event' : '')}>
          <span aria-hidden="true">{item.body ? '↳' : '✓'}</span>
          <div>
            <strong>{labels[item.kind]}</strong>
            <div className="incident-actor">{item.actor}</div>
            <time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time>
            {item.body && <p className="incident-description">{item.body}</p>}
          </div>
        </div>
      ))}
    </section>
  );
}
