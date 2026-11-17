import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const statusLabels = {
  checking: 'Đang kiểm tra kết nối…',
  connected: 'Đã kết nối PostgreSQL',
  unavailable: 'PostgreSQL chưa sẵn sàng',
  offline: 'Chưa kết nối được backend',
};

type Connection = keyof typeof statusLabels;

async function checkConnection(signal: AbortSignal): Promise<Connection> {
  const response = await fetch('/actuator/health/database', { signal });
  const health: { status?: string } = await response.json();

  if (response.ok && health.status === 'UP') return 'connected';
  return health.status ? 'unavailable' : 'offline';
}

function App() {
  const [connection, setConnection] = useState<Connection>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    checkConnection(controller.signal).then(
      (result) => { if (!controller.signal.aborted) setConnection(result); },
      () => { if (!controller.signal.aborted) setConnection('offline'); },
    );
    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setConnection('checking');
    setAttempt((count) => count + 1);
  }

  return (
    <main>
      <section className="card" aria-labelledby="title">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h16v11H4zM8 20h8m-4-4v4M8 9l2 2-2 2m5 0h3" />
          </svg>
        </div>
        <h1 id="title">IT Service Desk</h1>
        <p>Hệ thống hỗ trợ IT nội bộ</p>
        <div className="connection">
          <p className="status" data-state={connection} role="status">{statusLabels[connection]}</p>
          <button type="button" onClick={retry} disabled={connection === 'checking'}>Kiểm tra lại</button>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
