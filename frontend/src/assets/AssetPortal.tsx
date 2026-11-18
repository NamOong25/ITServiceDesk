import { useEffect, useRef, useState, type FormEvent } from 'react';
import { dateFormat, statusLabels, ticketCode } from '../incidents/api';
import { assetKinds, assetStates, getAsset, listAssets, listAssignees, saveAsset,
  type Asset, type AssetDetail, type AssetDraft, type Assignee } from './api';
import './assets.css';

function errorText(failure: unknown) {
  return failure instanceof Error && !(failure instanceof TypeError) ? failure.message : 'Mất kết nối. Vui lòng thử lại.';
}

function StateBadge({ state }: { state: Asset['status'] }) {
  return <span className="incident-pill asset-state" data-state={state}>{assetStates[state]}</span>;
}

function Inventory({ assets }: { assets: Asset[] }) {
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const term = search.trim().toLocaleLowerCase('vi-VN');
  const shown = assets.filter((asset) => (!state || asset.status === state)
    && [asset.code, asset.name, asset.assignee ?? ''].some((value) => value.toLocaleLowerCase('vi-VN').includes(term)));

  return <>
    <div className="incident-heading asset-heading">
      <div><h1>Thiết bị IT</h1><p className="incident-intro">Theo dõi thiết bị được cấp và các sự cố liên quan.</p></div>
      <a className="incident-primary asset-button" href="/it/assets/new">+ Thêm thiết bị</a>
    </div>
    <section className="incident-card asset-list">
      <div className="asset-filters">
        <div><label htmlFor="asset-search">Tìm mã, tên thiết bị hoặc email</label>
          <input id="asset-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div><label htmlFor="asset-state">Trạng thái</label>
          <select id="asset-state" value={state} onChange={(event) => setState(event.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(assetStates).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></div>
      </div>
      {shown.length ? <ul className="asset-rows" role="list">
        {shown.map((asset) => <li key={asset.id}>
          <a className="asset-row asset-inventory-row" href={'/it/assets/' + asset.id}>
            <div><span className="incident-code">{asset.code}</span>
              <strong>{asset.name}</strong><small>{assetKinds[asset.kind]}</small></div>
            <div><StateBadge state={asset.status} /><small>{asset.assignee ?? 'Chưa cấp cho nhân viên'}</small></div>
            <span className="asset-row-count">{asset.incidentCount} sự cố</span>
          </a>
        </li>)}
      </ul> : <p className="incident-intro">{assets.length ? 'Không có thiết bị khớp bộ lọc.' : 'Chưa có thiết bị nào.'}</p>}
    </section>
  </>;
}

function DeviceDetail({ detail }: { detail: AssetDetail }) {
  const { asset, history } = detail;
  return <>
    <div className="incident-heading asset-heading">
      <div><p className="incident-code">{asset.code}</p><h1>{asset.name}</h1></div>
      <a className="asset-button asset-edit-link" href={'/it/assets/' + asset.id + '/edit'}>Chỉnh sửa</a>
    </div>
    <div className="incident-layout asset-detail">
      <section className="incident-card">
        <h2>Lịch sử sự cố</h2>
        {history.length ? <ul className="asset-rows" role="list">
          {history.map((issue) => <li key={issue.id}>
            <a className="asset-row asset-history-row" href={'/it/incidents/' + issue.id}>
              <div><span className="incident-code">{ticketCode(issue.id)}</span><strong>{issue.title}</strong>
                <small><time dateTime={issue.createdAt}>{dateFormat.format(new Date(issue.createdAt))}</time></small></div>
              <span className="incident-pill" data-status={issue.status}>{statusLabels[issue.status]}</span>
            </a>
          </li>)}
        </ul> : <p className="incident-intro">Thiết bị này chưa có sự cố liên kết.</p>}
      </section>
      <aside className="incident-card">
        <h2>Thông tin thiết bị</h2>
        <dl>
          <div><dt>Loại</dt><dd>{assetKinds[asset.kind]}</dd></div>
          <div><dt>Trạng thái</dt><dd><StateBadge state={asset.status} /></dd></div>
          <div><dt>Người sử dụng</dt><dd>{asset.assignee ?? 'Chưa cấp cho nhân viên'}</dd></div>
        </dl>
      </aside>
    </div>
  </>;
}

function Editor({ initial, assignees }: { initial?: Asset; assignees: Assignee[] }) {
  const [draft, setDraft] = useState<AssetDraft>(initial ??
    { code: '', name: '', kind: 'LAPTOP', status: 'AVAILABLE', assignedToId: null, revision: 0 });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);

  function update(changes: Partial<AssetDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError('');
    try {
      const asset = await saveAsset(draft, initial?.id);
      window.location.assign('/it/assets/' + asset.id);
    } catch (failure) {
      setError(errorText(failure));
      saving.current = false;
      setPending(false);
    }
  }

  return <>
    <h1>{initial ? 'Chỉnh sửa thiết bị' : 'Thêm thiết bị'}</h1>
    <form className="incident-card asset-editor" onSubmit={submit} aria-busy={pending}>
      <fieldset disabled={pending}>
        <div className="asset-fields">
          <div><label htmlFor="asset-code">Mã tài sản</label>
            <input id="asset-code" value={draft.code} maxLength={30} pattern="[A-Za-z0-9](?:[A-Za-z0-9]|-){0,29}"
              required readOnly={!!initial} onChange={(event) => update({ code: event.target.value })} /></div>
          <div><label htmlFor="asset-name">Tên thiết bị</label>
            <input id="asset-name" value={draft.name} maxLength={120} required
              onChange={(event) => update({ name: event.target.value })} /></div>
          <div><label htmlFor="asset-kind">Loại thiết bị</label>
            <select id="asset-kind" value={draft.kind} onChange={(event) => update({ kind: event.target.value as Asset['kind'] })}>
              {Object.entries(assetKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></div>
          <div><label htmlFor="asset-status">Trạng thái</label>
            <select id="asset-status" value={draft.status} onChange={(event) => {
              const status = event.target.value as Asset['status'];
              update({ status, assignedToId: status === 'IN_USE' ? draft.assignedToId : null });
            }}>
              {Object.entries(assetStates).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></div>
          {draft.status === 'IN_USE' && <div><label htmlFor="asset-assignee">Người sử dụng</label>
            <select id="asset-assignee" value={draft.assignedToId ?? ''} required onChange={(event) =>
              update({ assignedToId: event.target.value ? Number(event.target.value) : null })}>
              <option value="">Chọn nhân viên</option>
              {assignees.map(({ id, email }) => <option key={id} value={id}>{email}</option>)}
            </select></div>}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="incident-actions">
          <a className="asset-button asset-edit-link" href={initial ? '/it/assets/' + initial.id : '/it/assets'}>Hủy</a>
          <button type="submit" className="incident-primary">{pending ? 'Đang lưu…' : 'Lưu thiết bị'}</button>
        </div>
      </fieldset>
    </form>
  </>;
}

type Page = { kind: 'list'; assets: Asset[] } | { kind: 'detail'; detail: AssetDetail }
  | { kind: 'editor'; assignees: Assignee[]; initial?: Asset };

export function AssetPortal() {
  const path = window.location.pathname;
  const match = /^\/it\/assets\/([1-9][0-9]*)(\/edit)?$/.exec(path);
  const id = match ? Number(match[1]) : undefined;
  const editing = path === '/it/assets/new' || !!match?.[2];
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setError('');
      try {
        let result: Page;
        if (editing) {
          const [assignees, detail] = await Promise.all([listAssignees(controller.signal),
            id === undefined ? undefined : getAsset(id, controller.signal)]);
          result = { kind: 'editor', assignees, initial: detail?.asset };
        } else if (id !== undefined) {
          result = { kind: 'detail', detail: await getAsset(id, controller.signal) };
        } else {
          result = { kind: 'list', assets: await listAssets(controller.signal) };
        }
        if (!controller.signal.aborted) setPage(result);
      } catch (failure) {
        if (!controller.signal.aborted) setError(errorText(failure));
      }
    }
    void load();
    return () => controller.abort();
  }, [id, editing, attempt]);

  return <section className="employee-main assets">
    {(editing || id !== undefined) && <a className="incident-back asset-button" href="/it/assets">← Danh sách thiết bị</a>}
    {page?.kind === 'list' && <Inventory assets={page.assets} />}
    {page?.kind === 'detail' && <DeviceDetail detail={page.detail} />}
    {page?.kind === 'editor' && <Editor initial={page.initial} assignees={page.assignees} />}
    {error ? <div className="incident-card incident-load-status">
      <p role="alert" className="form-error">{error}</p>
      <button type="button" className="secondary" onClick={() => setAttempt((current) => current + 1)}>Thử lại</button>
    </div> : !page && <p className="incident-intro" role="status">Đang tải thiết bị…</p>}
  </section>;
}
