export type Role = 'EMPLOYEE' | 'IT' | 'MANAGER';
export type Account = { email: string; role: Role };
export type Workspace = { title: string };

const workspacePaths: Record<Role, string> = {
  EMPLOYEE: '/api/workspaces/employee',
  IT: '/api/workspaces/it',
  MANAGER: '/api/workspaces/manager',
};

export async function currentAccount(signal?: AbortSignal): Promise<Account | null> {
  const response = await fetch('/api/auth/me', { signal });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Không kết nối được hệ thống. Vui lòng thử lại.');
  return response.json();
}

export async function loadWorkspace(role: Role, signal: AbortSignal): Promise<Workspace> {
  const response = await fetch(workspacePaths[role], { signal });
  if (!response.ok) throw new Error('Chưa mở được trang làm việc. Vui lòng thử lại.');
  return response.json();
}

export async function postWithCsrf(path: string, body?: URLSearchParams | string): Promise<Response> {
  const response = await fetch('/api/auth/csrf');
  if (!response.ok) throw new Error('Không kết nối được hệ thống. Vui lòng thử lại.');
  const csrf: { headerName: string; token: string } = await response.json();
  const headers: Record<string, string> = { [csrf.headerName]: csrf.token };
  if (typeof body === 'string') headers['Content-Type'] = 'application/json';
  return fetch(path, { method: 'POST', headers, body });
}

export async function signIn(email: string, password: string): Promise<Account> {
  const response = await postWithCsrf('/api/auth/login', new URLSearchParams({ email, password }));
  if (response.status === 401) throw new Error('Email hoặc mật khẩu chưa đúng.');
  if (!response.ok) throw new Error('Đăng nhập chưa hoàn tất. Vui lòng thử lại.');
  const account = await currentAccount();
  if (!account) throw new Error('Đăng nhập chưa hoàn tất. Vui lòng thử lại.');
  return account;
}

export async function signOut(): Promise<void> {
  const response = await postWithCsrf('/api/auth/logout');
  if (!response.ok) throw new Error('Đăng xuất chưa hoàn tất. Vui lòng thử lại.');
}
