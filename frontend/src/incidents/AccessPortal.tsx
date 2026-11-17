import { useEffect, useRef, useState, type FormEvent } from 'react';
import { type Account, type Role } from '../auth';
import { dateFormat } from './api';
import { accessLabels, getAccess, listAccess, submitAccess, updateAccess,
  type AccessDraft, type AccessRequest, type AccessStatus } from './accessApi';
import './access.css';

const abbr = (id: number) => 'AC-' + id;
const accessUrl = '/access-requests';
export const accessTitles: Record<Role, string> = {
  EMPLOYEE: 'Yêu cầu cấp quyền của tôi',
  MANAGER: 'Yêu cầu cần duyệt',
  IT: 'Yêu cầu cấp quyền đã duyệt',
};

function accessError(failure: unknown) {
  if (failure instanceof TypeError) return 'Mất kết nối. Vui lòng thử lại.';
  return failure instanceof Error ? failure.message : 'Chưa xử lý được yêu cầu.';
}

function Badge({ status }: { status: AccessStatus }) {
  return <span className="incident-pill access-badge" data-access={status}>{accessLabels[status]}</span>;
}

function AccessForm() {
  const [draft, setDraft] = useState<AccessDraft>({ systemName: '', requestedPermission: '', reason: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const key = useRef<string | null>(null);

  function update(field: keyof AccessDraft, value: string) {
    key.current = null;
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (Object.values(draft).some((field) => !field.trim())) {
      setError('Nhập tên hệ thống, quyền cần cấp và lý do.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const request = await submitAccess(draft, key.current ??= crypto.randomUUID());
      location.assign(accessUrl + '/' + request.id);
    } catch (failure) {
      setError(accessError(failure));
      setPending(false);
    }
  }

  return <>
    <h1>Xin cấp quyền</h1>
    <p className="incident-intro">Cho biết bạn cần quyền gì để quản lý xem xét.</p>
    <div className="incident-layout">
      <form className="incident-card" onSubmit={send} aria-busy={pending}>
        <fieldset disabled={pending}>
          <div className="incident-fields access-fields">
            <div>
              <label htmlFor="access-system">Phần mềm hoặc hệ thống</label>
              <input id="access-system" value={draft.systemName} onChange={(e) => update('systemName', e.target.value)}
                placeholder="Ví dụ: Figma" required maxLength={120} />
            </div>
            <div>
              <label htmlFor="access-permission">Quyền cần cấp</label>
              <input id="access-permission" value={draft.requestedPermission}
                onChange={(e) => update('requestedPermission', e.target.value)} required maxLength={200} />
            </div>
          </div>
          <label htmlFor="access-reason">Lý do</label>
          <textarea id="access-reason" rows={4} value={draft.reason} onChange={(e) => update('reason', e.target.value)}
            required maxLength={4000} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="incident-actions">
            <a className="secondary access-action" href={accessUrl}>Hủy</a>
            <button className="incident-primary" type="submit">{pending ? 'Đang gửi…' : 'Gửi yêu cầu →'}</button>
          </div>
        </fieldset>
      </form>
      <aside className="incident-note incident-card">
        <h2>Luồng phê duyệt</h2>
        <p>Quản lý trực tiếp xem xét yêu cầu. Sau khi được duyệt, đội IT có thể nhận xử lý.</p>
      </aside>
    </div>
  </>;
}

function AccessDetail({ request, account, refresh }: {
  request: AccessRequest; account: Account; refresh: () => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function act(action: 'decision' | 'claim' | 'complete', outcome?: 'APPROVED' | 'REJECTED') {
    if (pending) return;
    if (outcome === 'REJECTED' && !note.trim()) {
      setError('Nhập lý do từ chối để nhân viên có thể xem lại.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await updateAccess(account.role, request.id, action, outcome ? { outcome, note } : undefined);
      await refresh();
      setNote('');
    } catch (failure) {
      setError(accessError(failure));
    } finally {
      setPending(false);
    }
  }

  return <>
    <div className="incident-heading">
      <div>
        <p className="incident-code">{abbr(request.id)} · Xin cấp quyền</p>
        <h1>Xin quyền dùng {request.systemName}</h1>
        <p className="incident-intro">{request.requester} · {dateFormat.format(new Date(request.createdAt))}</p>
      </div>
      <Badge status={request.status} />
    </div>
    <div className="incident-layout access-detail">
      <div>
        <article className="incident-card">
          <h2>Nội dung yêu cầu</h2>
          <dl>
            <div><dt>Phần mềm hoặc hệ thống</dt><dd>{request.systemName}</dd></div>
            <div><dt>Quyền cần cấp</dt><dd>{request.requestedPermission}</dd></div>
          </dl>
          <h2 className="access-reason">Lý do</h2>
          <p className="incident-description">{request.reason}</p>
        </article>
        {request.decidedAt && <section className="incident-card incident-timeline">
          <h2>Quyết định của quản lý</h2>
          <p className="incident-intro">{request.status === 'REJECTED' ? 'Đã từ chối' : 'Đã duyệt'} · <time
            dateTime={request.decidedAt}>{dateFormat.format(new Date(request.decidedAt))}</time></p>
          {request.decisionNote && <p className="incident-description">{request.decisionNote}</p>}
        </section>}
      </div>
      <aside className="incident-card">
        {account.role === 'MANAGER' && request.status === 'PENDING' ? <>
          <h2>Quyết định</h2>
          <p className="incident-intro">Yêu cầu được chuyển cho IT sau khi duyệt.</p>
          <label htmlFor="access-note">Ghi chú cho nhân viên</label>
          <textarea id="access-note" rows={3} placeholder="Nhập lý do nếu từ chối"
            value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} maxLength={2000} />
          <div className="incident-actions access-actions">
            <button className="secondary access-reject" type="button" disabled={pending}
              onClick={() => void act('decision', 'REJECTED')}>Từ chối</button>
            <button className="incident-primary" type="button" disabled={pending}
              onClick={() => void act('decision', 'APPROVED')}>Duyệt yêu cầu</button>
          </div>
        </> : <>
          <h2>Thông tin xử lý</h2>
          <dl>
            <div><dt>Quản lý trực tiếp</dt><dd>{request.manager}</dd></div>
            <div><dt>Người xử lý IT</dt><dd>{request.assignee ?? 'Chưa phân công'}</dd></div>
            {request.completedAt && <div><dt>Giờ cấp quyền</dt><dd>{dateFormat.format(new Date(request.completedAt))}</dd></div>}
          </dl>
          {account.role === 'IT' && request.status === 'APPROVED' &&
            <button className="incident-primary it-side-action" type="button" disabled={pending}
              onClick={() => void act('claim')}>Nhận xử lý</button>}
          {account.role === 'IT' && request.status === 'IN_PROGRESS' && request.assignee === account.email && <>
            <p className="incident-intro">Sau khi cấp quyền trên hệ thống được yêu cầu, xác nhận tại đây.</p>
            <button className="incident-primary it-side-action" type="button" disabled={pending}
              onClick={() => void act('complete')}>Xác nhận đã cấp quyền</button>
          </>}
        </>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </aside>
    </div>
  </>;
}

export function AccessPortal({ account }: { account: Account }) {
  const path = location.pathname;
  const match = /^\/access-requests\/([1-9][0-9]*)$/.exec(path);
  const id = match ? Number(match[1]) : null;
  const creating = account.role === 'EMPLOYEE' && path === accessUrl + '/new';
  const [requests, setRequests] = useState<AccessRequest[] | null>(null);
  const [request, setRequest] = useState<AccessRequest | null>(null);
  const [error, setError] = useState('');
  const title = accessTitles[account.role];

  useEffect(() => {
    if (creating) return;
    const controller = new AbortController();
    const fail = (failure: unknown) => {
      if (!controller.signal.aborted) setError(accessError(failure));
    };
    if (id !== null) {
      getAccess(account.role, id, controller.signal).then((item) => setRequest(item), fail);
    } else {
      listAccess(account.role, controller.signal).then((items) => setRequests(items), fail);
    }
    return () => controller.abort();
  }, [account.role, id, creating]);

  async function refresh() {
    if (id !== null) setRequest(await getAccess(account.role, id, new AbortController().signal));
  }

  return (
    <section className="employee-main">
      {(creating || id !== null) && <a href={accessUrl} className="incident-back access-action">← {title}</a>}
      {creating && <AccessForm />}
      {id !== null && request && <AccessDetail request={request} account={account} refresh={refresh} />}
      {id === null && !creating && <>
        <div className="incident-heading">
          <h1>{title}</h1>
          {account.role === 'EMPLOYEE' && <a className="incident-primary access-action" href={accessUrl + '/new'}>+ Xin cấp quyền</a>}
        </div>
        {requests && <section className="incident-card access-list" aria-label={title}>
          {requests.length === 0 ? <p>Chưa có yêu cầu cấp quyền.</p> : requests.map((item) => (
            <a className="access-list-item" key={item.id} href={accessUrl + '/' + item.id}>
              <span className="incident-code">{abbr(item.id)}</span>
              <span><strong>Xin quyền dùng {item.systemName}</strong><small>{account.role === 'EMPLOYEE'
                ? item.requestedPermission : item.requester}</small></span>
              <Badge status={item.status} />
              <time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time>
            </a>
          ))}
        </section>}
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {!creating && !error && (id !== null ? !request : !requests) &&
        <p className="incident-intro" role="status">Đang tải yêu cầu…</p>}
    </section>
  );
}
