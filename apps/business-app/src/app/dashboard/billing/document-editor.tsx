'use client';
import { useState } from 'react';
import { saveGstDocument } from './actions';
import type {
  GstDocument,
  GstBusinessProfile,
  GstLine,
} from '@business-os/database/gst';

type Props = {
  existing?: GstDocument | null;
  profile: GstBusinessProfile | null;
  order?: {
    id: string;
    productName: string;
    buyerName: string;
    quantity: number;
    unitPrice: number;
  } | null;
};
const input =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950';
const empty: GstLine = {
  description: '',
  hsnSac: '',
  unit: 'each',
  quantity: 1,
  unitPrice: 0,
  discount: 0,
  gstRate: 18,
};
const n = (x: number) => (Number.isFinite(x) ? x : 0);
export function DocumentEditor({ existing, profile, order }: Props) {
  const [kind, setKind] = useState<'sales_invoice' | 'purchase_bill'>(
    existing?.kind ?? 'sales_invoice',
  );
  const [type, setType] = useState<GstDocument['documentType']>(
    existing?.documentType ?? 'tax_invoice',
  );
  const [partyState, setPartyState] = useState(
    existing?.partyState ?? profile?.stateCode ?? '36',
  );
  const [place, setPlace] = useState(
    existing?.placeOfSupply ?? profile?.stateCode ?? '36',
  );
  const [lines, setLines] = useState<GstLine[]>(
    existing?.lines?.length
      ? existing.lines.map((l) => ({ ...l }))
      : order
        ? [
            {
              description: order.productName,
              hsnSac: '',
              unit: 'each',
              quantity: order.quantity,
              unitPrice: order.unitPrice,
              discount: 0,
              gstRate: 18,
            },
          ]
        : [{ ...empty }],
  );
  const update = (i: number, key: keyof GstLine, value: string) => {
    setLines((prev) =>
      prev.map((line, j) =>
        j === i
          ? {
              ...line,
              [key]: ['quantity', 'unitPrice', 'discount', 'gstRate'].includes(
                key,
              )
                ? Number(value)
                : value,
            }
          : line,
      ),
    );
  };
  const total = lines.reduce((s, l) => {
    const base = Math.max(0, n(l.quantity) * n(l.unitPrice) - n(l.discount));
    return (
      s + base + (type === 'tax_invoice' ? (base * n(l.gstRate)) / 100 : 0)
    );
  }, 0);
  const currency = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  });
  return (
    <form action={saveGstDocument} className="space-y-6">
      {existing && (
        <>
          <input type="hidden" name="id" value={existing.id} />
          <input type="hidden" name="version" value={existing.version} />
        </>
      )}
      <input
        type="hidden"
        name="linesJson"
        value={JSON.stringify(
          lines.map((l) => ({
            description: l.description,
            hsnSac: l.hsnSac,
            unit: l.unit,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discount: l.discount,
            gstRate: type === 'tax_invoice' ? l.gstRate : 0,
          })),
        )}
      />
      {(order || existing?.marketplaceOrderId) && (
        <input
          type="hidden"
          name="marketplaceOrderId"
          value={order?.id ?? existing?.marketplaceOrderId ?? ''}
        />
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="mb-5 text-xl font-semibold">Document information</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium">
            Document
            <select
              className={input}
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              disabled={!!existing || !!order}
            >
              <option value="sales_invoice">Sales invoice (outgoing)</option>
              <option value="purchase_bill">Supplier bill (received)</option>
            </select>
            {!!existing && <input type="hidden" name="kind" value={kind} />}
            {!!order && <input type="hidden" name="kind" value={kind} />}
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Tax document type
            <select
              className={input}
              name="documentType"
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              <option value="tax_invoice">Tax invoice</option>
              <option value="bill_of_supply">Bill of supply (no tax)</option>
              <option value="commercial_invoice">
                Commercial invoice (no tax)
              </option>
            </select>
          </label>
          {kind === 'purchase_bill' && (
            <label className="grid gap-2 text-sm font-medium">
              Supplier bill number
              <input
                className={input}
                required
                name="number"
                maxLength={40}
                defaultValue={existing?.number ?? ''}
                placeholder="Original supplier number"
              />
            </label>
          )}
          <label className="grid gap-2 text-sm font-medium">
            Document date
            <input
              className={input}
              required
              name="date"
              type="date"
              defaultValue={
                existing?.date ?? new Date().toISOString().slice(0, 10)
              }
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Due date (optional)
            <input
              className={input}
              name="dueDate"
              type="date"
              defaultValue={existing?.dueDate ?? ''}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Place-of-supply state code
            <input
              className={input}
              required
              name="placeOfSupply"
              pattern="[0-9]{2}"
              maxLength={2}
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            />
          </label>
        </div>
        <label className="mt-5 flex items-center gap-2 text-sm">
          <input
            name="reverseCharge"
            type="checkbox"
            value="true"
            defaultChecked={existing?.reverseCharge ?? false}
          />
          Reverse charge applies (requires accountant review)
        </label>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="mb-5 text-xl font-semibold">
          {kind === 'sales_invoice' ? 'Invoice recipient' : 'Bill supplier'}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            Party name
            <input
              className={input}
              required
              name="partyName"
              minLength={2}
              maxLength={200}
              defaultValue={existing?.partyName ?? order?.buyerName ?? ''}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            GSTIN (optional for unregistered party)
            <input
              className={input}
              name="partyGstin"
              maxLength={15}
              pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]"
              defaultValue={existing?.partyGstin ?? ''}
              placeholder="36ABCDE1234F1Z5"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Party state code
            <input
              className={input}
              required
              name="partyState"
              pattern="[0-9]{2}"
              maxLength={2}
              value={partyState}
              onChange={(e) => setPartyState(e.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Party address
            <textarea
              className={input}
              name="partyAddress"
              rows={2}
              maxLength={1000}
              defaultValue={existing?.partyAddress ?? ''}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Delivery address (if different)
            <textarea
              className={input}
              name="deliveryAddress"
              rows={2}
              maxLength={1000}
              defaultValue={existing?.deliveryAddress ?? ''}
            />
          </label>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-xl font-semibold">Goods &amp; services</h2>
          <button
            type="button"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
            onClick={() =>
              setLines((prev) =>
                prev.length >= 50 ? prev : [...prev, { ...empty }],
              )
            }
          >
            + Add item
          </button>
        </div>
        <div className="space-y-4">
          {lines.map((line, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="mb-3 flex justify-between">
                <strong className="text-sm">Item {i + 1}</strong>
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="text-sm text-rose-700"
                    onClick={() =>
                      setLines((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="grid gap-1 text-xs font-semibold sm:col-span-2">
                  Description
                  <input
                    className={input}
                    required
                    maxLength={500}
                    value={line.description}
                    onChange={(e) => update(i, 'description', e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold">
                  HSN / SAC
                  <input
                    className={input}
                    required
                    maxLength={12}
                    value={line.hsnSac}
                    onChange={(e) => update(i, 'hsnSac', e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold">
                  Unit
                  <input
                    className={input}
                    required
                    maxLength={24}
                    value={line.unit}
                    onChange={(e) => update(i, 'unit', e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold">
                  Quantity
                  <input
                    className={input}
                    type="number"
                    required
                    min="0.001"
                    step="0.001"
                    value={line.quantity}
                    onChange={(e) => update(i, 'quantity', e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold">
                  Unit rate (₹)
                  <input
                    className={input}
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(e) => update(i, 'unitPrice', e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold">
                  Discount amount (₹)
                  <input
                    className={input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.discount}
                    onChange={(e) => update(i, 'discount', e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold">
                  GST rate (%)
                  <input
                    className={input}
                    type="number"
                    required
                    disabled={type !== 'tax_invoice'}
                    min="0"
                    max="40"
                    step="0.01"
                    value={type === 'tax_invoice' ? line.gstRate : 0}
                    onChange={(e) => update(i, 'gstRate', e.target.value)}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-right text-lg font-bold">
          Estimated total: {currency.format(total)}
        </p>
        <p className="mt-1 text-right text-xs text-slate-500">
          Server calculations and tax component rounding are authoritative.
          Choose HSN/SAC and rates based on your actual supply.
        </p>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <label className="grid gap-2 text-sm font-semibold">
          Internal notes
          <textarea
            name="notes"
            className={input}
            rows={3}
            maxLength={2000}
            defaultValue={existing?.notes ?? ''}
          />
        </label>
        {order && (
          <p className="mt-4 text-sm text-teal-800">
            Linked to accepted marketplace request. The quantity and base rate
            must match that request.
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-slate-800"
          >
            Save draft
          </button>
          <p className="text-xs text-slate-500">
            Documents receive a final number only on issuance. GST filing and
            IRN generation are not included.
          </p>
        </div>
      </section>
    </form>
  );
}
