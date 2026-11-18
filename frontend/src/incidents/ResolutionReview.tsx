import { useEffect, useRef, useState } from 'react';
import { dateFormat, submitResolutionFeedback, type Activity, type Incident, type ResolutionFeedback } from './api';

export function ResolutionReview({ incidentId, resolution, confirmed, onReview }: {
  incidentId: number;
  resolution: Activity;
  confirmed: boolean;
  onReview: (incident: Incident) => void;
}) {
  const [showReason, setShowReason] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<ResolutionFeedback['decision'] | null>(null);
  const [error, setError] = useState('');
  const request = useRef<ResolutionFeedback | null>(null);
  const sending = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function submit(decision: ResolutionFeedback['decision']) {
    const body = decision === 'REOPENED' ? draft.trim() : null;
    if (sending.current || confirmed || (decision === 'REOPENED' && !body)) return;
    sending.current = true;
    setPending(decision);
    setError('');

    try {
      const previous = request.current;
      const feedback = previous?.decision === decision && previous.body === body
        ? previous : { resolutionId: resolution.id, decision, body, submissionKey: crypto.randomUUID() };
      request.current = feedback;
      const updated = await submitResolutionFeedback(incidentId, feedback);
      if (mounted.current) onReview(updated);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof TypeError ? 'Mất kết nối. Bạn có thể thử gửi lại.'
        : failure instanceof Error ? failure.message : 'Chưa ghi nhận được phản hồi.');
    } finally {
      sending.current = false;
      if (mounted.current) setPending(null);
    }
  }

  return (
    <section className="incident-card resolution-review" aria-labelledby="resolution-review-title" aria-busy={!!pending}>
      <div className="resolution-review-title">
        <span aria-hidden="true">✓</span>
        <h2 id="resolution-review-title">{confirmed ? 'Đã xác nhận khắc phục' : 'Sự cố đã được khắc phục chưa?'}</h2>
      </div>
      {confirmed ? <p className="resolution-review-intro" role="status">Xác nhận của bạn đã được lưu trong lịch sử sự cố.</p>
        : <>
          <p className="resolution-review-intro">Đội IT đã đánh dấu sự cố là đã giải quyết lúc{' '}
            <time dateTime={resolution.createdAt}>{dateFormat.format(new Date(resolution.createdAt))}</time>.</p>
          <div className="resolution-review-actions">
            <button className="secondary" type="button" disabled={!!pending} onClick={() => void submit('CONFIRMED')}>
              {pending === 'CONFIRMED' ? 'Đang xác nhận…' : 'Đã khắc phục'}
            </button>
            <button className="secondary" type="button" disabled={!!pending} aria-expanded={showReason}
              aria-controls={showReason ? 'resolution-review-reason' : undefined}
              onClick={() => { setShowReason(!showReason); setError(''); }}>
              Lỗi vẫn còn
            </button>
          </div>
          {showReason && <form id="resolution-review-reason" className="resolution-review-form" onSubmit={(event) => {
            event.preventDefault();
            void submit('REOPENED');
          }}>
            <label htmlFor="reopen-reason">Lỗi nào vẫn còn xảy ra?</label>
            <textarea id="reopen-reason" rows={2} maxLength={4000} required readOnly={!!pending}
              value={draft} onChange={(event) => { setDraft(event.target.value); setError(''); }} />
            <div className="resolution-review-send">
              <button className="incident-primary" type="submit" disabled={!!pending || !draft.trim()}>
                {pending === 'REOPENED' ? 'Đang gửi…' : 'Gửi và mở lại sự cố'}
              </button>
            </div>
          </form>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </>}
    </section>
  );
}
