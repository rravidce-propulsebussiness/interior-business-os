import { useEffect, useState } from 'react';

/** A srcdoc iframe inherits the dashboard CSP. Only the fixed, generated
 * preview selection/scroll handler receives the same nonce as Next.js.
 * User-authored custom HTML never receives a nonce.
 */
export function applyWebsitePreviewNonce(html: string, nonce: string): string {
  if (!html) return '';
  if (!/^[A-Za-z0-9+/_=-]{12,256}$/.test(nonce)) {
    // A blank/unavailable nonce must not authorize inline script execution.
    return html.replace(/<script data-website-preview-script>[\s\S]*?<\/script>/g, '');
  }
  return html.replace(
    '<script data-website-preview-script>',
    `<script data-website-preview-script nonce="${nonce}">`,
  );
}

export function useWebsitePreviewSrcDoc(html: string): string {
  const [result, setResult] = useState('');
  useEffect(() => {
    // Read only the browser's existing CSP nonce, never create a new one.
    // The script tag belongs to Next's trusted shell, not to the srcdoc.
    const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ??
      document.querySelector<HTMLStyleElement>('style[nonce]')?.nonce ?? '';
    setResult(applyWebsitePreviewNonce(html, nonce));
  }, [html]);
  return result;
}
