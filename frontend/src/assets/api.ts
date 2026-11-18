import { postWithCsrf } from '../auth';
import type { IncidentSummary } from '../incidents/api';

export const assetKinds = {
  LAPTOP: 'Laptop', DESKTOP: 'Máy tính bàn', MONITOR: 'Màn hình', PRINTER: 'Máy in', OTHER: 'Khác',
} as const;

export const assetStates = {
  IN_USE: 'Đang sử dụng', AVAILABLE: 'Sẵn sàng', MAINTENANCE: 'Bảo trì', RETIRED: 'Ngừng sử dụng',
} as const;

export type AssetChoice = { id: number; code: string; name: string };
export type Asset = AssetChoice & {
  kind: keyof typeof assetKinds;
  status: keyof typeof assetStates;
  assignedToId: number | null;
  assignee: string | null;
  revision: number;
  incidentCount: number;
};
export type AssetDetail = {
  asset: Asset;
  history: Pick<IncidentSummary, 'id' | 'title' | 'status' | 'createdAt'>[];
};
export type AssetDraft = Pick<Asset, 'code' | 'name' | 'kind' | 'status' | 'assignedToId' | 'revision'>;
export type Assignee = { id: number; email: string };
const staffPath = '/api/it/assets';

async function read<T>(response: Response): Promise<T> {
  if (response.status === 404) throw new Error('Không tìm thấy thiết bị.');
  if (response.status === 401) throw new Error('Phiên đăng nhập đã hết hạn.');
  if (response.status === 400) throw new Error('Kiểm tra thông tin thiết bị và người sử dụng rồi thử lại.');
  if (!response.ok) throw new Error('Chưa tải được thiết bị. Vui lòng thử lại.');
  return response.json();
}

export async function listMine(signal: AbortSignal): Promise<AssetChoice[]> {
  return read(await fetch('/api/assets/mine', { signal }));
}

export async function listAssets(signal: AbortSignal): Promise<Asset[]> {
  return read(await fetch(staffPath, { signal }));
}

export async function getAsset(id: number, signal: AbortSignal): Promise<AssetDetail> {
  return read(await fetch(staffPath + '/' + id, { signal }));
}

export async function listAssignees(signal: AbortSignal): Promise<Assignee[]> {
  return read(await fetch(staffPath + '/assignees', { signal }));
}

export async function saveAsset(draft: AssetDraft, id?: number): Promise<Asset> {
  const { code, name, kind, status, assignedToId, revision } = draft;
  const response = await postWithCsrf(id === undefined ? staffPath : staffPath + '/' + id + '/edit',
    JSON.stringify({ code, name, kind, status, assignedToId, revision }));
  if (response.status === 409) {
    throw new Error(id === undefined ? 'Mã tài sản đã tồn tại.' : 'Thiết bị đã được cập nhật. Tải lại trang để xem thông tin mới.');
  }
  return read(response);
}
