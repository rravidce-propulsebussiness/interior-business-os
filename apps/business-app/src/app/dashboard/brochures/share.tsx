'use client';
import { useState } from 'react';
import QRCode from 'qrcode';
export function ShareBrochure({
  url,
  published,
}: {
  url: string;
  published: boolean;
}) {
  const [qr, setQr] = useState('');
  const [message, setMessage] = useState('');
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">Share brochure</h2>
      <p className="break-all text-sm">{url}</p>
      <p className="text-xs text-muted-foreground">
        {published
          ? 'Public sharing must be enabled in the published settings.'
          : 'Publish with public sharing enabled to activate this link.'}
      </p>
      <div className="flex gap-4 text-sm">
        <button
          className="underline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setMessage('Link copied');
            } catch {
              setMessage('Copy the link above');
            }
          }}
        >
          Copy link
        </button>
        <button
          className="underline"
          onClick={async () => {
            if (!url.startsWith('https://')) {
              setMessage(
                'Configure the public HTTPS brochure origin before generating a QR code.',
              );
              return;
            }
            setQr(
              await QRCode.toDataURL(url, {
                width: 400,
                margin: 2,
                errorCorrectionLevel: 'M',
              }),
            );
          }}
        >
          QR code
        </button>
        <a className="underline" href={url} target="_blank" rel="noreferrer">
          Open viewer
        </a>
        <button
          className="underline"
          onClick={async () => {
            try {
              if (navigator.share) await navigator.share({ url });
              else await navigator.clipboard.writeText(url);
            } catch {
              setMessage('Share cancelled or unavailable');
            }
          }}
        >
          Share
        </button>
      </div>
      {qr && (
        <a href={qr} download="brochure-qr.png">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="QR code for public brochure"
            width={180}
            height={180}
          />
          <span className="text-xs underline">Download QR code</span>
        </a>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
    </section>
  );
}
