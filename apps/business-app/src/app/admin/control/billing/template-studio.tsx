'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  GstInvoiceTemplate,
  GstTemplateConfig,
  GstTemplateKind,
  GstInvoiceAppearance,
} from '@business-os/database/gst-templates';
import {
  saveInvoiceTemplate,
  setInvoiceTemplateStatus,
  setStandardInvoiceFormat,
} from './template-actions';

const defaultConfig: GstTemplateConfig = {
  layout: 'modern',
  accent: '#2563eb',
  subtitle: 'Professional billing',
  footer: 'Thank you for your business.',
  showUnit: true,
  showDiscount: true,
  blankRows: 1,
  customFields: [],
};
const input =
  'gst-studio-input w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium outline-none';
const title = (kind: GstTemplateKind) =>
  kind === 'sales_invoice' ? 'Sales invoice' : 'Purchase bill';

export function InvoicePaper({
  name,
  kind,
  config,
  compact = false,
}: {
  name: string;
  kind: GstTemplateKind;
  config: GstTemplateConfig;
  compact?: boolean;
}) {
  return (
    <div
      className={
        'relative overflow-hidden bg-white text-slate-800 shadow-[0_10px_30px_rgba(15,23,42,.1)] ' +
        (compact
          ? 'mx-auto aspect-[.78] w-full max-w-[245px] rounded-md p-3 text-[7px]'
          : 'mx-auto min-h-[390px] w-full max-w-md rounded-xl border border-slate-200 p-6 text-[10px]')
      }
      style={{
        borderTop:
          config.layout === 'modern' ? '8px solid ' + config.accent : undefined,
      }}
    >
      <header
        className={
          'flex justify-between gap-3 pb-4 ' +
          (config.layout === 'classic'
            ? 'border-b-[3px]'
            : 'border-b border-slate-200')
        }
        style={{
          borderColor: config.layout === 'classic' ? config.accent : undefined,
        }}
      >
        <div>
          <div
            className="mb-2 inline-grid size-7 place-items-center rounded-lg text-sm font-black text-white"
            style={{ backgroundColor: config.accent }}
          >
            P
          </div>
          <strong className="block text-[1.1em]">YOUR COMPANY</strong>
          <span className="block text-slate-400">
            Registered business details
          </span>
        </div>
        <div className="text-right">
          <span
            className="block text-[1.4em] font-extrabold uppercase"
            style={{ color: config.accent }}
          >
            {kind === 'sales_invoice' ? 'INVOICE' : 'PURCHASE BILL'}
          </span>
          <span className="block font-medium text-slate-500">
            Sample preview only
          </span>
          <span className="block text-slate-400">{config.subtitle}</span>
        </div>
      </header>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <strong className="text-slate-900">
            {kind === 'sales_invoice' ? 'Bill to' : 'Supplier'}
          </strong>
          <p className="mt-1 leading-4 text-slate-500">
            Customer / Supplier Name
          </p>
          <p className="text-slate-400">Address · GSTIN · State</p>
        </div>
        <div className="text-right">
          <strong>Document details</strong>
          <p className="mt-1 text-slate-500">Date · Place of supply</p>
          <p className="text-slate-400">Document no. on issue</p>
        </div>
      </div>
      <div className="mt-5 overflow-hidden rounded border border-slate-200">
        <div
          className="grid grid-cols-[1.6fr_.5fr_.6fr_.7fr] gap-1 px-2 py-2 font-bold"
          style={{
            backgroundColor: config.accent + '17',
            color: config.accent,
          }}
        >
          <span>Description</span>
          <span>Qty</span>
          <span>Rate</span>
          <span>Amount</span>
        </div>
        {['Goods / services', 'Additional item', 'Custom item'].map(
          (row, index) => (
            <div
              key={row}
              className="grid grid-cols-[1.6fr_.5fr_.6fr_.7fr] gap-1 border-t border-slate-100 px-2 py-2"
            >
              <span>{row}</span>
              <span>{index === 0 ? '1' : '—'}</span>
              <span>₹0.00</span>
              <span>₹0.00</span>
            </div>
          ),
        )}
      </div>
      <div className="ml-auto mt-4 w-2/3 space-y-2">
        <div className="flex justify-between border-b border-slate-100 pb-1 text-slate-500">
          <span>Taxable</span>
          <span>₹0.00</span>
        </div>
        <div className="flex justify-between border-b border-slate-100 pb-1 text-slate-500">
          <span>GST</span>
          <span>₹0.00</span>
        </div>
        <div
          className="flex justify-between font-extrabold"
          style={{ color: config.accent }}
        >
          <span>Total</span>
          <span>₹0.00</span>
        </div>
      </div>
      {config.customFields.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-2">
          {config.customFields.map((entry, index) => (
            <p key={index}>
              <strong>{entry.label}:</strong> {entry.value}
            </p>
          ))}
        </div>
      )}
      <div className="mt-7 border-t border-slate-100 pt-3 text-slate-500">
        <p>{config.footer || 'Business document'}</p>
        <p className="mt-1 text-slate-400">
          {name} · Template preview · Not a tax invoice
        </p>
      </div>
    </div>
  );
}

function StatusAction({ template }: { template: GstInvoiceTemplate }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(setInvoiceTemplateStatus, {
    message: '',
  });
  useEffect(() => {
    if (state.saved) router.refresh();
  }, [state.saved, router]);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={template.id} />
      <input
        type="hidden"
        name="active"
        value={String(template.status !== 'active')}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-blue-300"
      >
        {pending
          ? 'Saving…'
          : template.status === 'active'
            ? 'Archive'
            : 'Activate'}
      </button>
      {state.message && !state.saved && (
        <p className="mt-1 text-[11px] text-red-600" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}

function StandardAction({
  template,
  isStandard,
}: {
  template: GstInvoiceTemplate;
  isStandard: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(setStandardInvoiceFormat, {
    message: '',
  });
  useEffect(() => {
    if (state.saved) router.refresh();
  }, [state.saved, router]);
  if (isStandard) {
    return (
      <span className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white">
        ✓ Standard
      </span>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="id" value={template.id} />
      <button
        type="submit"
        disabled={pending || template.status !== 'active'}
        className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-50"
      >
        {pending ? 'Applying…' : 'Use as standard'}
      </button>
      {state.message && !state.saved && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {state.message}
        </p>
      )}
    </form>
  );
}

function TemplateEditor({
  initial,
  onClose,
}: {
  initial?: GstInvoiceTemplate | undefined;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveInvoiceTemplate, {
    message: '',
  });
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<GstTemplateKind>(
    initial?.kind ?? 'sales_invoice',
  );
  const [config, setConfig] = useState<GstTemplateConfig>(
    initial?.config ?? { ...defaultConfig, customFields: [] },
  );
  const editConfig = <K extends keyof GstTemplateConfig>(
    key: K,
    value: GstTemplateConfig[K],
  ) => setConfig((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (state.saved) router.refresh();
  }, [state.saved, router]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gst-editor-title"
        className="gst-template-dialog flex max-h-[95dvh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
              Billing template studio
            </p>
            <h2
              id="gst-editor-title"
              className="mt-1 text-xl font-extrabold text-slate-950"
            >
              {initial ? 'Customize template' : 'Create invoice template'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close template editor"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
          >
            Close ✕
          </button>
        </div>
        {state.saved ? (
          <div className="p-8">
            <p className="text-xl font-bold text-emerald-800">
              ✓ Template saved
            </p>
            <p className="mt-2 text-sm text-slate-600">{state.message}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white"
            >
              Back to gallery
            </button>
          </div>
        ) : (
          <form action={action} className="flex min-h-0 flex-col">
            <input type="hidden" name="id" value={initial?.id ?? ''} />
            <input
              type="hidden"
              name="customFieldsJson"
              value={JSON.stringify(config.customFields)}
            />
            <div className="grid min-h-0 overflow-y-auto lg:grid-cols-[1.15fr_.85fr]">
              <div className="space-y-5 p-5 sm:p-7">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-2 text-xs font-bold text-slate-700">
                    Template name
                    <input
                      autoFocus
                      required
                      minLength={3}
                      maxLength={90}
                      className={input}
                      name="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Example: Signature Invoice"
                    />
                  </label>
                  <label className="space-y-2 text-xs font-bold text-slate-700">
                    Document type
                    <select
                      className={input}
                      name="kind"
                      disabled={!!initial}
                      value={kind}
                      onChange={(e) =>
                        setKind(e.target.value as GstTemplateKind)
                      }
                    >
                      <option value="sales_invoice">Sales invoice</option>
                      <option value="purchase_bill">Purchase bill</option>
                    </select>
                    {initial && (
                      <input type="hidden" name="kind" value={kind} />
                    )}
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-2 text-xs font-bold text-slate-700">
                    Design layout
                    <select
                      className={input}
                      name="layout"
                      value={config.layout}
                      onChange={(e) =>
                        editConfig(
                          'layout',
                          e.target.value as GstTemplateConfig['layout'],
                        )
                      }
                    >
                      <option value="modern">Modern</option>
                      <option value="classic">Classic</option>
                      <option value="minimal">Minimal</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-xs font-bold text-slate-700">
                    Accent color
                    <input
                      name="accent"
                      type="color"
                      value={config.accent}
                      onChange={(e) => editConfig('accent', e.target.value)}
                      className={input + ' h-11 cursor-pointer'}
                    />
                  </label>
                  <label className="space-y-2 text-xs font-bold text-slate-700">
                    Starting item rows
                    <input
                      name="blankRows"
                      type="number"
                      min={1}
                      max={10}
                      required
                      value={config.blankRows}
                      onChange={(e) =>
                        editConfig('blankRows', Number(e.target.value))
                      }
                      className={input}
                    />
                  </label>
                </div>
                <label className="block space-y-2 text-xs font-bold text-slate-700">
                  Header subtitle
                  <input
                    name="subtitle"
                    maxLength={120}
                    className={input}
                    value={config.subtitle}
                    onChange={(e) => editConfig('subtitle', e.target.value)}
                    placeholder="Professional billing"
                  />
                </label>
                <label className="block space-y-2 text-xs font-bold text-slate-700">
                  Footer / terms
                  <textarea
                    name="footer"
                    rows={3}
                    maxLength={400}
                    value={config.footer}
                    onChange={(e) => editConfig('footer', e.target.value)}
                    className={input}
                    placeholder="Payment and billing terms"
                  />
                </label>
                <fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <legend className="px-2 text-xs font-extrabold text-slate-800">
                    Optional display columns
                  </legend>
                  <div className="mt-1 flex flex-wrap gap-5">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        name="showUnit"
                        value="true"
                        checked={config.showUnit}
                        onChange={(e) =>
                          editConfig('showUnit', e.target.checked)
                        }
                      />{' '}
                      Show unit
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        name="showDiscount"
                        value="true"
                        checked={config.showDiscount}
                        onChange={(e) =>
                          editConfig('showDiscount', e.target.checked)
                        }
                      />{' '}
                      Show discount
                    </label>
                  </div>
                  <p className="mt-3 text-[11px] leading-5 text-slate-500">
                    GST/HSN, taxable amount and total stay visible in issued tax
                    documents regardless of styling. Tax calculations cannot be
                    customized.
                  </p>
                </fieldset>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-extrabold text-slate-950">
                      Extra header fields
                    </h3>
                    <button
                      type="button"
                      disabled={config.customFields.length >= 5}
                      className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700"
                      onClick={() =>
                        editConfig('customFields', [
                          ...config.customFields,
                          { label: '', value: '' },
                        ])
                      }
                    >
                      + Add field
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Up to 5 text fields, such as payment instructions or
                    reference details. Do not add client-specific secrets to a
                    shared template.
                  </p>
                  <div className="mt-3 space-y-2">
                    {config.customFields.map((entry, i) => (
                      <div className="flex items-start gap-2" key={i}>
                        <input
                          required
                          maxLength={50}
                          placeholder="Label"
                          aria-label={'Field ' + (i + 1) + ' label'}
                          className={input}
                          value={entry.label}
                          onChange={(e) =>
                            editConfig(
                              'customFields',
                              config.customFields.map((x, j) =>
                                j === i ? { ...x, label: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <input
                          maxLength={120}
                          placeholder="Value"
                          aria-label={'Field ' + (i + 1) + ' value'}
                          className={input}
                          value={entry.value}
                          onChange={(e) =>
                            editConfig(
                              'customFields',
                              config.customFields.map((x, j) =>
                                j === i ? { ...x, value: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            editConfig(
                              'customFields',
                              config.customFields.filter((_, j) => j !== i),
                            )
                          }
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="overflow-y-auto border-t border-slate-100 bg-slate-100/70 p-5 sm:p-7 lg:border-l lg:border-t-0">
                <p className="mb-4 text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  Live sample preview
                </p>
                <InvoicePaper
                  name={name || 'New invoice layout'}
                  kind={kind}
                  config={config}
                />
                <p className="mt-4 text-xs leading-5 text-slate-500">
                  Preview shows illustrative ₹0.00 lines. Real billing names,
                  invoice numbers, quantities, GST and totals come only from the
                  tenant’s verified document data.
                </p>
              </div>
            </div>
            {state.message && (
              <p
                role="alert"
                className="mx-6 mb-2 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700"
              >
                {state.message}
              </p>
            )}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:px-7">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={
                  pending ||
                  name.trim().length < 3 ||
                  config.customFields.some((x) => !x.label.trim())
                }
                type="submit"
                className="rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold text-white disabled:opacity-50"
              >
                {pending ? 'Saving…' : 'Save template'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function GstTemplateStudio({
  templates,
  canEdit,
  standard,
}: {
  templates: GstInvoiceTemplate[];
  canEdit: boolean;
  standard: GstInvoiceAppearance;
}) {
  const [kind, setKind] = useState<'all' | GstTemplateKind>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<GstInvoiceTemplate | 'new' | null>(
    null,
  );
  const filtered = useMemo(
    () =>
      templates.filter(
        (t) =>
          (kind === 'all' || t.kind === kind) &&
          t.name.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [kind, search, templates],
  );
  const count = (filter: GstTemplateKind) =>
    templates.filter((t) => t.kind === filter && t.status === 'active').length;

  return (
    <section className="gst-template-studio">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.13em] text-blue-600">
            Document layouts · GST billing
          </p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">
            Invoice template studio
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            One platform-approved format is applied to every new sales invoice
            and supplier bill. Edit a preset, then make it the shared standard.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100 hover:bg-blue-700"
          >
            + Create template
          </button>
        )}
      </header>
      <section className="mt-5 flex flex-wrap items-start gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <span className="grid size-11 place-items-center rounded-xl bg-blue-600 text-xl text-white">
          ✓
        </span>
        <div>
          <h3 className="text-base font-extrabold text-slate-950">
            Current standard: {standard.name}
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            All new sales invoices and supplier bills share this design. Editing
            the selected preset changes future documents automatically.
            Previously issued invoices retain their original layouts and
            amounts.
          </p>
        </div>
      </section>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          {
            label: 'Sales invoice layouts',
            value: count('sales_invoice'),
            theme: 'bg-blue-50 text-blue-700',
            symbol: '▤',
          },
          {
            label: 'Purchase bill layouts',
            value: count('purchase_bill'),
            theme: 'bg-violet-50 text-violet-700',
            symbol: '▧',
          },
          {
            label: 'Custom templates',
            value: templates.filter((t) => t.status === 'active').length,
            theme: 'bg-emerald-50 text-emerald-700',
            symbol: '✦',
          },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <span
              className={
                'grid size-12 place-items-center rounded-2xl text-2xl ' +
                item.theme
              }
            >
              {item.symbol}
            </span>
            <div>
              <p className="text-xs text-slate-500">{item.label}</p>
              <strong className="mt-1 block text-2xl font-black text-slate-950">
                {item.value}
              </strong>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Template categories"
        >
          {[
            { id: 'all', label: 'All invoice templates' },
            { id: 'sales_invoice', label: 'Sales invoices' },
            { id: 'purchase_bill', label: 'Purchase bills' },
          ].map((option) => (
            <button
              type="button"
              key={option.id}
              onClick={() => setKind(option.id as typeof kind)}
              aria-pressed={kind === option.id}
              className={
                'rounded-xl px-4 py-2.5 text-xs font-bold ' +
                (kind === option.id
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-600')
              }
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="block w-full max-w-xs">
          <span className="sr-only">Search templates</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className={input}
            type="search"
          />
        </label>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((template) => (
          <article
            key={template.id}
            className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-lg"
          >
            <div className="h-60 overflow-hidden bg-gradient-to-br from-slate-100 to-blue-50 px-12 pt-5">
              <InvoicePaper
                compact
                name={template.name}
                kind={template.kind}
                config={template.config}
              />
            </div>
            <div className="flex flex-1 flex-col p-5">
              {standard.templateId === template.id && (
                <p className="mb-3 w-fit rounded-full bg-blue-100 px-3 py-1 text-[10px] font-extrabold text-blue-700">
                  Active platform standard · both invoice types
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    'rounded-full px-2.5 py-1 text-[10px] font-bold ' +
                    (template.kind === 'sales_invoice'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-amber-100 text-amber-800')
                  }
                >
                  {title(template.kind)}
                </span>
                <span
                  className={
                    'rounded-full px-2.5 py-1 text-[10px] font-bold ' +
                    (template.status === 'active'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-500')
                  }
                >
                  {template.status}
                </span>
              </div>
              <h3 className="mt-3 text-base font-extrabold text-slate-950">
                {template.name}
              </h3>
              <p className="mt-1 flex-1 text-xs leading-5 text-slate-500">
                {template.config.layout} design · {template.config.blankRows}{' '}
                starting {template.config.blankRows === 1 ? 'row' : 'rows'} ·{' '}
                {template.config.customFields.length} extra fields
              </p>
              <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setEditing(template)}
                  disabled={!canEdit}
                  className="flex-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-bold text-blue-700 disabled:opacity-60"
                >
                  {canEdit ? 'Customize' : 'Preview only'}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        ...template,
                        id: '',
                        name: template.name + ' Copy',
                      })
                    }
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700"
                  >
                    Duplicate
                  </button>
                )}
                {canEdit && (
                  <StandardAction
                    template={template}
                    isStandard={standard.templateId === template.id}
                  />
                )}
                {canEdit && <StatusAction template={template} />}
              </div>
            </div>
          </article>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-slate-500">
            No matching invoice templates.
          </p>
        )}
      </div>
      <p className="mt-5 text-xs leading-5 text-slate-500">
        Quotations are handled separately in Quotations, including their
        client-sharing workflow. This studio does not create, change or publish
        quotations.
      </p>
      {editing && (
        <TemplateEditor
          key={editing === 'new' ? 'new' : editing.id || editing.name}
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
