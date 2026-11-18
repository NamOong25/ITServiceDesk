import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { currentAccount, signIn, signOut, type Account } from './auth';
import { EmployeePortal } from './incidents/EmployeePortal';
import { ItPortal } from './incidents/ItPortal';
import { AccessPortal } from './incidents/AccessPortal';
import { ManagerOverview } from './incidents/ManagerOverview';
import { Notifications } from './notifications/Notifications';
import { KnowledgePortal } from './knowledge/KnowledgePortal';
import './style.css';
import './workspace.css';

function Brand() {
  return <div className="brand"><span className="brand-icon" aria-hidden="true">›_</span>IT Service Desk</div>;
}

function Login({ onLogin }: { onLogin: (account: Account) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      onLogin(await signIn(email, password));
    } catch (failure) {
      setError(failure instanceof Error && failure.name === 'Error'
        ? failure.message : 'Không kết nối được hệ thống. Vui lòng thử lại.');
      setPassword('');
      setVisible(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login">
      <aside className="story">
        <Brand />
        <div className="story-copy">
          <h2>Hỗ trợ IT <span>nội bộ</span></h2>
          <p>Báo sự cố, xin cấp quyền và theo dõi phản hồi ở cùng một nơi.</p>
        </div>
        <div className="stage" aria-label="Ví dụ luồng xử lý một sự cố VPN">
          <div className="floor" aria-hidden="true" />
          <div className="trace" aria-hidden="true"><span className="signal" /></div>
          <div className="ticket head">
            <span className="tag">IT-1042 · Sự cố VPN</span>
            <strong>Không kết nối được VPN</strong>
            <span className="state"><span className="dot" />Đã tiếp nhận</span>
          </div>
          <div className="ticket done">
            <span className="tag">IT-1042 · Phản hồi từ IT</span>
            <strong>Kết nối đã khôi phục</strong>
            <span className="state"><span className="dot" />Đã giải quyết</span>
          </div>
        </div>
      </aside>
      <section className="panel" aria-labelledby="title">
        <form className="form" onSubmit={submit} aria-busy={pending}>
          <h1 id="title">Đăng nhập</h1>
          <p className="hint">Sử dụng tài khoản do công ty cấp.</p>
          <label htmlFor="email">Email công ty</label>
          <input id="email" type="email" autoComplete="username" placeholder="ten@congty.vn"
            value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} readOnly={pending} />
          <label htmlFor="password">Mật khẩu</label>
          <div className="password">
            <input id="password" type={visible ? 'text' : 'password'} autoComplete="current-password"
              value={password} onChange={(event) => setPassword(event.target.value)} required readOnly={pending} />
            <button type="button" className="visibility" onClick={() => setVisible(!visible)}
              aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{visible ? 'Ẩn' : 'Hiện'}</button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="submit" type="submit" disabled={pending}>
            {pending ? <><span className="spinner" aria-hidden="true" />Đang đăng nhập…</>
              : <>Đăng nhập <span className="arrow" aria-hidden="true">→</span></>}
          </button>
          <p className="contact">Gặp vấn đề khi đăng nhập? Liên hệ đội IT.</p>
        </form>
      </section>
    </main>
  );
}

function WorkspacePage({ account, onLogout }: { account: Account; onLogout: () => void }) {
  const [logoutError, setLogoutError] = useState('');
  const [pending, setPending] = useState(false);
  const accessSelected = location.pathname.startsWith('/access-requests');
  const knowledgeAvailable = account.role !== 'MANAGER';
  const knowledgeSelected = knowledgeAvailable && /^\/knowledge(?:\/|$)/.test(location.pathname);
  const navigation = {
    EMPLOYEE: { title: 'Cổng nhân viên', role: 'Nhân viên', initials: 'NV', href: '/requests',
      primary: 'Sự cố của tôi', access: 'Yêu cầu cấp quyền', icon: '▦' },
    IT: { title: 'Đội IT', role: 'Nhân viên IT', initials: 'IT', href: '/it/incidents',
      primary: 'Hàng đợi sự cố', access: 'Yêu cầu cấp quyền', icon: '▤' },
    MANAGER: { title: 'Cổng quản lý', role: 'Quản lý', initials: 'QL', href: '/',
      primary: 'Tổng quan', access: 'Yêu cầu cần duyệt', icon: '◫' },
  }[account.role];

  async function logout() {
    if (pending) return;
    setPending(true);
    setLogoutError('');
    try {
      await signOut();
      onLogout();
    } catch {
      setLogoutError('Đăng xuất chưa hoàn tất. Vui lòng thử lại.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <Brand />
        <p className="workspace-nav-title">{navigation.title}</p>
        <nav aria-label="Cổng làm việc">
          <a href={navigation.href} aria-current={accessSelected || knowledgeSelected ? undefined : 'page'}>
            <span aria-hidden="true">{navigation.icon}</span>{navigation.primary}
          </a>
          <a href="/access-requests" aria-current={accessSelected ? 'page' : undefined}>
            <span aria-hidden="true">◇</span>{navigation.access}
          </a>
          {knowledgeAvailable && <a href="/knowledge" aria-current={knowledgeSelected ? 'page' : undefined}>
            <span aria-hidden="true">▤</span>Kho hướng dẫn
          </a>}
        </nav>
        <div className="workspace-account">
          <span className="workspace-avatar" aria-hidden="true">{navigation.initials}</span>
          <div><strong title={account.email}>{account.email}</strong><small>{navigation.role}</small></div>
        </div>
      </aside>
      <div className="workspace-page">
        <header className="workspace-toolbar">
          <div>{navigation.title} <span aria-hidden="true">/</span>
            <strong>{knowledgeSelected ? "Kho hướng dẫn" : accessSelected ? navigation.access : navigation.primary}</strong></div>
          <div className="workspace-toolbar-actions">
            <Notifications />
            <button className="secondary" type="button" disabled={pending}
              onClick={logout}>{pending ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
          </div>
        </header>
        <main className="workspace-content">
          {logoutError && <p role="alert" className="form-error">{logoutError}</p>}
          {knowledgeSelected ? <KnowledgePortal staff={account.role === 'IT'} />
            : accessSelected ? <AccessPortal account={account} />
            : account.role === 'MANAGER' ? <ManagerOverview />
              : account.role === 'EMPLOYEE' ? <EmployeePortal /> : <ItPortal email={account.email} />}
        </main>
      </div>
    </div>
  );
}

function App() {
  const [account, setAccount] = useState<Account | null>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    currentAccount(controller.signal).then(
      (result) => setAccount(result),
      () => { if (!controller.signal.aborted) setError('Không kết nối được hệ thống. Vui lòng thử lại.'); },
    );
    return () => controller.abort();
  }, [attempt]);

  if (account) return <WorkspacePage account={account} onLogout={() => { history.replaceState(null, '', '/'); setAccount(null); }} />;
  if (account === null) return <Login onLogin={setAccount} />;

  return (
    <main className="session-check">
      <section className="workspace-card">
        <Brand />
        {error ? <>
          <p className="form-error" role="alert">{error}</p>
          <button className="secondary" type="button" onClick={() => {
            setError('');
            setAttempt((count) => count + 1);
          }}>Kiểm tra lại</button>
        </> : <p role="status">Đang kiểm tra phiên đăng nhập…</p>}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
