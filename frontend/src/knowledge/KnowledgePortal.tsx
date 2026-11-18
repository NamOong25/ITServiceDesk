import { useEffect, useRef, useState, type FormEvent } from 'react';
import { categories, dateFormat, ticketCode } from '../incidents/api';
import { createDraftFromIncident, getArticle, listArticles, saveArticle,
  type Article, type ArticleSummary, type StaffArticle } from './api';
import './knowledge.css';

function errorText(failure: unknown) {
  return failure instanceof Error && !(failure instanceof TypeError) ? failure.message : 'Mất kết nối. Vui lòng thử lại.';
}

function normalized(text: string) {
  return text.toLocaleLowerCase('vi-VN').normalize('NFD').replace(/\p{M}/gu, '').replaceAll('đ', 'd');
}

export function DraftArticleButton({ incidentId }: { incidentId: number }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    setPending(true);
    setError('');
    try {
      const article = await createDraftFromIncident(incidentId);
      window.location.assign('/knowledge/' + article.id);
    } catch (failure) {
      setError(errorText(failure));
      setPending(false);
    }
  }

  return <div className="knowledge-draft-link">
    <button className="secondary" type="button" disabled={pending} onClick={() => void create()}>
      {pending ? 'Đang mở bản nháp…' : 'Soạn bài hướng dẫn'}
    </button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

export function AttachedArticle({ id, title }: { id: number; title: string }) {
  return <div className="knowledge-attachment"><strong>Hướng dẫn đã thử</strong>
    <a href={'/knowledge/' + id}>{title}</a>
  </div>;
}

function Listing({ articles, staff }: { articles: ArticleSummary[]; staff: boolean }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const term = normalized(query.trim());
  const rows = articles.filter((article) =>
    (!category || category === article.category) &&
    (!status || (status === 'published') === !!article.publishedAt) &&
    normalized(article.title).includes(term));

  return <>
    <div className="incident-heading">
      <div><h1>Kho hướng dẫn</h1>
        <p className="incident-intro">{staff ? 'Soạn và xuất bản hướng dẫn từ các sự cố đã giải quyết.'
          : 'Tìm cách khắc phục các lỗi thường gặp.'}</p>
      </div>
    </div>
    <section className="incident-card knowledge-list">
      <div className="knowledge-filters">
        <div><label htmlFor="knowledge-search">Tìm theo tiêu đề</label>
          <input id="knowledge-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div><label htmlFor="knowledge-category">Nhóm sự cố</label>
          <select id="knowledge-category" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Tất cả nhóm</option>
            {Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></div>
        {staff && <div><label htmlFor="knowledge-status">Trạng thái</label>
          <select id="knowledge-status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Tất cả trạng thái</option><option value="draft">Bản nháp</option>
            <option value="published">Đã xuất bản</option>
          </select></div>}
      </div>
      {rows.length > 0 ? <ul className="knowledge-rows" role="list">
        {rows.map((article) => <li key={article.id}><a href={'/knowledge/' + article.id}>
          <div><strong>{article.title}</strong><small>{categories[article.category]}</small></div>
          {staff && <span className="knowledge-status" data-published={!!article.publishedAt}>
            {article.publishedAt ? 'Đã xuất bản' : 'Bản nháp'}
          </span>}
        </a></li>)}
      </ul> : <p className="incident-intro">{articles.length ? 'Không có bài khớp điều kiện tìm kiếm.'
        : staff ? 'Chưa có bài. Mở một sự cố đã giải quyết để soạn bài đầu tiên.' : 'Chưa có bài hướng dẫn được xuất bản.'}</p>}
    </section>
  </>;
}

function ArticleView({ article, staff }: { article: Article; staff: boolean }) {
  return <>
    <div className="incident-heading">
      <div><p className="incident-code">{categories[article.category]}</p>
        <h1>{article.title}</h1>
        {article.publishedAt && <p className="incident-intro">
          Xuất bản <time dateTime={article.publishedAt}>{dateFormat.format(new Date(article.publishedAt))}</time>
        </p>}</div>
    </div>
    <article className="incident-card knowledge-content">
      <h2>Cách xử lý</h2><p className="incident-description">{article.body}</p>
      {!staff && <div className="knowledge-next">
        <span>Bạn đã thử và sự cố vẫn còn?</span>
        <a className="incident-primary knowledge-link-button" href={'/requests/new?article=' + article.id}>Báo sự cố</a>
      </div>}
    </article>
  </>;
}

function Editor({ initial }: { initial: StaffArticle }) {
  const [article, setArticle] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false);

  function update(changes: Partial<StaffArticle>) {
    setArticle((current) => ({ ...current, ...changes }));
    setSaved(false);
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const publish = submitter?.getAttribute('value') === 'publish';
    if (!article.title.trim() || (publish && !article.body.trim())) {
      setError(publish ? 'Nhập tiêu đề và các bước xử lý trước khi xuất bản.' : 'Nhập tiêu đề bài hướng dẫn.');
      return;
    }

    submitting.current = true;
    setPending(true);
    setSaved(false);
    setError('');
    try {
      setArticle(await saveArticle(article, publish));
      setSaved(true);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  const source = <p className="knowledge-source"><a href={'/it/incidents/' + article.sourceIncidentId}>
    Sự cố nguồn {ticketCode(article.sourceIncidentId)}
  </a></p>;
  if (article.publishedAt) return <>
    {saved && <p className="incident-success knowledge-save-message" role="status">Đã xuất bản bài hướng dẫn.</p>}
    <ArticleView article={article} staff />{source}
  </>;

  return <>
    <div className="incident-heading"><div><h1>Soạn bài hướng dẫn</h1>{source}</div>
      <span className="knowledge-status">Bản nháp</span></div>
    <form className="incident-card knowledge-content" onSubmit={submit} aria-busy={pending}>
      <fieldset disabled={pending}>
        <label htmlFor="article-title">Tiêu đề</label>
        <input id="article-title" value={article.title} required maxLength={120}
          onChange={(event) => update({ title: event.target.value })} />
        <label htmlFor="article-category">Nhóm sự cố</label>
        <select id="article-category" value={article.category}
          onChange={(event) => update({ category: event.target.value as Article['category'] })}>
          {Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <label htmlFor="article-body">Các bước xử lý</label>
        <textarea id="article-body" rows={8} maxLength={8000} value={article.body}
          onChange={(event) => update({ body: event.target.value })}
          placeholder="Viết từng bước để nhân viên có thể tự thực hiện." />
        {error && <p className="form-error" role="alert">{error}</p>}
        {saved && <p className="incident-success" role="status">Đã lưu bản nháp.</p>}
        <div className="incident-actions knowledge-next">
          <button type="submit" className="secondary" value="draft">Lưu bản nháp</button>
          <button type="submit" className="incident-primary" value="publish">Xuất bản</button>
        </div>
      </fieldset>
    </form>
  </>;
}

export function KnowledgePortal({ staff }: { staff: boolean }) {
  const path = window.location.pathname;
  const match = /^\/knowledge\/([1-9][0-9]*)$/.exec(path);
  const articleId = match ? Number(match[1]) : null;
  const [articles, setArticles] = useState<ArticleSummary[] | null>(null);
  const [article, setArticle] = useState<Article | StaffArticle | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    const failed = (failure: unknown) => {
      if (!controller.signal.aborted) setError(errorText(failure));
    };
    if (articleId === null) {
      listArticles(staff, controller.signal).then((rows) => {
        if (!controller.signal.aborted) setArticles(rows);
      }, failed);
    } else {
      getArticle<Article | StaffArticle>(articleId, staff, controller.signal).then((value) => {
        if (!controller.signal.aborted) setArticle(value);
      }, failed);
    }
    return () => controller.abort();
  }, [articleId, staff, attempt]);

  return <section className="employee-main knowledge">
    {articleId !== null && <a href="/knowledge" className="incident-back knowledge-back">← Kho hướng dẫn</a>}
    {articleId === null && articles && <Listing articles={articles} staff={staff} />}
    {article && ('revision' in article ? <Editor initial={article} /> : <ArticleView article={article} staff={staff} />)}
    {error ? <div className="incident-card incident-load-status">
      <p className="form-error" role="alert">{error}</p>
      <button type="button" className="secondary" onClick={() => setAttempt((current) => current + 1)}>Thử lại</button>
    </div> : !article && !articles && <p className="incident-intro" role="status">Đang tải kho hướng dẫn…</p>}
  </section>;
}
