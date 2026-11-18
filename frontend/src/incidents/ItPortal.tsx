import { useEffect, useRef, useState, type FormEvent } from 'react';
import { categories, dateFormat, getItIncident, impacts, isPublicIncidentMessage, listItIncidents, priorityLabels, sendItUpdate,
  statusLabels, ticketCode, type IncidentPriority, type IncidentStatus, type ItDetail, type QueueItem } from './api';
import { IncidentSummary } from './IncidentSummary';
import { IncidentTimeline } from './IncidentTimeline';
import { ReplyDeadline } from './ReplyDeadline';
import { ResolutionDeadline } from './ResolutionDeadline';
import { AttachedArticle, DraftArticleButton } from '../knowledge/KnowledgePortal';
import './employee.css';
import './it.css';

type MessageKind = 'PUBLIC_REPLY' | 'INTERNAL_NOTE';
type Action = 'claim' | 'resolve' | 'messages' | 'priority' | 'transfer';

function activeIncident() {
  const match = /^\/it\/incidents\/([1-9][0-9]*)$/.exec(window.location.pathname);
  const id = match ? Number(match[1]) : null;
  return Number.isSafeInteger(id) ? id : null;
}

function Status({ status }: { status: IncidentStatus }) {
  return <span className="incident-pill" data-status={status}>{statusLabels[status]}</span>;
}

function PriorityBadge({ priority }: { priority: IncidentPriority }) {
  return <span className="incident-pill" data-priority={priority}>{priorityLabels[priority]}</span>;
}

type QueueFilters = { search: string; status: string; priority: string };

function TicketLink({ item, open }: { item: QueueItem; open: (id: number) => void }) {
  return <button type="button" className="it-ticket-link" onClick={() => open(item.id)}>
    <span className="incident-code">{ticketCode(item.id)}</span><strong>{item.title}</strong>
  </button>;
}

function Queue({ items, open, filters, onFilterChange }: {
  items: QueueItem[];
  open: (id: number) => void;
  filters: QueueFilters;
  onFilterChange: (filters: QueueFilters) => void;
}) {
  const term = filters.search.trim().toLocaleLowerCase('vi-VN');
  const matches = items.filter((item) => (!filters.status || filters.status === item.status) &&
    (!filters.priority || filters.priority === item.priority) &&
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
        <p>{items.length} yêu cầu trong hàng đợi</p></div>
        <span className="it-queue-order">Sắp xếp theo mức ưu tiên và hạn phản hồi</span></div>
      <div className="it-filters">
        <div>
          <label htmlFor="it-search">Tìm mã hoặc tiêu đề</label>
          <input id="it-search" type="search" placeholder="Tìm theo mã hoặc tiêu đề" value={filters.search} onChange={(event) => onFilterChange({ ...filters, search: event.target.value })} />
        </div>
        <div>
          <label htmlFor="it-status">Trạng thái</label>
          <select id="it-status" value={filters.status} onChange={(event) => onFilterChange({ ...filters, status: event.target.value })}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="it-priority">Mức ưu tiên</label>
          <select id="it-priority" value={filters.priority} onChange={(event) => onFilterChange({ ...filters, priority: event.target.value })}>
            <option value="">Tất cả mức</option>
            {Object.entries(priorityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
      </div>
      {matches.length === 0 ? <p className="incident-intro it-empty">{items.length
        ? 'Không có sự cố khớp bộ lọc.' : 'Chưa có sự cố nào.'}</p> : <>
        <div className="it-table-scroll it-queue-table">
          <table>
            <thead><tr><th>Yêu cầu</th><th>Mức ưu tiên</th><th>Nhóm sự cố / Ảnh hưởng</th><th>Trạng thái</th><th>Người xử lý</th><th>Hạn / phản hồi đầu tiên</th></tr></thead>
            <tbody>{matches.map((item) => <tr key={item.id}>
              <td><TicketLink item={item} open={open} /><small>{item.requester}</small></td>
              <td><PriorityBadge priority={item.priority} /></td>
              <td>{categories[item.category]}<small>{impacts[item.impact]}</small></td>
              <td><Status status={item.status} /></td>
              <td>{item.assignee ?? 'Chưa phân công'}</td>
              <td><ReplyDeadline sla={item.sla} /></td>
            </tr>)}</tbody>
          </table>
        </div>
        <ul className="it-queue-cards" role="list">
          {matches.map((item) => <li key={item.id} className="it-queue-card">
            <TicketLink item={item} open={open} />
            <p className="it-queue-card-meta">{categories[item.category]} · {impacts[item.impact]}</p>
            <div className="it-queue-card-badges">
              <Status status={item.status} />
              <span className="it-queue-card-priority">Ưu tiên <PriorityBadge priority={item.priority} /></span>
            </div>
            <dl className="it-queue-card-details">
              <div><dt>{item.sla.firstReplyAt ? 'Phản hồi đầu tiên' : 'Hạn phản hồi'}</dt>
                <dd><ReplyDeadline sla={item.sla} /></dd></div>
              <div><dt>Người xử lý</dt><dd>{item.assignee ?? 'Chưa phân công'}</dd></div>
              <div><dt>Người gửi</dt><dd>{item.requester}</dd></div>
            </dl>
          </li>)}
        </ul>
      </>}
    </section>
  </>;
}

function ItIncident({ detail, email, refresh, onTransferred }: {
  detail: ItDetail; email: string; refresh: () => void; onTransferred: (recipient: string) => void;
}) {
  const { ticket, activity, savedSummary, transferOptions } = detail;
  const [kind, setKind] = useState<MessageKind>('PUBLIC_REPLY');
  const [body, setBody] = useState('');
  const [priorityDraft, setPriorityDraft] = useState<IncidentPriority | null>(null);
  const [recipient, setRecipient] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const transferKey = useRef<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Action | null>(null);
  const submission = useRef<{ kind: MessageKind | 'WAIT_REQUESTED'; key: string } | null>(null);
  const active = useRef(false);
  const waiting = ticket.status === 'WAITING_CUSTOMER';
  const mine = (ticket.status === 'IN_PROGRESS' || waiting) && ticket.assignee === email;
  const priority = priorityDraft ?? ticket.priority;
  const isNote = kind === 'INTERNAL_NOTE';
  const latestReply = activity.reduce<ItDetail['activity'][number] | undefined>((latest, event) => {
    if (!isPublicIncidentMessage(event.kind)) return latest;
    return !latest || event.id > latest.id ? event : latest;
  }, undefined);

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

  async function act(action: Action, messageKind: MessageKind | 'WAIT_REQUESTED' = kind) {
    if (pending || (action === 'priority' && priority === ticket.priority)) return;
    const text = body.trim();
    if (action === 'messages' && !text) {
      setError('Nhập nội dung trước khi gửi.');
      return;
    }
    const reason = transferReason.trim();
    if (action === 'transfer' && (!recipient || !reason)) {
      setError('Chọn người tiếp nhận và nhập lý do bàn giao.');
      return;
    }
    setPending(action);
    setError('');
    setMessage('');
    try {
      switch (action) {
        case 'messages': {
          if (submission.current?.kind !== messageKind) {
            submission.current = { kind: messageKind, key: crypto.randomUUID() };
          }
          await sendItUpdate(ticket.id, { action, kind: messageKind, body: text, submissionKey: submission.current.key });
          break;
        }
        case 'priority':
          await sendItUpdate(ticket.id, { action, priority });
          break;
        case 'transfer':
          await sendItUpdate(ticket.id, { action, recipient, reason, submissionKey: transferKey.current ??= crypto.randomUUID() });
          break;
        default:
          await sendItUpdate(ticket.id, { action });
      }
      if (!active.current) return;
      if (action === 'messages') {
        setBody('');
        submission.current = null;
      }
      if (action === 'priority') setPriorityDraft(null);
      if (action === 'transfer') {
        onTransferred(recipient);
        setRecipient('');
        setTransferReason('');
        transferKey.current = null;
      }
      setMessage({
        transfer: 'Đã bàn giao sự cố cho ' + recipient + '.',
        claim: 'Bạn đã nhận xử lý sự cố.',
        resolve: 'Đã đánh dấu sự cố là đã giải quyết.',
        messages: messageKind === 'WAIT_REQUESTED' ? 'Đã gửi câu hỏi và chuyển sang chờ nhân viên.'
          : isNote ? 'Đã lưu ghi chú nội bộ.' : 'Đã gửi phản hồi cho nhân viên.',
        priority: 'Đã lưu mức ưu tiên.',
      }[action]);
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
          {ticket.assetId && <div className="asset-reference asset-reference--linked">
            <div className="asset-reference-details">
              <span className="asset-reference-label">Thiết bị liên quan</span>
              <strong>{ticket.assetName}</strong>
              <span className="asset-reference-code">{ticket.assetCode}</span>
            </div>
            <a className="asset-history-link" href={'/it/assets/' + ticket.assetId}>
              Xem lịch sử sự cố <span aria-hidden="true">→</span>
            </a>
          </div>}
          {ticket.knowledgeArticleId && ticket.knowledgeArticleTitle &&
            <AttachedArticle id={ticket.knowledgeArticleId} title={ticket.knowledgeArticleTitle} />}
        </article>
        <IncidentSummary incidentId={ticket.id} saved={savedSummary} latestReply={latestReply} />
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
            {!isNote && !waiting && <button className="secondary" type="button" disabled={!!pending}
              onClick={() => void act('messages', 'WAIT_REQUESTED')}>Gửi và chờ phản hồi</button>}
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
          <div><dt>Mức ưu tiên hiện tại</dt><dd><PriorityBadge priority={ticket.priority} /></dd></div>
        </dl>
        {mine && <form className="it-priority-edit" onSubmit={(event) => {
          event.preventDefault();
          void act('priority');
        }}>
          <label htmlFor="it-edit-priority">Đổi mức ưu tiên</label>
          <select id="it-edit-priority" value={priority} disabled={!!pending}
            onChange={(event) => setPriorityDraft(event.target.value as IncidentPriority)}>
            {Object.entries(priorityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <button className="incident-primary" type="submit" disabled={!!pending || priority === ticket.priority}>
            {pending === 'priority' ? 'Đang lưu…' : 'Lưu mức ưu tiên'}
          </button>
        </form>}
        <ReplyDeadline sla={detail.sla} detailed />
        {detail.resolutionSla && <ResolutionDeadline sla={detail.resolutionSla} />}
        {ticket.status === 'RESOLVED' && <DraftArticleButton incidentId={ticket.id} />}
        {ticket.status === 'NEW' && <button className="incident-primary it-side-action" type="button"
          disabled={!!pending} onClick={() => void act('claim')}>{pending === 'claim' ? 'Đang nhận…' : 'Nhận xử lý'}</button>}
        {mine && <button className="secondary it-side-action" type="button" disabled={!!pending}
          onClick={() => void act('resolve')}>{pending === 'resolve' ? 'Đang cập nhật…' : 'Đánh dấu đã giải quyết'}</button>}
        {mine && transferOptions?.length > 0 && <details className="it-transfer">
          <summary>Bàn giao sự cố</summary>
          <form onSubmit={(event) => { event.preventDefault(); void act('transfer'); }}>
            <label htmlFor="it-transfer-recipient">Người tiếp nhận</label>
            <select id="it-transfer-recipient" value={recipient} required disabled={!!pending}
              onChange={(event) => { setRecipient(event.target.value); transferKey.current = null; }}>
              <option value="">Chọn nhân viên IT</option>
              {transferOptions.map((email) => <option key={email} value={email}>{email}</option>)}
            </select>
            <label htmlFor="it-transfer-reason">Lý do bàn giao</label>
            <textarea id="it-transfer-reason" rows={3} maxLength={1000} required value={transferReason}
              disabled={!!pending}
              onChange={(event) => { setTransferReason(event.target.value); transferKey.current = null; }} />
            <button className="incident-primary" type="submit" disabled={!!pending}>
              {pending === 'transfer' ? 'Đang bàn giao…' : 'Xác nhận bàn giao'}
            </button>
          </form>
        </details>}
        {message && <p className="incident-success" role="status">{message}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </aside>
    </div>
  </>;
}

export function ItPortal({ email }: { email: string }) {
  const [id, setId] = useState(activeIncident);
  const [filters, setFilters] = useState<QueueFilters>({ search: '', status: '', priority: '' });
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

  useEffect(() => {
    if (id === null) return;
    const onFocus = () => setAttempt((current) => current + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [id]);

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
      {id === null && queue !== null && <Queue items={queue} open={open} filters={filters} onFilterChange={setFilters} />}
      {id !== null && detail?.ticket.id === id && <ItIncident key={id} detail={detail} email={email} refresh={refresh}
        onTransferred={(recipient) => setDetail((current) => current?.ticket.id === id
          ? { ...current, ticket: { ...current.ticket, assignee: recipient } } : current)} />}
      {error && <div className="incident-card incident-load-status">
        <p className="form-error" role="alert">{error}</p>
        <button className="secondary" type="button" onClick={refresh}>Thử lại</button>
      </div>}
      {!error && (id === null ? queue === null : detail?.ticket.id !== id) &&
        <p className="incident-intro" role="status">Đang tải sự cố…</p>}
    </section>
  );
}
