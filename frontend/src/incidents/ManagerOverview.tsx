import { useEffect, useState } from 'react';
import { dateFormat, ticketCode } from './api';
import './manager.css';

type PendingAccess = { id: number; systemName: string; requester: string };
type OverdueIncident = { id: number; title: string; requester: string; assignee: string | null; dueAt: string };
type Overview = {
  totalIncidents: number;
  onTime: number;
  late: number;
  waiting: number;
  overdueCount: number;
  responded: number;
  averageReplyMinutes: number | null;
  pendingAccessCount: number;
  pendingAccess: PendingAccess[];
  overdue: OverdueIncident[];
};

function Metrics({ data }: { data: Overview }) {
  return <div className="manager-metrics">
    <section className="incident-card manager-metric">
      <span className="manager-indicator overdue" aria-hidden="true">!</span>
      <div><h2>Quá hạn phản hồi</h2><strong>{data.overdueCount}</strong>
        <p>Sự cố chưa có phản hồi đầu tiên</p></div>
    </section>
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

function OverdueList({ items }: { items: OverdueIncident[] }) {
  return <section className="incident-card manager-panel manager-overdue">
    <h2>Sự cố chưa phản hồi và đã quá hạn</h2>
    {items.length === 0 ? <p className="incident-intro">Không có sự cố quá hạn trong khoảng này.</p>
      : <div className="it-table-scroll">
        <table>
          <thead><tr><th scope="col">Yêu cầu</th><th scope="col">Nhân viên</th>
            <th scope="col">Người xử lý</th><th scope="col">Hạn phản hồi</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}>
            <td><small className="incident-code">{ticketCode(item.id)}</small><strong>{item.title}</strong></td>
            <td>{item.requester}</td>
            <td>{item.assignee ?? 'Chưa phân công'}</td>
            <td><time dateTime={item.dueAt}>{dateFormat.format(new Date(item.dueAt))}</time></td>
          </tr>)}</tbody>
        </table>
      </div>}
  </section>;
}

export function ManagerOverview() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/manager/overview?days=' + days, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const values: Overview = await response.json();
        if (!controller.signal.aborted) setData(values);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [days, attempt]);

  return (
    <section className="employee-main manager-overview">
      <div className="incident-heading manager-heading">
        <div><h1>Tổng quan nhóm</h1>
          <p className="incident-intro">Theo dõi sự cố và yêu cầu cấp quyền của nhân viên do bạn quản lý.</p></div>
        <div className="manager-period">
          <label htmlFor="manager-days">Khoảng thời gian sự cố</label>
          <select id="manager-days" value={days} onChange={(event) => {
            setData(null);
            setError(false);
            setDays(Number(event.target.value));
          }}>
            <option value={7}>7 ngày qua</option><option value={30}>30 ngày qua</option><option value={90}>90 ngày qua</option>
          </select>
        </div>
      </div>
      {data && <>
        <Metrics data={data} />
        <div className="manager-grid">
          <ResponseSummary data={data} days={days} />
          <PendingApprovals items={data.pendingAccess} count={data.pendingAccessCount} />
        </div>
        <OverdueList items={data.overdue} />
      </>}
      {error ? <div className="incident-card incident-load-status">
        <p className="form-error" role="alert">Chưa tải được tổng quan nhóm.</p>
        <button type="button" className="secondary" onClick={() => {
          setError(false);
          setAttempt((current) => current + 1);
        }}>Thử lại</button>
      </div> : !data && <p className="incident-intro" role="status">Đang tải tổng quan…</p>}
    </section>
  );
}
