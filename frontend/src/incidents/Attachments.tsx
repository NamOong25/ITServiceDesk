import { useState, type ChangeEvent } from 'react';
import type { IncidentAttachment } from './api';
import './attachments.css';

const maxFiles = 3;
const maxSize = 5 * 1024 * 1024;

function size(bytes: number) {
  return bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

export function AttachmentPicker({ id, files, onChange, disabled = false }: {
  id: string; files: File[]; onChange: (files: File[]) => void; disabled?: boolean;
}) {
  const [error, setError] = useState('');

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (!selected.length) return;

    if (files.length + selected.length > maxFiles) {
      setError('Chọn tối đa 3 tệp mỗi lần gửi.');
      return;
    }
    if (selected.some((file) => !/\.(png|jpe?g|pdf)$/i.test(file.name) || file.size === 0 || file.size > maxSize)) {
      setError('Chọn tệp PNG, JPG hoặc PDF dung lượng từ 1 byte đến 5 MB.');
      return;
    }
    setError('');
    onChange([...files, ...selected]);
  }

  return <div className="attachment-picker">
    <label htmlFor={id}>Tệp đính kèm</label>
    <input id={id} type="file" accept=".png,.jpg,.jpeg,.pdf" multiple disabled={disabled} onChange={choose}
      aria-describedby={id + '-help'} />
    <small id={id + '-help'}>PNG, JPG hoặc PDF · tối đa 3 tệp · 5 MB mỗi tệp</small>
    {error && <p className="form-error" role="alert">{error}</p>}
    {files.length > 0 && <ul className="attachment-selected">
      {files.map((file, index) => <li key={index}>
        <span>{file.name} <small>{size(file.size)}</small></span>
        <button type="button" disabled={disabled} aria-label={'Bỏ tệp ' + file.name} onClick={() => {
          setError('');
          onChange(files.filter((_, current) => current !== index));
        }}>Bỏ</button>
      </li>)}
    </ul>}
  </div>;
}

export function AttachmentList({ incidentId, files, staff = false }: {
  incidentId: number; files?: IncidentAttachment[]; staff?: boolean;
}) {
  if (!files?.length) return null;
  const base = (staff ? '/api/it/incidents/' : '/api/incidents/') + incidentId + '/attachments/';
  return <ul className="attachment-list" aria-label="Tệp đính kèm">
    {files.map((file) => <li key={file.id}>
      <a href={base + file.id} target={file.mediaType.startsWith('image/') ? '_blank' : undefined} rel="noopener">
        {file.mediaType.startsWith('image/') && <img src={base + file.id} alt="" loading="lazy" />}
        <span><strong>{file.name}</strong><small>{size(file.sizeBytes)}</small></span>
      </a>
    </li>)}
  </ul>;
}
