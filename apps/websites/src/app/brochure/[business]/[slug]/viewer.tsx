'use client';
import { useEffect, useRef, useState } from 'react';
import { pageSize, type BrochureDocument } from '@business-os/brochure-builder';
import { brochureCss, pageHtml } from '@business-os/brochure-builder/render';
import './viewer.css';
export function BrochureViewer({
  document: d,
  sequence,
  businessName,
  formsEnabled,
  base,
}: {
  document: BrochureDocument;
  sequence: number;
  businessName: string;
  formsEnabled: boolean;
  base: string;
}) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [available, setAvailable] = useState(760);
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const [w, h] = pageSize(d);
  const scale = Math.min(1, (available - 24) / ((w * 96) / 25.4)) * zoom;
  const page = d.pages[index]!;
  const assetUrl = (id: string) => `${base}/assets/${id}?thumbnail=1`;
  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setAvailable(entries[0]?.contentRect.width ?? 760);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    void fetch(`${base}/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'view' }),
    });
  }, [base]);
  const contact = () => {
    void fetch(`${base}/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'cta' }),
    });
    setFormOpen(true);
  };
  return (
    <main id="main-content" className="public-brochure">
      <style>{brochureCss(d)}</style>
      <header className="public-brochure-header">
        <div>
          <p>{businessName}</p>
          <h1>{d.title}</h1>
        </div>
        <nav aria-label="Brochure actions">
          <button
            onClick={async () => {
              try {
                if (navigator.share)
                  await navigator.share({ title: d.title, url: location.href });
                else {
                  await navigator.clipboard.writeText(location.href);
                  setMessage('Link copied');
                }
              } catch {
                setMessage(
                  'Copy the address from your browser to share this brochure.',
                );
              }
            }}
          >
            Share
          </button>
          {d.settings.download && <a href={`${base}/pdf`}>Download PDF</a>}
          {formsEnabled && (
            <button className="contact" onClick={contact}>
              {d.form.label}
            </button>
          )}
          {d.settings.contactLink && (
            <a href={d.settings.contactLink} rel="noopener noreferrer">
              {d.settings.contactLabel}
            </a>
          )}
        </nav>
      </header>
      <div className="public-brochure-layout">
        <aside className="public-brochure-pages" aria-label="Page thumbnails">
          {d.pages.map((p, i) => (
            <button
              key={p.id}
              aria-current={i === index ? 'page' : undefined}
              onClick={() => {
                setIndex(i);
                setZoom(1);
              }}
            >
              <div
                aria-hidden="true"
                inert
                className="public-page-miniature"
                style={{ width: 40, height: (40 * h) / w }}
              >
                <div
                  style={{
                    width: `${w}mm`,
                    transform: `scale(${40 / ((w * 96) / 25.4)})`,
                    transformOrigin: 'top left',
                  }}
                  dangerouslySetInnerHTML={{
                    __html: pageHtml(d, i, { assetUrl }),
                  }}
                />
              </div>
              <span>
                {i + 1}. {p.name}
              </span>
            </button>
          ))}
        </aside>
        <div className="public-brochure-reading" ref={holder}>
          <div className="public-brochure-controls">
            <button
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
              aria-label="Previous page"
            >
              ←
            </button>
            <span>
              Page {index + 1} of {d.pages.length}
            </span>
            <button
              disabled={index === d.pages.length - 1}
              onClick={() => setIndex((i) => i + 1)}
              aria-label="Next page"
            >
              →
            </button>
            <label>
              Zoom{' '}
              <select
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              >
                <option value={1}>Fit</option>
                <option value={1.25}>125%</option>
                <option value={1.5}>150%</option>
                <option value={2}>200%</option>
              </select>
            </label>
          </div>
          <div
            className="public-brochure-scroll"
            onTouchStart={(e) => {
              touch.current = e.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(e) => {
              if (zoom !== 1 || touch.current === null) return;
              const dx =
                (e.changedTouches[0]?.clientX ?? touch.current) - touch.current;
              if (Math.abs(dx) > 60)
                setIndex((i) =>
                  Math.max(
                    0,
                    Math.min(d.pages.length - 1, i + (dx < 0 ? 1 : -1)),
                  ),
                );
              touch.current = null;
            }}
          >
            <div
              style={{
                width: ((w * 96) / 25.4) * scale,
                height: ((h * 96) / 25.4) * scale,
                margin: '0 auto',
              }}
            >
              <div
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  width: (w * 96) / 25.4,
                }}
                onClick={(e) => {
                  const a = (e.target as HTMLElement).closest('a');
                  if (a?.getAttribute('href')?.startsWith('#page-')) {
                    e.preventDefault();
                    const i = d.pages.findIndex(
                      (p) => `#page-${p.id}` === a.getAttribute('href'),
                    );
                    if (i >= 0) setIndex(i);
                  }
                }}
                dangerouslySetInnerHTML={{
                  __html: pageHtml(d, index, { assetUrl }),
                }}
              />
            </div>
          </div>
          <p className="public-brochure-caption">
            {page.name} · Edition {sequence}
          </p>
        </div>
      </div>
      <p role="status" className="public-brochure-message">
        {message}
      </p>
      {formOpen && formsEnabled && (
        <section
          className="public-brochure-enquiry"
          aria-labelledby="enquiry-title"
        >
          <button
            onClick={() => setFormOpen(false)}
            aria-label="Close enquiry form"
          >
            Close
          </button>
          <h2 id="enquiry-title">{d.form.label}</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSending(true);
              try {
                const f = new FormData(e.currentTarget);
                const values: Record<string, string | boolean> = {
                  name: String(f.get('name')),
                  phone: String(f.get('phone')),
                  consent: f.get('consent') === 'on',
                };
                for (const field of d.form.fields)
                  values[field] = String(f.get(field) ?? '');
                const response = await fetch(`${base}/enquiry`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    page: page.id,
                    values,
                    honeypot: String(f.get('company_url') ?? ''),
                  }),
                });
                const r = await response.json();
                setMessage(r.message ?? 'Enquiry unavailable');
                if (response.ok && r.accepted) setFormOpen(false);
              } catch {
                setMessage('Unable to send your enquiry. Please try again.');
              } finally {
                setSending(false);
              }
            }}
          >
            <label>
              Name
              <input name="name" required maxLength={200} autoComplete="name" />
            </label>
            <label>
              Phone
              <input
                name="phone"
                type="tel"
                required
                maxLength={40}
                autoComplete="tel"
              />
            </label>
            {d.form.fields.map((field) => (
              <label key={field}>
                {field}
                <input
                  name={field}
                  type={field === 'email' ? 'email' : 'text'}
                  maxLength={field === 'email' ? 254 : 2000}
                />
              </label>
            ))}
            <label className="public-honeypot" aria-hidden="true">
              Company website
              <input name="company_url" tabIndex={-1} autoComplete="off" />
            </label>
            <label className="public-consent">
              <input type="checkbox" name="consent" required />I agree to be
              contacted about this enquiry.
            </label>
            <button disabled={sending} type="submit">
              {sending ? 'Sending…' : 'Send enquiry'}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
