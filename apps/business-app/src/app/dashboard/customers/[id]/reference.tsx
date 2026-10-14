'use client';

import { useState } from 'react';

export function CustomerReference({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copyReference() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="cp-reference">
      <span>
        Customer ID: <strong>{value}</strong>
      </span>
      <button
        type="button"
        onClick={copyReference}
        className="cp-copy"
        aria-label="Copy customer reference"
        title="Copy customer reference"
      >
        {copied ? '✓ Copied' : '▢ Copy'}
      </button>
    </div>
  );
}
