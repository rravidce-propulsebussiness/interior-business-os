'use client';
import { useState } from 'react';
export function ClientPaymentProofForm({
  projectId,
  requestId,
  amount,
  disabled = false,
}: {
  projectId: string;
  requestId: string;
  amount: number;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  return (
    <details className="pc-payment-evidence">
      <summary>I've Paid · Upload screenshot</summary>
      <p className="pc-empty">
        Your screenshot is submitted for bank verification. Payment stays
        pending until the builder verifies the actual credit.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (loading || disabled) return;
          setLoading(true);
          setMessage('');
          const body = new FormData(event.currentTarget);
          body.set('project', projectId);
          body.set('request', requestId);
          try {
            const response = await fetch('/client/payment-proofs', {
              method: 'POST',
              body,
              credentials: 'same-origin',
            });
            const result = (await response.json()) as {
              message?: string;
              success?: boolean;
            };
            setMessage(result.message ?? 'Submission unsuccessful');
            if (response.ok && result.success) {
              setDone(true);
              window.location.reload();
            }
          } catch {
            setMessage('Upload failed. Try again.');
          } finally {
            setLoading(false);
          }
        }}
      >
        <label>
          Amount actually paid (₹)
          <input
            name="amount"
            required
            type="number"
            min="0.01"
            step="0.01"
            max={amount}
            defaultValue={amount.toFixed(2)}
            disabled={disabled || loading || done}
          />
        </label>
        <label>
          Payment method
          <select
            name="method"
            defaultValue="upi"
            disabled={disabled || loading || done}
          >
            <option value="upi">UPI</option>
            <option value="bank_transfer">
              Bank transfer / NEFT / IMPS / RTGS
            </option>
            <option value="cheque">Cheque</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          UPI / bank transaction reference
          <input
            name="reference"
            required
            minLength={6}
            maxLength={110}
            placeholder="Enter transaction / UTR number"
            autoComplete="off"
            disabled={disabled || loading || done}
          />
        </label>
        <label>
          Payment screenshot (JPG, PNG, WEBP or PDF; max 5 MB)
          <input
            name="proof"
            type="file"
            required
            accept="image/jpeg,image/png,image/webp,application/pdf"
            disabled={disabled || loading || done}
          />
        </label>
        <p className="pc-empty">
          Full milestone payment is expected. If you paid less, the company
          Owner must explicitly approve that exception.
        </p>
        <button
          className="pc-view-link"
          type="submit"
          disabled={disabled || loading || done}
        >
          {loading
            ? 'Uploading…'
            : done
              ? 'Submitted'
              : 'Submit for verification'}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </details>
  );
}
