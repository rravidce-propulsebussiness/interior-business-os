'use client';
import { useState } from 'react';
import { ActionForm } from '@business-os/ui/action-form';
import { saveTradeDocument } from './actions';
import type { GstParty, TradeDraft } from '@business-os/database/trade-billing';

const field =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900';
const emptyLine = () => ({
  description: '',
  hsn: '',
  unit: 'piece',
  quantity: 1,
  rate: 0,
  gstRate: 18,
});
const emptyParty = (): GstParty => ({
  name: '',
  address: '',
  gstin: '',
  state: '',
});

export function TradeDocumentEditor({
  defaultKind,
  initial,
  companyState,
}: {
  defaultKind: 'sales_invoice' | 'purchase_bill';
  initial?: TradeDraft;
  companyState: string;
}) {
  const today = new Date().toLocaleDateString('en-CA');
  const [doc, setDoc] = useState<TradeDraft>(
    initial ?? {
      kind: defaultKind,
      issueDate: today,
      dueDate: '',
      counterparty: emptyParty(),
      placeOfSupply: companyState,
      deliveryAddress: '',
      reverseCharge: false,
      lines: [emptyLine()],
      notes: '',
      reference: '',
    },
  );
  const update = (key: keyof TradeDraft, value: unknown) =>
    setDoc((d) => ({ ...d, [key]: value }));
  const item = (index: number, key: string, value: string) =>
    setDoc((d) => ({
      ...d,
      lines: d.lines.map((line, i) =>
        i === index
          ? {
              ...line,
              [key]: ['quantity', 'rate', 'gstRate'].includes(key)
                ? Number(value)
                : value,
            }
          : line,
      ),
    }));
  const party = (key: keyof GstParty, value: string) =>
    setDoc((d) => ({
      ...d,
      counterparty: { ...d.counterparty, [key]: value },
    }));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm sm:p-7">
      <h2 className="text-xl font-semibold">
        {initial
          ? 'Edit draft'
          : 'New ' +
            (doc.kind === 'sales_invoice' ? 'sales invoice' : 'purchase bill')}
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        Line totals and GST are calculated and validated on the server. Save a
        draft, review it, then issue it to freeze the document.
      </p>
      <ActionForm action={saveTradeDocument} label="Save document draft">
        <input type="hidden" name="payload" value={JSON.stringify(doc)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Document
            <select
              className={field}
              value={doc.kind}
              disabled={!!initial}
              onChange={(e) => update('kind', e.target.value)}
            >
              <option value="sales_invoice">
                Sales invoice (we are the supplier)
              </option>
              <option value="purchase_bill">
                Purchase bill (we are the buyer)
              </option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Issue date
            <input
              type="date"
              className={field}
              required
              value={doc.issueDate}
              onChange={(e) => update('issueDate', e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Due date (optional)
            <input
              type="date"
              className={field}
              value={doc.dueDate}
              min={doc.issueDate}
              onChange={(e) => update('dueDate', e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Place of supply — state code
            <input
              className={field}
              required
              pattern="[0-9]{2}"
              maxLength={2}
              value={doc.placeOfSupply}
              onChange={(e) => update('placeOfSupply', e.target.value)}
            />
          </label>
          {doc.kind === 'purchase_bill' && (
            <label className="grid gap-1.5 text-sm font-medium">
              Supplier&apos;s original bill/invoice number
              <input
                required
                maxLength={40}
                className={field}
                value={doc.reference}
                onChange={(e) => update('reference', e.target.value)}
              />
            </label>
          )}
          <label className="grid gap-1.5 text-sm font-medium">
            {doc.kind === 'sales_invoice' ? 'Customer name' : 'Supplier name'}
            <input
              required
              className={field}
              minLength={2}
              maxLength={200}
              value={doc.counterparty.name}
              onChange={(e) => party('name', e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {doc.kind === 'sales_invoice'
              ? 'Customer address'
              : 'Supplier address'}
            <textarea
              required
              className={field}
              minLength={5}
              maxLength={2000}
              rows={2}
              value={doc.counterparty.address}
              onChange={(e) => party('address', e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Counterparty GSTIN (optional)
            <input
              className={field}
              maxLength={15}
              placeholder="15-character GSTIN"
              value={doc.counterparty.gstin}
              onChange={(e) => party('gstin', e.target.value.toUpperCase())}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Counterparty state code
            <input
              required
              pattern="[0-9]{2}"
              maxLength={2}
              className={field}
              value={doc.counterparty.state}
              onChange={(e) => party('state', e.target.value)}
            />
          </label>
        </div>
        <label className="mt-4 grid gap-2 text-sm font-medium">
          Delivery address (if different)
          <textarea
            className={field}
            rows={2}
            maxLength={2000}
            value={doc.deliveryAddress}
            onChange={(e) => update('deliveryAddress', e.target.value)}
          />
        </label>
        <label className="mt-4 flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={doc.reverseCharge}
            onChange={(e) => update('reverseCharge', e.target.checked)}
          />
          Reverse-charge transaction (requires professional review; issuing
          sales invoice is restricted)
        </label>
        <h3 className="mt-7 text-lg font-semibold">Products / services</h3>
        <div className="mt-3 grid gap-3">
          {doc.lines.map((line, index) => (
            <div
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              key={index}
            >
              <div className="mb-3 flex justify-between">
                <strong className="text-sm">Line {index + 1}</strong>
                <button
                  type="button"
                  disabled={doc.lines.length === 1}
                  onClick={() =>
                    update(
                      'lines',
                      doc.lines.filter((_, i) => i !== index),
                    )
                  }
                  className="text-sm font-semibold text-rose-700 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-xs font-medium sm:col-span-2">
                  Description
                  <input
                    required
                    maxLength={350}
                    className={field}
                    value={line.description}
                    onChange={(e) => item(index, 'description', e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  HSN/SAC
                  <input
                    required
                    maxLength={10}
                    minLength={2}
                    className={field}
                    value={line.hsn}
                    onChange={(e) => item(index, 'hsn', e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  Quantity
                  <input
                    type="number"
                    required
                    step="0.001"
                    min="0.001"
                    className={field}
                    value={line.quantity}
                    onChange={(e) => item(index, 'quantity', e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  Unit
                  <input
                    required
                    maxLength={20}
                    className={field}
                    value={line.unit}
                    onChange={(e) => item(index, 'unit', e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  Rate (₹)
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    className={field}
                    value={line.rate}
                    onChange={(e) => item(index, 'rate', e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  GST rate (%)
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    max="40"
                    className={field}
                    value={line.gstRate}
                    onChange={(e) => item(index, 'gstRate', e.target.value)}
                  />
                </label>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Choose the applicable GST rate for this HSN/SAC. No rate is
                inferred.
              </p>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={doc.lines.length >= 30}
          onClick={() => update('lines', [...doc.lines, emptyLine()])}
          className="mt-4 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          ＋ Add line
        </button>
        <label className="mt-5 grid gap-2 text-sm font-medium">
          Invoice notes
          <textarea
            className={field}
            rows={3}
            maxLength={2000}
            value={doc.notes}
            onChange={(e) => update('notes', e.target.value)}
          />
        </label>
      </ActionForm>
    </section>
  );
}
