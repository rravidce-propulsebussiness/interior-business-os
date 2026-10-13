'use client';

import { useEffect, useRef, useState } from 'react';

type Attachment = {
  id: string;
  filename: string;
  byte_size: number;
  created_at: string;
};

export function QuotationAttachments({
  revisionId,
  editable,
}: {
  revisionId: string;
  editable: boolean;
}) {
  const url = '/dashboard/quotations/' + revisionId + '/studio/attachments';
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const response = await fetch(url, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== 'object')
        throw new Error('Could not load attachments');
      const items = (result as { attachments?: Attachment[] }).attachments;
      setFiles(Array.isArray(items) ? items : []);
    } catch {
      setMessage('Could not load quotation PDFs. Retry or refresh.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Revision identity is stable while this panel is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisionId]);

  const upload = async (file: File) => {
    if (busy) return;
    if (!/\.pdf$/i.test(file.name) || file.type !== 'application/pdf') {
      setMessage('Choose a genuine PDF file.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setMessage('Maximum attachment size is 15 MB.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const data = new FormData();
      data.append('file', file);
      const response = await fetch(url, {
        method: 'POST',
        body: data,
        credentials: 'same-origin',
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || 'Upload failed.');
      setMessage(result.message || 'PDF uploaded.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'PDF upload failed.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async (attachmentId: string) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: attachmentId }),
        credentials: 'same-origin',
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || 'Removal failed.');
      setMessage(result.message || 'Removed.');
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not remove PDF.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="qs-card">
      <div className="qs-heading" style={{ marginBottom: 12 }}>
        <div>
          <h2>PDF specifications &amp; annexures</h2>
          <p className="qs-muted">
            Upload brochures, floor plans, material schedules and other PDF
            specifications. Uploaded PDFs are appended to the final downloadable
            quotation, in order.
          </p>
        </div>
        <span className="qs-selected-pill">{files.length} / 6 files</span>
      </div>
      {editable && (
        <div className="qs-info-box">
          <label
            htmlFor="quotation-studio-pdf"
            className="qs-btn ghost"
            style={{ cursor: busy ? 'wait' : 'pointer' }}
          >
            {busy ? 'Uploading PDF…' : '⇧ Upload supporting PDF'}
          </label>
          <input
            id="quotation-studio-pdf"
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy || files.length >= 6}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <span className="qs-muted" style={{ marginLeft: 10 }}>
            PDF · up to 15 MB each · 6 files per quotation
          </span>
        </div>
      )}
      <div className="qs-attachment-list" style={{ marginTop: 12 }}>
        {loading && <p className="qs-muted">Loading uploaded PDFs…</p>}
        {!loading && !files.length && (
          <div className="qs-info-box">
            No PDF annexures uploaded. Your generated quotation still contains
            its own pricing, specifications and company branding.
          </div>
        )}
        {files.map((file, index) => (
          <div
            key={file.id}
            className="qs-info-box"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <strong>
                ▤ {index + 1}. {file.filename}
              </strong>
              <div className="qs-muted">
                {(file.byte_size / 1024 / 1024).toFixed(1)} MB
              </div>
            </div>
            <div className="qs-toolbar">
              <a href={url + '/' + file.id} className="qs-btn">
                Download
              </a>
              {editable && (
                <button
                  type="button"
                  className="qs-btn"
                  disabled={busy}
                  onClick={() => void remove(file.id)}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {message && (
        <p role="status" className="qs-message" style={{ marginTop: 12 }}>
          {message}
        </p>
      )}
    </section>
  );
}
