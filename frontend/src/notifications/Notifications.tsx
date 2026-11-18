import { useEffect, useRef, useState } from 'react';
import { postWithCsrf } from '../auth';
import { dateFormat, ticketCode } from '../incidents/api';
import './notifications.css';

const labels = {
  WAIT_REQUESTED: 'IT cần bạn bổ sung thông tin',
  RESOLVED: 'IT đã đánh dấu sự cố là đã giải quyết',
  TRANSFERRED: 'Bạn được bàn giao sự cố',
  REQUESTER_REPLY: 'Nhân viên đã phản hồi sự cố đang chờ',
  ACCESS_SUBMITTED: 'Yêu cầu cấp quyền mới cần duyệt',
  ACCESS_APPROVED: 'Yêu cầu cấp quyền đã được duyệt',
  ACCESS_REJECTED: 'Yêu cầu cấp quyền đã bị từ chối',
} as const;

type NotificationKind = keyof typeof labels;
type NotificationItem = {
  id: number;
  kind: NotificationKind;
  resourceId: number;
  title: string;
  createdAt: string;
  unread: boolean;
};
type Inbox = { unreadCount: number; items: NotificationItem[]; nextBefore: number | null };
const inboxPath = '/api/notifications';

function target(item: NotificationItem) {
  switch (item.kind) {
    case 'TRANSFERRED':
    case 'REQUESTER_REPLY':
      return { href: '/it/incidents/' + item.resourceId, code: ticketCode(item.resourceId) };
    case 'WAIT_REQUESTED':
    case 'RESOLVED':
      return { href: '/requests/' + item.resourceId, code: ticketCode(item.resourceId) };
    default:
      return { href: '/access-requests/' + item.resourceId, code: 'AC-' + item.resourceId };
  }
}

export function Notifications() {
  const [open, setOpen] = useState(false);
  const [before, setBefore] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<{ before: number | null; inbox: Inbox } | null>(null);
  const [error, setError] = useState(false);
  const [openError, setOpenError] = useState('');
  const [opening, setOpening] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const area = useRef<HTMLDivElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const inbox = loaded?.before === before ? loaded.inbox : null;
  const unread = loaded?.inbox.unreadCount ?? 0;

  useEffect(() => {
    let request: AbortController | undefined;
    async function refresh() {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch(inboxPath + (before === null ? '' : '?before=' + before), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const inbox: Inbox = await response.json();
        if (!controller.signal.aborted) {
          setLoaded({ before, inbox });
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 30_000);
    window.addEventListener('focus', refresh);
    return () => {
      request?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [before, attempt]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !area.current?.contains(event.target)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        bell.current?.focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  function showPage(cursor: number | null) {
    setError(false);
    setOpenError('');
    setBefore(cursor);
  }

  function toggle() {
    if (!open) {
      showPage(null);
      setAttempt((current) => current + 1);
    }
    setOpen(!open);
  }

  async function visit(item: NotificationItem) {
    if (opening !== null) return;
    setOpening(item.id);
    setOpenError('');
    try {
      if (item.unread) {
        const response = await postWithCsrf(inboxPath + '/' + item.id + '/read');
        if (!response.ok) throw new Error();
        setLoaded((current) => {
          if (!current?.inbox.items.some((row) => row.id === item.id && row.unread)) return current;
          return { ...current, inbox: {
            ...current.inbox,
            unreadCount: Math.max(0, current.inbox.unreadCount - 1),
            items: current.inbox.items.map((row) => row.id === item.id ? { ...row, unread: false } : row),
          } };
        });
      }
      setOpening(null);
      setOpen(false);
      window.location.assign(target(item).href);
    } catch {
      setOpenError('Chưa mở được thông báo. Vui lòng thử lại.');
      setOpening(null);
    }
  }

  return <div className="notifications" ref={area}>
    <button ref={bell} type="button" className="secondary notifications-bell" onClick={toggle}
      aria-label={unread ? 'Thông báo, ' + unread + ' chưa đọc' : 'Thông báo'}
      aria-expanded={open} aria-controls={open ? 'notifications-panel' : undefined}>
      <span className="notifications-bell-icon" aria-hidden="true" />
      {unread > 0 && <span className="notifications-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <section id="notifications-panel" className="notifications-panel" aria-labelledby="notifications-title">
      <header className="notifications-heading">
        <h2 id="notifications-title">Thông báo</h2><p>{unread} chưa đọc</p>
      </header>
      {error && <div className="notifications-feedback">
        <p role="alert">Chưa tải được thông báo.</p>
        <button className="secondary" type="button" onClick={() => {
          setError(false);
          setAttempt((current) => current + 1);
        }}>Thử lại</button>
      </div>}
      {openError && <p className="notifications-feedback" role="alert">{openError}</p>}
      {inbox && inbox.items.length > 0 && <ul className="notifications-items" role="list">
        {inbox.items.map((item) => <li key={item.id}>
          <button type="button" className="notifications-item" data-kind={item.kind} data-unread={item.unread}
            disabled={opening !== null} onClick={() => void visit(item)}>
            <strong>{labels[item.kind]}</strong>
            <span>{target(item).code} · {item.title}</span>
            <time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time>
            {item.unread && <span className="notifications-unread-label">Chưa đọc</span>}
          </button>
        </li>)}
      </ul>}
      {!error && (inbox ? inbox.items.length === 0 && <p className="notifications-feedback">Chưa có thông báo.</p>
        : <p className="notifications-feedback" role="status">Đang tải thông báo…</p>)}
      {(before !== null || (inbox && inbox.nextBefore !== null)) && <footer className="notifications-pages">
        {before !== null && <button type="button" className="secondary" onClick={() => showPage(null)}>Mới nhất</button>}
        {inbox && inbox.nextBefore !== null && <button type="button" className="secondary"
          onClick={() => showPage(inbox.nextBefore)}>Xem cũ hơn</button>}
      </footer>}
    </section>}
  </div>;
}
