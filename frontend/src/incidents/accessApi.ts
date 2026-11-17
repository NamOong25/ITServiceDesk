import { postWithCsrf, type Role } from '../auth';

export const accessLabels = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  IN_PROGRESS: 'Đang xử lý',
  FULFILLED: 'Đã cấp quyền',
} as const;

export type AccessStatus = keyof typeof accessLabels;

export type AccessRequest = {
  id: number;
  systemName: string;
  requestedPermission: string;
  reason: string;
  status: AccessStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  requester: string;
  manager: string;
  assignee: string | null;
};

export type AccessDraft = Pick<AccessRequest, 'systemName' | 'requestedPermission' | 'reason'>;

const endpoints: Record<Role, string> = {
  EMPLOYEE: '/api/access-requests',
  MANAGER: '/api/manager/access-requests',
  IT: '/api/it/access-requests',
};

function check(response: Response) {
  if (response.ok) return;
  const messages: Record<number, string> = {
    400: 'Kiểm tra thông tin đã nhập rồi thử lại.',
    401: 'Phiên đăng nhập đã hết hạn. Hãy tải lại trang.',
    403: 'Bạn không có quyền thực hiện thao tác này.',
    404: 'Không tìm thấy yêu cầu cấp quyền.',
    409: 'Yêu cầu đã đổi trạng thái. Hãy tải lại trang trước khi thử lại.',
    422: 'Tài khoản của bạn chưa có quản lý trực tiếp. Vui lòng liên hệ đội IT.',
  };
  throw new Error(messages[response.status] ?? 'Chưa xử lý được yêu cầu. Vui lòng thử lại.');
}

export async function listAccess(role: Role, signal: AbortSignal): Promise<AccessRequest[]> {
  const response = await fetch(endpoints[role], { signal });
  check(response);
  return response.json();
}

export async function getAccess(role: Role, id: number, signal: AbortSignal): Promise<AccessRequest> {
  const response = await fetch(endpoints[role] + '/' + id, { signal });
  check(response);
  return response.json();
}

export async function submitAccess(draft: AccessDraft, submissionKey: string): Promise<AccessRequest> {
  const response = await postWithCsrf(endpoints.EMPLOYEE, JSON.stringify({ ...draft, submissionKey }));
  check(response);
  return response.json();
}

export async function updateAccess(role: Role, id: number, action: 'decision' | 'claim' | 'complete',
  decision?: { outcome: 'APPROVED' | 'REJECTED'; note: string }): Promise<void> {
  const response = await postWithCsrf(endpoints[role] + '/' + id + '/' + action,
    decision ? JSON.stringify(decision) : undefined);
  check(response);
}
