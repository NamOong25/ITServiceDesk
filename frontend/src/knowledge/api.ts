import { postWithCsrf } from '../auth';
import { type categories } from '../incidents/api';

export type ArticleSummary = {
  id: number;
  title: string;
  category: keyof typeof categories;
  publishedAt: string | null;
};
export type Article = ArticleSummary & { body: string };
export type StaffArticle = Article & { sourceIncidentId: number; revision: number };

const publicPath = '/api/knowledge';
const staffPath = '/api/it/knowledge';

async function read<T>(response: Response): Promise<T> {
  if (response.status === 401) throw new Error('Phiên đăng nhập đã hết hạn.');
  if (response.status === 404) throw new Error('Không tìm thấy bài hướng dẫn.');
  if (response.status === 409) throw new Error('Bài hoặc sự cố đã thay đổi. Tải lại trang rồi thử lại.');
  if (response.status === 400) throw new Error('Kiểm tra tiêu đề, nhóm sự cố và nội dung hướng dẫn.');
  if (!response.ok) throw new Error('Chưa tải hoặc lưu được bài hướng dẫn. Vui lòng thử lại.');
  return response.json();
}

export async function listArticles(staff: boolean, signal: AbortSignal): Promise<ArticleSummary[]> {
  return read(await fetch(staff ? staffPath : publicPath, { signal }));
}

export async function getArticle<T extends Article>(id: number, staff: boolean, signal: AbortSignal): Promise<T> {
  return read(await fetch((staff ? staffPath : publicPath) + '/' + id, { signal }));
}

export async function createDraftFromIncident(id: number): Promise<StaffArticle> {
  return read(await postWithCsrf(staffPath + '/from-incident/' + id));
}

export async function saveArticle(article: StaffArticle, publish: boolean): Promise<StaffArticle> {
  return read(await postWithCsrf(staffPath + '/' + article.id + '/edit', JSON.stringify({
    title: article.title, category: article.category, body: article.body, revision: article.revision, publish,
  })));
}
