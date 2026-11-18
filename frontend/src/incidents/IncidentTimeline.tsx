import type { ReactNode } from 'react';
import { dateFormat, isPublicIncidentMessage, type Activity, type IncidentAttachment } from './api';
import { AttachmentList } from './Attachments';

const labels = {
  ASSIGNED: 'Đã nhận xử lý',
  TRANSFERRED: 'Đã bàn giao sự cố',
  PUBLIC_REPLY: 'Phản hồi từ IT',
  WAIT_REQUESTED: 'IT yêu cầu bổ sung thông tin',
  REQUESTER_REPLY: 'Phản hồi từ nhân viên',
  INTERNAL_NOTE: 'Ghi chú nội bộ',
  RESOLVED: 'IT đã đánh dấu sự cố là đã giải quyết',
  CONFIRMED: 'Nhân viên xác nhận đã khắc phục',
  REOPENED: 'Nhân viên đã mở lại sự cố',
};

const requesterLabels = {
  REQUESTER_REPLY: 'Bạn đã phản hồi',
  CONFIRMED: 'Bạn đã xác nhận khắc phục',
  REOPENED: 'Bạn đã mở lại sự cố',
} as const;

export function IncidentTimeline({ createdAt, activity, employee = false, children, attachments }: {
  createdAt: string; activity: Activity[]; employee?: boolean; children?: ReactNode;
  attachments?: { incidentId: number; files?: IncidentAttachment[]; staff?: boolean };
}) {
  const firstReplyId = activity.find((item) => item.kind === 'PUBLIC_REPLY' || item.kind === 'WAIT_REQUESTED')?.id;
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
        const { kind } = item;
        const fromRequester = kind === 'REQUESTER_REPLY' || kind === 'CONFIRMED' || kind === 'REOPENED';
        const label = kind === 'PUBLIC_REPLY' && item.id === firstReplyId ? 'Phản hồi đầu tiên từ IT'
          : fromRequester && employee ? requesterLabels[kind] : labels[kind];

        return <div key={item.id} className="incident-event" data-kind={item.kind}>
          <span aria-hidden="true">{item.body ? '↳' : '✓'}</span>
          <div className={isPublicIncidentMessage(item.kind) ? 'incident-message' : undefined}>
            <strong>{label}</strong>
            {item.recipient
              ? <div className="incident-actor">{item.actor} → {item.recipient}</div>
              : !(employee && fromRequester) && <div className="incident-actor">{item.actor}</div>}
            <time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time>
            {item.body && <p className="incident-description">{item.body}</p>}
            {attachments && <AttachmentList incidentId={attachments.incidentId} staff={attachments.staff}
              files={attachments.files?.filter((file) => file.activityId === item.id)} />}
          </div>
        </div>;
      })}
      {children}
    </section>
  );
}
