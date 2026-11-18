import { useEffect, useRef, useState, type RefObject } from 'react';
import { categories, dateFormat, impacts, statusLabels, ticketCode,
  type Activity, type IncidentStatus, type ReplySla, type ResolutionSla } from './api';
import { IncidentTimeline } from './IncidentTimeline';
import { ReplyDeadline } from './ReplyDeadline';
import { ResolutionDeadline, resolutionLabels } from './ResolutionDeadline';
import './manager.css';

type PendingAccess = { id: number; systemName: string; requester: string };
type TeamIssue = {
  id: number;
  title: string;
  status: IncidentStatus;
  requester: string;
  assignee: string | null;
  replyState: ReplySla['state'];
  replyDueAt: string;
  resolutionSla: ResolutionSla;
  resolutionOverdue: boolean;
};
type Overview = {
  totalIncidents: number;
  onTime: number;
  late: number;
  waiting: number;
  overdueCount: number;
  overdueResolutionCount: number;
  waitingForEmployee: number;
  responded: number;
  averageReplyMinutes: number | null;
  pendingAccessCount: number;
  pendingAccess: PendingAccess[];
  issues: TeamIssue[];
};
type Detail = {
  ticket: Pick<TeamIssue, 'id' | 'title' | 'status' | 'requester' | 'assignee'> & {
    category: keyof typeof categories; impact: keyof typeof impacts; description: string; createdAt: string;
  };
  activity: Activity[];
  sla: ReplySla;
  resolutionSla: ResolutionSla;
};

const issueViews = {
  all: 'Tất cả sự cố',
  reply: 'Quá hạn phản hồi đầu tiên',
  resolution: 'Quá hạn giải quyết',
  waiting: 'Chờ nhân viên phản hồi',
} as const;
type IssueView = keyof typeof issueViews;
const replyLabels = {
  PENDING: 'Chưa đến hạn',
  DUE_SOON: 'Sắp đến hạn',
  ON_TIME: 'Đúng hạn',
  OVERDUE: 'Quá hạn',
  LATE: 'Phản hồi muộn',
} satisfies Record<ReplySla['state'], string>;

function readSelection() {
  const params = new URLSearchParams(window.location.search);
  const days = Number(params.get('days'));
  const view = params.get('view');
  return {
    days: days === 30 || days === 90 ? days : 7,
    view: view === 'reply' || view === 'resolution' || view === 'waiting' ? view : 'all' as IssueView,
  };
}

function queryString(days: number, view: IssueView) {
  const query = new URLSearchParams();
  if (days !== 7) query.set('days', String(days));
  if (view !== 'all') query.set('view', view);
  return query.size ? '?' + query.toString() : '';
}

function matchesView(issue: TeamIssue, view: IssueView) {
  switch (view) {
    case 'reply': return issue.replyState === 'OVERDUE';
    case 'resolution': return issue.resolutionOverdue;
    case 'waiting': return issue.status === 'WAITING_CUSTOMER';
    default: return true;
  }
}

function Metrics({ data, view, onSelect }: { data: Overview; view: IssueView; onSelect: (view: IssueView) => void }) {
  const metrics = [
    { view: 'reply', count: data.overdueCount, hint: 'Chưa có phản hồi',
      tone: 'overdue', icon: '!' },
    { view: 'resolution', count: data.overdueResolutionCount, hint: 'Sự cố đang mở',
      tone: 'overdue', icon: '!' },
    { view: 'waiting', count: data.waitingForEmployee, hint: 'Cần nhân viên bổ sung thông tin',
      tone: 'waiting', icon: '◷' },
  ] as const;

  return <div className="manager-metrics">
    {metrics.map((metric) => <button key={metric.view} className="incident-card manager-metric manager-metric-filter"
      type="button" aria-controls="manager-issues" aria-pressed={view === metric.view} onClick={() => onSelect(metric.view)}>
      <span className={'manager-indicator ' + metric.tone} aria-hidden="true">{metric.icon}</span>
      <span><span className="manager-metric-title">{issueViews[metric.view]}</span><strong>{metric.count}</strong>
        <span className="manager-metric-hint">{metric.hint}</span></span>
    </button>)}
    <section className="incident-card manager-metric">
      <span className="manager-indicator response" aria-hidden="true">◷</span>
      <div><h2>Phản hồi đầu tiên trung bình</h2>
        <strong>{data.averageReplyMinutes ?? '—'}{data.averageReplyMinutes !== null && <small> phút</small>}</strong>
        <p>{data.responded ? 'Phút làm việc · ' + data.responded + ' sự cố đã phản hồi' : 'Chưa có sự cố đã phản hồi'}</p></div>
    </section>
    <section className="incident-card manager-metric">
      <span className="manager-indicator waiting" aria-hidden="true">✓</span>
      <div><h2>Yêu cầu đang chờ duyệt</h2><strong>{data.pendingAccessCount}</strong>
        <p>Tất cả yêu cầu đang chờ</p></div>
    </section>
  </div>;
}

function ResponseSummary({ data, days }: { data: Overview; days: number }) {
  const series = [
    { label: 'Đúng hạn', value: data.onTime, state: 'on-time' },
    { label: 'Phản hồi muộn', value: data.late, state: 'late' },
    { label: 'Chưa phản hồi, quá hạn', value: data.overdueCount, state: 'overdue' },
    { label: 'Còn trong hạn', value: data.waiting, state: 'waiting' },
  ];
  return <section className="incident-card manager-panel">
    <h2>Tình hình phản hồi</h2>
    <p className="incident-intro">{data.totalIncidents} sự cố được gửi trong {days} ngày qua</p>
    {data.totalIncidents > 0 && <div className="manager-bar" aria-hidden="true">
      {series.filter((item) => item.value > 0).map((item) =>
        <span key={item.state} className={item.state} style={{ flexGrow: item.value }} />)}
    </div>}
    <ul className="manager-legend">
      {series.map((item) => <li key={item.state}><span className={item.state} aria-hidden="true" />
        {item.label} · {item.value}</li>)}
    </ul>
  </section>;
}

function PendingApprovals({ items, count }: { items: PendingAccess[]; count: number }) {
  return <section className="incident-card manager-panel">
    <div className="manager-panel-heading">
      <div><h2>Yêu cầu cần duyệt</h2><p className="incident-intro">{count} yêu cầu cấp quyền đang chờ</p></div>
      <a className="manager-link" href="/access-requests">Xem danh sách →</a>
    </div>
    {items.length > 0 && <ul className="manager-requests">
      {items.map((item) => <li key={item.id}>
        <a className="manager-request-row" href={'/access-requests/' + item.id}>
          <span><strong>Xin quyền dùng {item.systemName}</strong>
            <small>AC-{item.id} · {item.requester}</small></span>
          <span className="incident-pill access-badge" data-access="PENDING">Chờ duyệt</span>
        </a>
      </li>)}
    </ul>}
  </section>;
}

function TeamIssues({ issues, days, view, onSelect, heading }: {
  issues: TeamIssue[]; days: number; view: IssueView; onSelect: (view: IssueView) => void;
  heading: RefObject<HTMLHeadingElement | null>;
}) {
  const rows = issues.filter((issue) => matchesView(issue, view));
  if (view === 'reply') rows.sort((a, b) => Date.parse(a.replyDueAt) - Date.parse(b.replyDueAt));
  if (view === 'resolution') rows.sort((a, b) => {
    const first = a.resolutionSla.dueAt;
    const second = b.resolutionSla.dueAt;
    if (first === second) return 0;
    if (first === null) return 1;
    if (second === null) return -1;
    return Date.parse(first) - Date.parse(second);
  });

  return <section id="manager-issues" className="incident-card manager-panel manager-issues" aria-labelledby="manager-issues-heading">
    <div className="manager-panel-heading manager-issues-heading">
      <div>
        <h2 id="manager-issues-heading" ref={heading} tabIndex={-1}>Sự cố của nhóm</h2>
        <p className="incident-intro" role="status">{rows.length} sự cố trong {days} ngày qua</p>
      </div>
      <div className="manager-period">
        <label htmlFor="manager-issue-view">Lọc sự cố</label>
        <select id="manager-issue-view" value={view} onChange={(event) => onSelect(event.target.value as IssueView)}>
          {Object.entries(issueViews).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
    </div>
    {rows.length ? <ul className="manager-issue-list" role="list">
      {rows.map((issue) => <li key={issue.id} className="manager-issue">
        <div className="manager-issue-identity">
          <a href={'/manager/incidents/' + issue.id + queryString(days, view)} className="manager-issue-link">
            <span className="incident-code">{ticketCode(issue.id)}</span>
            <strong>{issue.title}</strong>
          </a>
          <small>{issue.requester}</small>
        </div>
        <dl className="manager-issue-meta">
          <div><dt>Trạng thái</dt><dd><span className="incident-pill" data-status={issue.status}>{statusLabels[issue.status]}</span></dd></div>
          <div><dt>Người xử lý</dt><dd>{issue.assignee ?? 'Chưa phân công'}</dd></div>
          <div><dt>Phản hồi đầu tiên</dt><dd data-tone={issue.replyState}>{replyLabels[issue.replyState]}
            {issue.replyState === 'OVERDUE' && <time dateTime={issue.replyDueAt}>{dateFormat.format(new Date(issue.replyDueAt))}</time>}
          </dd></div>
          <div><dt>Giải quyết</dt><dd data-tone={issue.resolutionOverdue ? 'OVERDUE' : issue.resolutionSla.state}>
            {issue.resolutionOverdue && issue.resolutionSla.state === 'PAUSED'
              ? 'Quá hạn · đang tạm dừng' : resolutionLabels[issue.resolutionSla.state]}
            {issue.resolutionOverdue && issue.resolutionSla.dueAt &&
              <time dateTime={issue.resolutionSla.dueAt}>{dateFormat.format(new Date(issue.resolutionSla.dueAt))}</time>}
          </dd></div>
        </dl>
      </li>)}
    </ul> : <p className="incident-intro manager-issue-empty">Không có sự cố khớp bộ lọc trong khoảng này.</p>}
  </section>;
}

function useManagerData<T>(url: string, errorMessage: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    async function load() {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (response.status === 404) {
          if (!controller.signal.aborted) setError('Không tìm thấy sự cố trong nhóm của bạn.');
          return;
        }
        if (!response.ok) throw new Error();
        const values: T = await response.json();
        if (!controller.signal.aborted) setData(values);
      } catch {
        if (!controller.signal.aborted) setError(errorMessage);
      }
    }
    void load();
    return () => controller.abort();
  }, [url, errorMessage, attempt]);

  return { data, error, retry: () => setAttempt((current) => current + 1) };
}

function LoadState({ error, retry, label }: { error: string; retry: () => void; label: string }) {
  return error ? <div className="incident-card incident-load-status">
    <p className="form-error" role="alert">{error}</p>
    <button type="button" className="secondary" onClick={retry}>Thử lại</button>
  </div> : <p className="incident-intro" role="status">{label}</p>;
}

function ManagerIncident({ id }: { id: string }) {
  const { days, view } = readSelection();
  const { data, error, retry } = useManagerData<Detail>('/api/manager/incidents/' + id, 'Chưa tải được chi tiết sự cố.');
  return <section className="employee-main">
    <a className="incident-back manager-detail-back" href={'/' + queryString(days, view) + '#manager-issues'}>← Tổng quan nhóm</a>
    {data ? <>
      <div className="incident-heading">
        <div><p className="incident-code">{ticketCode(data.ticket.id)} · Sự cố của nhóm</p>
          <h1>{data.ticket.title}</h1><p className="incident-intro">{data.ticket.requester}</p></div>
        <span className="incident-pill" data-status={data.ticket.status}>{statusLabels[data.ticket.status]}</span>
      </div>
      <div className="incident-layout it-detail">
        <div>
          <article className="incident-card">
            <h2>Mô tả sự cố</h2><p className="incident-description">{data.ticket.description}</p>
          </article>
          <IncidentTimeline createdAt={data.ticket.createdAt} activity={data.activity} />
        </div>
        <aside className="incident-card">
          <h2>Thông tin xử lý</h2>
          <dl>
            <div><dt>Trạng thái</dt><dd>{statusLabels[data.ticket.status]}</dd></div>
            <div><dt>Người xử lý</dt><dd>{data.ticket.assignee ?? 'Chưa phân công'}</dd></div>
            <div><dt>Nhóm sự cố</dt><dd>{categories[data.ticket.category]}</dd></div>
            <div><dt>Ảnh hưởng</dt><dd>{impacts[data.ticket.impact]}</dd></div>
          </dl>
          <ReplyDeadline sla={data.sla} detailed />
          <ResolutionDeadline sla={data.resolutionSla} />
        </aside>
      </div>
    </> : <LoadState error={error} retry={retry} label="Đang tải chi tiết sự cố…" />}
  </section>;
}

function OverviewDashboard() {
  const [{ days, view }, setSelection] = useState(readSelection);
  const issuesHeading = useRef<HTMLHeadingElement>(null);
  const { data, error, retry } = useManagerData<Overview>('/api/manager/overview?days=' + days, 'Chưa tải được tổng quan nhóm.');

  function choose(nextDays: number, nextView: IssueView) {
    window.history.replaceState(null, '', '/' + queryString(nextDays, nextView));
    setSelection({ days: nextDays, view: nextView });
  }

  useEffect(() => {
    if (data && window.location.hash === '#manager-issues') issuesHeading.current?.focus();
  }, [data]);

  return <section className="employee-main manager-overview">
    <div className="incident-heading manager-heading">
      <div><h1>Tổng quan nhóm</h1>
        <p className="incident-intro">Theo dõi sự cố và yêu cầu cấp quyền của nhân viên do bạn quản lý.</p></div>
      <div className="manager-period">
        <label htmlFor="manager-days">Khoảng thời gian sự cố</label>
        <select id="manager-days" value={days} onChange={(event) => choose(Number(event.target.value), view)}>
          <option value={7}>7 ngày qua</option><option value={30}>30 ngày qua</option><option value={90}>90 ngày qua</option>
        </select>
      </div>
    </div>
    {data ? <>
      <Metrics data={data} view={view} onSelect={(next) => {
        choose(days, next);
        issuesHeading.current?.focus();
      }} />
      <div className="manager-grid">
        <ResponseSummary data={data} days={days} />
        <PendingApprovals items={data.pendingAccess} count={data.pendingAccessCount} />
      </div>
      <TeamIssues issues={data.issues} days={days} view={view} onSelect={(next) => choose(days, next)} heading={issuesHeading} />
    </> : <LoadState error={error} retry={retry} label="Đang tải tổng quan…" />}
  </section>;
}

export function ManagerOverview() {
  const incident = /^\/manager\/incidents\/([1-9][0-9]*)$/.exec(window.location.pathname);
  return incident ? <ManagerIncident id={incident[1]} /> : <OverviewDashboard />;
}
