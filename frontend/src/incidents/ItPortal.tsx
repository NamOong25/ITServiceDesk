import { useEffect, useRef, useState, type FormEvent } from 'react';
import { categories, dateFormat, getItIncident, impacts, listItIncidents, sendItUpdate,
  statusLabels, ticketCode, type ItDetail, type QueueItem, type IncidentStatus } from './api';
import { IncidentTimeline } from './IncidentTimeline';
import { ReplyDeadline } from './ReplyDeadline';
import './employee.css';
import './it.css';

type MessageKind = 'PUBLIC_REPLY' | 'INTERNAL_NOTE';
type Action = 'claim' | 'resolve' | 'messages';

function activeIncident() {
  const match = /^\/it\/incidents\/([1-9][0-9]*)$/.exec(window.location.pathname);
  const id = match ? Number(match[1]) : null;
  return Number.isSafeInteger(id) ? id : null;
}

function Status({ status }: { status: IncidentStatus }) {
  return <span className="incident-pill" data-status={status}>{statusLabels[status]}</span>;
}

function Queue({ items, open }: { items: QueueItem[]; open: (id: number) => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const term = search.trim().toLocaleLowerCase('vi-VN');
  const matches = items.filter((item) => (!filter || filter === item.status) &&
    [ticketCode(item.id), item.title].some((part) => part.toLocaleLowerCase('vi-VN').includes(term)));

  return <>
    <h1>Hàng đợi IT</h1>
    <p className="incident-intro">Tiếp nhận sự cố và theo dõi hạn phản hồi đầu tiên.</p>
    <div className="it-metrics">
      {[
        ['OVERDUE', 'Quá hạn phản hồi', 'Chưa có phản hồi đầu tiên', '!', 'overdue'],
        ['DUE_SOON', 'Sắp đến hạn', 'Trong 30 phút làm việc', '◷', 'waiting'],
        ['ON_TIME', 'Đã phản hồi đúng hạn', 'Theo phản hồi đầu tiên', '✓', 'success'],
      ].map(([key, label, hint, icon, tone]) => <div className="incident-card it-metric" key={key}>
        <span className={'it-metric-icon ' + tone} aria-hidden="true">{icon}</span>
        <div><span>{label}</span><strong>{items.filter((item) => item.sla.state === key).length}</strong>
          <small>{hint}</small></div>
      </div>)}
    </div>
    <section className="incident-card it-list">
      <div className="it-list-heading"><div><h2>Danh sách sự cố</h2>
        <p>{items.length} yêu cầu trong hàng đợi</p></div></div>
      <div className="it-filters">
        <div>
          <label htmlFor="it-search">Tìm mã hoặc tiêu đề</label>
          <input id="it-search" type="search" placeholder="Tìm theo mã hoặc tiêu đề" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label htmlFor="it-status">Trạng thái</label>
          <select id="it-status" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
      </div>
      {matches.length === 0 ? <p className="incident-intro it-empty">{items.length
        ? 'Không có sự cố khớp bộ lọc.' : 'Chưa có sự cố nào.'}</p> : <div className="it-table-scroll">
        <table>
          <thead><tr><th>Yêu cầu</th><th>Nhóm sự cố / Ảnh hưởng</th><th>Trạng thái</th><th>Người xử lý</th><th>Hạn / phản hồi đầu tiên</th></tr></thead>
          <tbody>{matches.map((item) => <tr key={item.id}>
            <td><button type="button" className="it-ticket-link" onClick={() => open(item.id)}>
              <span className="incident-code">{ticketCode(item.id)}</span><strong>{item.title}</strong>
            </button><small>{item.requester}</small></td>
            <td>{categories[item.category]}<small>{impacts[item.impact]}</small></td>
            <td><Status status={item.status} /></td>
            <td>{item.assignee ?? 'Chưa phân công'}</td>
            <td><ReplyDeadline sla={item.sla} /></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </>;
}

function ItIncident({ detail, email, refresh }: { detail: ItDetail; email: string; refresh: () => void }) {
  const { ticket, activity } = detail;
  const [kind, setKind] = useState<MessageKind>('PUBLIC_REPLY');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Action | null>(null);
  const submission = useRef<string | null>(null);
  const active = useRef(false);
  const mine = ticket.status === 'IN_PROGRESS' && ticket.assignee === email;
  const isNote = kind === 'INTERNAL_NOTE';

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  function choose(next: MessageKind) {
    if (next === kind) return;
    setKind(next);
    setBody('');
    setError('');
    submission.current = null;
  }

  async function act(action: Action) {
    if (pending) return;
    const text = body.trim();
    if (action === 'messages' && !text) {
      setError('Nhập nội dung trước khi gửi.');
      return;
    }
    setPending(action);
    setError('');
    setMessage('');
    try {
      const payload = action === 'messages'
        ? { kind, body: text, submissionKey: submission.current ??= crypto.randomUUID() }
        : undefined;
      await sendItUpdate(ticket.id, action, payload);
      if (!active.current) return;
      if (action === 'messages') {
        setBody('');
        submission.current = null;
      }
      setMessage(action === 'claim' ? 'Bạn đã nhận xử lý sự cố.'
        : action === 'resolve' ? 'Đã đánh dấu sự cố là đã giải quyết.'
          : isNote ? 'Đã lưu ghi chú nội bộ.' : 'Đã gửi phản hồi cho nhân viên.');
      refresh();
    } catch (failure) {
      if (active.current) setError(failure instanceof TypeError ? 'Mất kết nối. Vui lòng thử lại.'
        : failure instanceof Error ? failure.message : 'Chưa cập nhật được sự cố.');
    } finally {
      if (active.current) setPending(null);
    }
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void act('messages');
  }

  return <>
    <div className="incident-heading">
      <div>
        <p className="incident-code">{ticketCode(ticket.id)} · Báo sự cố</p>
        <h1>{ticket.title}</h1>
        <p className="incident-intro">{ticket.requester} · {dateFormat.format(new Date(ticket.createdAt))}</p>
      </div>
      <Status status={ticket.status} />
    </div>
    <div className="incident-layout it-detail">
      <div>
        <article className="incident-card">
          <h2>Mô tả sự cố</h2><p className="incident-description">{ticket.description}</p>
        </article>
        <IncidentTimeline createdAt={ticket.createdAt} activity={activity} />
        {mine && <form className="incident-card it-composer" onSubmit={send}>
          <div className="it-composer-tabs" role="group" aria-label="Loại nội dung">
            <button type="button" aria-pressed={!isNote} disabled={!!pending}
              onClick={() => choose('PUBLIC_REPLY')}>Trả lời nhân viên</button>
            <button type="button" aria-pressed={isNote} disabled={!!pending}
              onClick={() => choose('INTERNAL_NOTE')}>Ghi chú nội bộ</button>
          </div>
          {isNote && <p className="it-internal-hint">Chỉ đội IT thấy nội dung này.</p>}
          <label htmlFor="it-message">{isNote ? 'Nội dung ghi chú nội bộ' : 'Nội dung phản hồi'}</label>
          <textarea id="it-message" rows={3} maxLength={4000} value={body} disabled={!!pending}
            onChange={(event) => { setBody(event.target.value); submission.current = null; }} />
          <div className="incident-actions">
            <button className="incident-primary" type="submit" disabled={!!pending}>
              {pending === 'messages' ? 'Đang lưu…' : isNote ? 'Lưu ghi chú' : 'Gửi phản hồi'}
            </button>
          </div>
        </form>}
      </div>
      <aside className="incident-card">
        <h2>Thông tin xử lý</h2>
        <dl>
          <div><dt>Trạng thái</dt><dd><Status status={ticket.status} /></dd></div>
          <div><dt>Người xử lý</dt><dd>{ticket.assignee ?? 'Chưa phân công'}</dd></div>
          <div><dt>Nhóm sự cố</dt><dd>{categories[ticket.category]}</dd></div>
          <div><dt>Ảnh hưởng</dt><dd>{impacts[ticket.impact]}</dd></div>
        </dl>
        <ReplyDeadline sla={detail.sla} detailed />
        {ticket.status === 'NEW' && <button className="incident-primary it-side-action" type="button"
          disabled={!!pending} onClick={() => void act('claim')}>{pending === 'claim' ? 'Đang nhận…' : 'Nhận xử lý'}</button>}
        {mine && <button className="secondary it-side-action" type="button" disabled={!!pending}
          onClick={() => void act('resolve')}>{pending === 'resolve' ? 'Đang cập nhật…' : 'Đánh dấu đã giải quyết'}</button>}
        {message && <p className="incident-success" role="status">{message}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </aside>
    </div>
  </>;
}

export function ItPortal({ email }: { email: string }) {
  const [id, setId] = useState(activeIncident);
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [detail, setDetail] = useState<ItDetail | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const onPop = () => setId(activeIncident());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    const failed = (failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof TypeError ? 'Mất kết nối. Vui lòng thử lại.'
        : failure instanceof Error ? failure.message : 'Chưa tải được sự cố.');
    };
    if (id === null) {
      listItIncidents(controller.signal).then((items) => { if (!controller.signal.aborted) setQueue(items); }, failed);
    } else {
      getItIncident(id, controller.signal).then((value) => { if (!controller.signal.aborted) setDetail(value); }, failed);
    }
    return () => controller.abort();
  }, [id, attempt]);

  useEffect(() => {
    const timer = window.setInterval(() => setAttempt((current) => current + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  function open(next: number | null) {
    if (next === id) return;
    history.pushState(null, '', next === null ? '/it/incidents' : '/it/incidents/' + next);
    setError('');
    setId(next);
  }

  function refresh() { setAttempt((current) => current + 1); }

  return (
    <section className="employee-main">
      {id !== null && <button className="incident-back" type="button" onClick={() => open(null)}>← Hàng đợi IT</button>}
      {id === null && queue !== null && <Queue items={queue} open={open} />}
      {id !== null && detail?.ticket.id === id && <ItIncident key={id} detail={detail} email={email} refresh={refresh} />}
      {error && <div className="incident-card incident-load-status">
        <p className="form-error" role="alert">{error}</p>
        <button className="secondary" type="button" onClick={refresh}>Thử lại</button>
      </div>}
      {!error && (id === null ? queue === null : detail?.ticket.id !== id) &&
        <p className="incident-intro" role="status">Đang tải sự cố…</p>}
    </section>
  );
}
