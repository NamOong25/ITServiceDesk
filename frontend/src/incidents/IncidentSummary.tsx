import { useState } from 'react';
import { dateFormat, generateIncidentSummary, type Activity, type IncidentSummaryResult } from './api';

export function IncidentSummary({ incidentId, saved, latestReply }: {
  incidentId: number;
  saved: IncidentSummaryResult | null;
  latestReply: Activity | undefined;
}) {
  const [generated, setGenerated] = useState<IncidentSummaryResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  // A detail poll can finish while generation is running, so prefer the latest saved result.
  const result = generated && (!saved || generated.coveredReplyId > saved.coveredReplyId
    || (generated.coveredReplyId === saved.coveredReplyId &&
      Date.parse(generated.generatedAt) >= Date.parse(saved.generatedAt))) ? generated : saved;
  const newReply = result && latestReply && latestReply.id > result.coveredReplyId ? latestReply : null;

  async function generate() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      setGenerated(await generateIncidentSummary(incidentId));
    } catch (failure) {
      setError(failure instanceof TypeError ? 'Mất kết nối. Vui lòng thử lại.'
        : failure instanceof Error ? failure.message : 'Chưa tạo được tóm tắt. Vui lòng thử lại.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="incident-card ai-summary" aria-labelledby="incident-summary-title">
      <div className="ai-summary-header">
        <div className="ai-summary-title">
          <span aria-hidden="true">✦</span>
          <div>
            <h2 id="incident-summary-title">Tóm tắt bằng AI</h2>
            <p>Từ mô tả và các phản hồi công khai</p>
          </div>
        </div>
        <button type="button" className={newReply ? 'incident-primary' : 'secondary'}
          disabled={pending} onClick={() => void generate()}>
          {pending ? 'Đang tóm tắt…' : newReply ? 'Cập nhật tóm tắt' : result ? 'Tạo lại tóm tắt' : 'Tạo tóm tắt'}
        </button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div aria-live="polite" aria-busy={pending}>
        {result && <>
          <div className="ai-summary-status">
            <span className="incident-pill" data-new-reply={!!newReply}>{newReply ? 'Có phản hồi mới' : 'Đã lưu'}</span>
            <time dateTime={result.generatedAt}>Lưu lúc {dateFormat.format(new Date(result.generatedAt))}</time>
          </div>
          {newReply && <p className="ai-summary-update">
            Bản đã lưu chưa bao gồm phản hồi lúc {dateFormat.format(new Date(newReply.createdAt))}.
          </p>}
          <div className="ai-summary-results">
            <div><h3>Sự cố</h3><p>{result.summary.issue}</p></div>
            <div><h3>Đã thử</h3><p>{result.summary.attempted}</p></div>
            <div><h3>Còn vướng</h3><p>{result.summary.outstanding}</p></div>
            {result.limitedHistory && <p className="ai-summary-note">Bản tóm tắt dùng 12 phản hồi gần nhất tại thời điểm tạo.</p>}
          </div>
        </>}
      </div>
      <footer>Chỉ gửi dữ liệu mẫu hoặc đã bỏ thông tin nhạy cảm tới Gemini.
        {result && ' Đối chiếu kết quả với lịch sử bên dưới.'}</footer>
    </section>
  );
}
