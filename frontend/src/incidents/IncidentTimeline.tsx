import type { ReactNode } from 'react';
import { dateFormat, type Activity } from './api';

const labels = {
  ASSIGNED: 'Đã nhận xử lý',
  PUBLIC_REPLY: 'Phản hồi từ IT',
  REQUESTER_REPLY: 'Phản hồi từ nhân viên',
  INTERNAL_NOTE: 'Ghi chú nội bộ',
  RESOLVED: 'Đã giải quyết',
};

export function IncidentTimeline({ createdAt, activity, employee = false, children }: {
  createdAt: string; activity: Activity[]; employee?: boolean; children?: ReactNode;
}) {
  const firstReplyId = activity.find((item) => item.kind === 'PUBLIC_REPLY')?.id;
  return (
    <section className="incident-card incident-timeline">
      <h2>Hoạt động và trao đổi</h2>
      <div className="incident-event">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>{employee ? 'Bạn đã gửi yêu cầu' : 'Nhân viên đã gửi yêu cầu'}</strong>
          <time dateTime={createdAt}>{dateFormat.format(new Date(createdAt))}</time>
        </div>
      </div>
      {activity.map((item) => {
        const publicMessage = item.kind === 'PUBLIC_REPLY' || item.kind === 'REQUESTER_REPLY';
        const label = item.id === firstReplyId ? 'Phản hồi đầu tiên từ IT'
          : item.kind === 'REQUESTER_REPLY' && employee ? 'Bạn đã phản hồi' : labels[item.kind];

        return <div key={item.id} className="incident-event" data-kind={item.kind}>
          <span aria-hidden="true">{item.body ? '↳' : '✓'}</span>
          <div className={publicMessage ? 'incident-message' : undefined}>
            <strong>{label}</strong>
            {!(employee && item.kind === 'REQUESTER_REPLY') && <div className="incident-actor">{item.actor}</div>}
            <time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time>
            {item.body && <p className="incident-description">{item.body}</p>}
          </div>
        </div>;
      })}
      {children}
    </section>
  );
}
