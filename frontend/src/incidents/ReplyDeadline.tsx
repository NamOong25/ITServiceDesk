import { dateFormat, type ReplySla } from './api';

const weekday = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
});

const clockTime = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
});

function feedback({ state, minutes }: ReplySla) {
  switch (state) {
    case 'ON_TIME': return minutes ? 'Đúng hạn · Sớm ' + minutes + ' phút' : 'Đúng hạn';
    case 'LATE': return minutes ? 'Phản hồi muộn ' + minutes + ' phút' : 'Phản hồi muộn';
    case 'OVERDUE': return minutes ? 'Quá hạn ' + minutes + ' phút' : 'Quá hạn';
    case 'DUE_SOON':
    case 'PENDING': return minutes ? 'Còn ' + minutes + ' phút' : 'Đến hạn';
  }
}

export function ReplyDeadline({ sla, detailed = false }: { sla: ReplySla; detailed?: boolean }) {
  const deadline = new Date(sla.dueAt);
  const firstReply = sla.firstReplyAt ? new Date(sla.firstReplyAt) : null;
  if (!detailed) {
    return <div className="sla-queue" data-sla={sla.state}>
      <time dateTime={sla.firstReplyAt ?? sla.dueAt}>
        {weekday.format(firstReply ?? deadline)}
      </time>
      <small>{firstReply && sla.state === 'ON_TIME' && 'Đã phản hồi · '}{feedback(sla)}</small>
    </div>;
  }

  return (
    <section className="it-sla" data-sla={sla.state}>
      <h3>Hạn phản hồi đầu tiên</h3>
      <dl>
        <div><dt>Hạn phải phản hồi</dt><dd><time dateTime={sla.dueAt}>{dateFormat.format(deadline)}</time></dd></div>
        <div><dt>Phản hồi đầu tiên</dt><dd>{firstReply
          ? <time dateTime={sla.firstReplyAt!}>{dateFormat.format(firstReply)}</time> : 'Chưa có'}</dd></div>
      </dl>
      <span className="sla-badge">{feedback(sla)}</span>
      <details className="sla-calculation">
        <summary>Cách tính hạn</summary>
        <p>2 giờ làm việc, từ 08:00 đến 17:00, thứ Hai đến thứ Sáu, theo giờ Việt Nam.</p>
        <ul>{sla.periods.map((period) => (
          <li key={period.start}>
            {weekday.format(new Date(period.start))} → {clockTime.format(new Date(period.end))}
          </li>
        ))}</ul>
        <p>Đồng hồ chỉ dừng khi IT gửi phản hồi công khai đầu tiên cho nhân viên.</p>
      </details>
    </section>
  );
}
