import { useEffect, useRef, useState, type FormEvent } from 'react';
import { categories, createIncident, dateFormat, getIncident, impacts, listIncidents, statusLabels, ticketCode,
  type Draft, type Incident, type IncidentSummary } from './api';
import { IncidentTimeline } from './IncidentTimeline';
import './employee.css';

type Screen = 'list' | 'new' | number;

function currentScreen(): Screen {
  const path = window.location.pathname;
  if (path === '/requests/new') return 'new';
  const match = /^\/requests\/([1-9][0-9]*)$/.exec(path);
  const id = match && Number(match[1]);
  return id && Number.isSafeInteger(id) ? id : 'list';
}

function IncidentForm({ onCreated, onBack }: {
  onCreated: (incident: Incident) => void; onBack: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({ title: '', category: '', impact: '', description: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submissionKey = useRef<string | null>(null);
  const sending = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function update(changes: Partial<Draft>) {
    submissionKey.current = null;
    setDraft((current) => ({ ...current, ...changes }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    if (!draft.title.trim() || !draft.description.trim()) {
      setError('Nhập tiêu đề và mô tả sự cố.');
      return;
    }
    setPending(true);
    sending.current = true;
    setError('');
    try {
      const key = submissionKey.current ??= crypto.randomUUID();
      const incident = await createIncident(draft, key);
      if (mounted.current) onCreated(incident);
    } catch (failure) {
      setError(failure instanceof TypeError ? 'Mất kết nối. Bạn có thể thử gửi lại yêu cầu.'
        : failure instanceof Error ? failure.message : 'Chưa gửi được yêu cầu.');
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className="incident-back" onClick={onBack}>← Yêu cầu của tôi</button>
      <h1>Báo sự cố</h1>
      <p className="incident-intro">Mô tả lỗi để đội IT kiểm tra và phản hồi.</p>
      <div className="incident-layout">
        <form className="incident-card" onSubmit={submit} aria-busy={pending}>
          <fieldset disabled={pending}>
            <label htmlFor="subject">Tiêu đề</label>
            <input id="subject" value={draft.title} onChange={(e) => update({ title: e.target.value })}
              required maxLength={120} />
            <div className="incident-fields">
              <div>
                <label htmlFor="category">Nhóm sự cố</label>
                <select id="category" value={draft.category} required
                  onChange={(e) => update({ category: e.target.value as Draft['category'] })}>
                  <option value="">Chọn nhóm sự cố</option>
                  {Object.entries(categories).map(([value, label]) =>
                    <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="impact">Phạm vi ảnh hưởng</label>
                <select id="impact" value={draft.impact} required
                  onChange={(e) => update({ impact: e.target.value as Draft['impact'] })}>
                  <option value="">Chọn phạm vi ảnh hưởng</option>
                  {Object.entries(impacts).map(([value, label]) =>
                    <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
            <label htmlFor="description">Mô tả sự cố</label>
            <textarea id="description" rows={4} value={draft.description}
              onChange={(e) => update({ description: e.target.value })} required maxLength={4000} />
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="incident-actions">
              <button type="button" className="secondary" onClick={onBack}>Hủy</button>
              <button type="submit" className="incident-primary">{pending ? 'Đang gửi…' : 'Gửi sự cố →'}</button>
            </div>
          </fieldset>
        </form>
        <aside className="incident-card incident-note">
          <h2>Mô tả để IT dễ kiểm tra</h2>
          <p>Ghi thời điểm lỗi xảy ra, thông báo lỗi và những bước bạn đã thử.</p>
        </aside>
      </div>
    </>
  );
}

function IncidentDetail({ incident, sent }: { incident: Incident; sent: boolean }) {
  return (
    <>
      <div className="incident-heading">
        <div><p className="incident-code">{ticketCode(incident.id)} · Báo sự cố</p><h1>{incident.title}</h1></div>
        <span className="incident-pill" data-status={incident.status}>{statusLabels[incident.status]}</span>
      </div>
      {sent && <p className="incident-success" role="status">Đã gửi yêu cầu. Bạn có thể theo dõi tiến độ tại đây.</p>}
      <div className="incident-layout">
        <div>
          <article className="incident-card">
            <h2>Mô tả sự cố</h2><p className="incident-description">{incident.description}</p>
          </article>
          <IncidentTimeline createdAt={incident.createdAt} activity={incident.activity} employee />
        </div>
        <aside className="incident-card">
          <h2>Thông tin yêu cầu</h2>
          <dl>
            <div><dt>Trạng thái</dt><dd><span className="incident-pill" data-status={incident.status}>{statusLabels[incident.status]}</span></dd></div>
            <div><dt>Nhóm sự cố</dt><dd>{categories[incident.category]}</dd></div>
            <div><dt>Ảnh hưởng</dt><dd>{impacts[incident.impact]}</dd></div>
            <div><dt>Người xử lý</dt><dd>{incident.assignee ?? 'Chưa phân công'}</dd></div>
          </dl>
        </aside>
      </div>
    </>
  );
}

export function EmployeePortal({ email }: { email: string }) {
  const [screen, setScreen] = useState(currentScreen);
  const [list, setList] = useState<IncidentSummary[] | null>(null);
  const [detail, setDetail] = useState<Incident | null>(null);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    function onPop() {
      setError('');
      setSent(null);
      setList(null);
      setDetail(null);
      setScreen(currentScreen());
      setAttempt((current) => current + 1);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (screen === 'new') return;
    const controller = new AbortController();
    const failed = (failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof TypeError ? 'Mất kết nối. Vui lòng thử lại.'
        : failure instanceof Error ? failure.message : 'Chưa tải được yêu cầu.');
    };
    if (screen === 'list') {
      listIncidents(controller.signal).then((items) => { if (!controller.signal.aborted) setList(items); }, failed);
    } else {
      getIncident(screen, controller.signal).then((item) => { if (!controller.signal.aborted) setDetail(item); }, failed);
    }
    return () => controller.abort();
  }, [screen, attempt]);

  function navigate(next: Screen) {
    if (next === screen) return;
    const path = next === 'list' ? '/requests' : next === 'new' ? '/requests/new' : '/requests/' + next;
    history.pushState(null, '', path);
    setError('');
    setSent(null);
    setList(null);
    setDetail(null);
    setScreen(next);
  }

  function submitted(incident: Incident) {
    navigate(incident.id);
    setDetail(incident);
    setSent(incident.id);
  }

  const back = () => navigate('list');

  return (
    <div className="employee-portal">
      <aside className="employee-sidebar">
        <p>Cổng nhân viên</p>
        <button type="button" onClick={back}>Yêu cầu của tôi</button>
        <small>{email}</small>
      </aside>
      <section className="employee-main">
        {screen === 'new' && <IncidentForm onCreated={submitted} onBack={back} />}
        {screen === 'list' && <>
          <div className="incident-heading">
            <h1>Yêu cầu của tôi</h1>
            <button type="button" className="incident-primary" onClick={() => navigate('new')}>+ Báo sự cố</button>
          </div>
          {list && <section className="incident-card incident-list" aria-label="Danh sách yêu cầu">
            {list.length === 0 ? <p>Bạn chưa có yêu cầu nào.</p> : list.map((item) => (
              <button key={item.id} type="button" onClick={() => navigate(item.id)}>
                <span className="incident-code">{ticketCode(item.id)}</span>
                <span><strong>{item.title}</strong><small>{categories[item.category]}</small></span>
                <span className="incident-pill" data-status={item.status}>{statusLabels[item.status]}</span>
                <time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time>
              </button>
            ))}
          </section>}
        </>}
        {typeof screen === 'number' && <>
          <button type="button" className="incident-back" onClick={back}>← Yêu cầu của tôi</button>
          {detail?.id === screen && <IncidentDetail incident={detail} sent={sent === detail.id} />}
        </>}
        {error && <div className="incident-card incident-load-status">
          <p className="form-error" role="alert">{error}</p>
          <button className="secondary" type="button" onClick={() => {
            setError('');
            setAttempt((current) => current + 1);
          }}>Thử lại</button>
        </div>}
        {!error && ((screen === 'list' && !list) || (typeof screen === 'number' && !detail)) &&
          <p className="incident-intro" role="status">Đang tải yêu cầu…</p>}
      </section>
    </div>
  );
}
