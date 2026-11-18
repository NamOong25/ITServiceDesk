import { postWithCsrf } from '../auth';

export const categories = {
  NETWORK: 'Mạng và VPN',
  DEVICE: 'Máy tính và thiết bị',
  SOFTWARE: 'Phần mềm và email',
  OTHER: 'Khác',
} as const;

export const impacts = {
  PERSONAL: 'Chỉ mình tôi',
  TEAM: 'Một nhóm',
  MANY_USERS: 'Nhiều người',
} as const;

export type Draft = {
  title: string;
  category: keyof typeof categories | '';
  impact: keyof typeof impacts | '';
  description: string;
};

export type IncidentSummary = {
  id: number;
  title: string;
  category: keyof typeof categories;
  status: IncidentStatus;
  createdAt: string;
};

export type Incident = IncidentSummary & {
  impact: keyof typeof impacts;
  description: string;
  assignee: string | null;
  activity: Activity[];
};

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  if (response.status === 401) throw new Error('Phiên đăng nhập đã hết hạn. Hãy tải lại trang để đăng nhập.');
  if (response.status === 404) throw new Error('Không tìm thấy yêu cầu này.');
  if (response.status === 400) throw new Error('Kiểm tra các trường trong form rồi thử lại.');
  if (!response.ok) throw new Error(fallback);
  return response.json();
}

export async function listIncidents(signal: AbortSignal): Promise<IncidentSummary[]> {
  return readResponse(await fetch('/api/incidents', { signal }), 'Chưa tải được danh sách yêu cầu.');
}

export async function getIncident(id: number, signal: AbortSignal): Promise<Incident> {
  return readResponse(await fetch('/api/incidents/' + id, { signal }), 'Chưa tải được chi tiết yêu cầu.');
}

export async function createIncident(draft: Draft, submissionKey: string): Promise<Incident> {
  return readResponse(await postWithCsrf('/api/incidents', JSON.stringify({ ...draft, submissionKey })),
    'Chưa gửi được yêu cầu. Vui lòng thử lại.');
}

export async function replyToIncident(id: number, body: string, submissionKey: string): Promise<Incident> {
  const response = await postWithCsrf('/api/incidents/' + id + '/messages', JSON.stringify({ body, submissionKey }));
  if (response.status === 409) {
    throw new Error('Sự cố đã đổi trạng thái hoặc phản hồi đã được ghi nhận. Hãy tải lại yêu cầu.');
  }
  return readResponse(response, 'Chưa gửi được phản hồi. Vui lòng thử lại.');
}

export const statusLabels = {
  NEW: 'Mới',
  IN_PROGRESS: 'Đang xử lý',
  RESOLVED: 'Đã giải quyết',
} as const;

export const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
});

export function ticketCode(id: number) {
  return 'IT-' + id;
}

export type IncidentStatus = keyof typeof statusLabels;
export type Activity = {
  id: number;
  kind: 'ASSIGNED' | 'PUBLIC_REPLY' | 'REQUESTER_REPLY' | 'INTERNAL_NOTE' | 'RESOLVED';
  actor: string;
  body: string | null;
  createdAt: string;
};

type ItTicket = IncidentSummary & {
  impact: keyof typeof impacts;
  requester: string;
  assignee: string | null;
};

export type ReplySla = {
  dueAt: string;
  firstReplyAt: string | null;
  state: 'PENDING' | 'DUE_SOON' | 'OVERDUE' | 'ON_TIME' | 'LATE';
  minutes: number;
  periods: { start: string; end: string }[];
};

export type QueueItem = ItTicket & { sla: ReplySla };

export type ItDetail = {
  ticket: ItTicket & { description: string };
  activity: Activity[];
  sla: ReplySla;
  savedSummary: IncidentSummaryResult | null;
};

const itPath = '/api/it/incidents';

export async function listItIncidents(signal: AbortSignal): Promise<QueueItem[]> {
  return readResponse(await fetch(itPath, { signal }), 'Chưa tải được hàng đợi IT.');
}

export async function getItIncident(id: number, signal: AbortSignal): Promise<ItDetail> {
  return readResponse(await fetch(itPath + '/' + id, { signal }), 'Chưa tải được chi tiết sự cố.');
}

export async function sendItUpdate(id: number, action: 'claim' | 'resolve' | 'messages',
  payload?: { kind: 'PUBLIC_REPLY' | 'INTERNAL_NOTE'; body: string; submissionKey: string }): Promise<void> {
  const response = await postWithCsrf(itPath + '/' + id + '/' + action,
    payload ? JSON.stringify(payload) : undefined);
  if (response.status === 403 || response.status === 409) {
    throw new Error('Sự cố đã đổi trạng thái hoặc người xử lý. Hãy tải lại trang.');
  }
  if (response.status === 401) throw new Error('Phiên đăng nhập đã hết hạn. Hãy tải lại trang để đăng nhập.');
  if (!response.ok) throw new Error('Chưa cập nhật được sự cố. Vui lòng thử lại.');
}

export type IncidentSummaryResult = {
  summary: { issue: string; attempted: string; outstanding: string };
  limitedHistory: boolean;
  coveredReplyId: number;
  generatedAt: string;
};

export async function generateIncidentSummary(id: number): Promise<IncidentSummaryResult> {
  const response = await postWithCsrf(itPath + '/' + id + '/summary');
  if (response.status === 503) throw new Error('Chưa kết nối được Gemini. Kiểm tra API key của backend.');
  if (response.status === 429) throw new Error('Gemini đã chạm hạn mức. Vui lòng thử lại sau.');
  return readResponse(response, 'Gemini chưa trả được bản tóm tắt. Vui lòng thử lại.');
}
