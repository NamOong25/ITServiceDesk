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
  status: 'NEW';
  createdAt: string;
};

export type Incident = IncidentSummary & {
  impact: keyof typeof impacts;
  description: string;
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
