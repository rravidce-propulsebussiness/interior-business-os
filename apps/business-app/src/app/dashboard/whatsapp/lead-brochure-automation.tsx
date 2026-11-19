'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  loadLeadBrochureAutomationData,
  saveLeadBrochureAutomation,
  type LeadBrochureAutomationData,
} from '../crm/leads/meta-lead-actions';

type FormRow = LeadBrochureAutomationData['forms'][number];

const inputClass =
  'mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';

export function LeadBrochureAutomationPanel({
  canManage,
}: {
  canManage: boolean;
}) {
  const [data, setData] = useState<LeadBrochureAutomationData>({
    forms: [],
    connections: [],
    templates: {},
  });
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const result = await loadLeadBrochureAutomationData();
    if (!result.ok) setError(result.message);
    else {
      setError('');
      setData(result.data);
      setSelectedId((current) => current || result.data.forms[0]?.id || '');
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Load server data after mount.
    void load();
  }, [load]);

  const selected = data.forms.find((form) => form.id === selectedId) ?? null;
  const templates = selected
    ? (data.templates[selected.connectionId] ?? [])
    : [];
  const serviceTemplates = templates.filter((item) => item.kind === 'service');
  const carouselTemplates = templates.filter(
    (item) => item.kind === 'carousel',
  );

  function update(patch: Partial<FormRow>) {
    setData((current) => ({
      ...current,
      forms: current.forms.map((form) =>
        form.id === selectedId ? { ...form, ...patch } : form,
      ),
    }));
  }

  async function save(enabled: boolean) {
    if (!selected) return;
    setBusy(true);
    setNotice('');
    setError('');
    const result = await saveLeadBrochureAutomation({
      formId: selected.id,
      enabled,
      connectionId: selected.connectionId,
      serviceTemplateName: selected.serviceTemplateName,
      serviceTemplateLanguage: selected.serviceTemplateLanguage,
      carouselTemplateName: selected.carouselTemplateName,
      carouselTemplateLanguage: selected.carouselTemplateLanguage,
      constructionUrl: selected.constructionUrl,
      interiorsUrl: selected.interiorsUrl,
      constructionImageUrl: selected.constructionImageUrl,
      interiorsImageUrl: selected.interiorsImageUrl,
    });
    setBusy(false);
    if (!result.ok) setError(result.message);
    else {
      setNotice(result.message);
      await load();
    }
  }

  return (
    <section
      className="space-y-5 px-4 pb-8 sm:px-6"
      aria-labelledby="lead-brochure-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-200 pb-4 pt-5">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-emerald-800">
            META LEAD ADS
          </p>
          <h3
            id="lead-brochure-heading"
            className="mt-1 text-2xl font-bold text-stone-950"
          >
            Lead form follow-up
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Route new Facebook and Instagram leads to WhatsApp with the right
            brochure, automatically.
          </p>
        </div>
        <Link
          href="/dashboard/crm/leads?panel=meta"
          className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50"
        >
          Manage Meta forms
        </Link>
      </div>

      {notice && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
        >
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      {loading ? (
        <div className="rounded-2xl border border-stone-200 p-6 text-sm text-stone-500">
          Loading Meta forms and approved templates…
        </div>
      ) : !data.forms.length ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-2xl text-emerald-700">
              ↗
            </div>
            <h4 className="mt-4 text-lg font-bold text-stone-900">
              Connect a lead form to get started
            </h4>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Link a Facebook Page and select its instant form. New submissions
              will appear in CRM and can trigger the WhatsApp brochure flow
              configured here.
            </p>
            <Link
              href="/dashboard/crm/leads?panel=meta"
              className="mt-5 inline-flex rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Connect Meta lead form
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.82fr)]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
              <label
                className="block text-sm font-semibold text-stone-800"
                htmlFor="lead-form-select"
              >
                Connected lead form
              </label>
              <select
                id="lead-form-select"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className={inputClass}
              >
                {data.forms.map((form) => (
                  <option key={form.id} value={form.id}>
                    {form.formName} · {form.pageName}
                  </option>
                ))}
              </select>
              {selected && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  <span className="rounded-full bg-stone-100 px-2.5 py-1">
                    Form {selected.formId}
                  </span>
                  <span>{selected.pageName}</span>
                  <span
                    className={`rounded-full px-2.5 py-1 font-semibold ${selected.enabled ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-600'}`}
                  >
                    {selected.enabled ? 'Active' : 'Paused'}
                  </span>
                </div>
              )}
            </div>

            {selected && (
              <>
                <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 font-bold text-emerald-700">
                      1
                    </span>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-stone-900">
                        Choose the WhatsApp sender
                      </h4>
                      {data.connections.length ? (
                        <select
                          value={selected.connectionId}
                          onChange={(event) =>
                            update({
                              connectionId: event.target.value,
                              serviceTemplateName: '',
                              carouselTemplateName: '',
                            })
                          }
                          className={inputClass}
                          aria-label="WhatsApp sender"
                        >
                          <option value="">Choose connected number</option>
                          {data.connections.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} · {item.phone}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="mt-2 text-sm text-amber-800">
                          Connect a WhatsApp Business number before enabling
                          this workflow.{' '}
                          <Link
                            href="/dashboard/whatsapp?tab=settings"
                            className="font-semibold underline"
                          >
                            WhatsApp settings
                          </Link>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 font-bold text-emerald-700">
                      2
                    </span>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-stone-900">
                        Add your brochures
                      </h4>
                      <p className="mt-1 text-sm text-stone-500">
                        Use public HTTPS links that leads can open on their
                        phones.
                      </p>
                      <label className="mt-4 block text-sm font-medium text-stone-700">
                        Construction brochure URL
                        <input
                          type="url"
                          value={selected.constructionUrl}
                          onChange={(event) =>
                            update({ constructionUrl: event.target.value })
                          }
                          placeholder="https://example.com/construction.pdf"
                          className={inputClass}
                        />
                      </label>
                      <label className="mt-3 block text-sm font-medium text-stone-700">
                        Interiors brochure URL
                        <input
                          type="url"
                          value={selected.interiorsUrl}
                          onChange={(event) =>
                            update({ interiorsUrl: event.target.value })
                          }
                          placeholder="https://example.com/interiors.pdf"
                          className={inputClass}
                        />
                      </label>
                      <label className="mt-3 block text-sm font-medium text-stone-700">
                        Construction carousel cover image URL
                        <input
                          type="url"
                          value={selected.constructionImageUrl}
                          onChange={(event) =>
                            update({ constructionImageUrl: event.target.value })
                          }
                          placeholder="https://example.com/construction-cover.jpg"
                          className={inputClass}
                        />
                      </label>
                      <label className="mt-3 block text-sm font-medium text-stone-700">
                        Interiors carousel cover image URL
                        <input
                          type="url"
                          value={selected.interiorsImageUrl}
                          onChange={(event) =>
                            update({ interiorsImageUrl: event.target.value })
                          }
                          placeholder="https://example.com/interiors-cover.jpg"
                          className={inputClass}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 font-bold text-emerald-700">
                      3
                    </span>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-stone-900">
                        Select approved WhatsApp templates
                      </h4>
                      <p className="mt-1 text-sm leading-5 text-stone-500">
                        Meta must approve both templates before this automation
                        can run.
                      </p>
                      <label className="mt-4 block text-sm font-medium text-stone-700">
                        Single service · 3 body variables
                        <select
                          value={`${selected.serviceTemplateName}|${selected.serviceTemplateLanguage}`}
                          onChange={(event) => {
                            const [
                              serviceTemplateName,
                              serviceTemplateLanguage,
                            ] = event.target.value.split('|');
                            update({
                              serviceTemplateName: serviceTemplateName ?? '',
                              serviceTemplateLanguage:
                                serviceTemplateLanguage ?? '',
                            });
                          }}
                          className={inputClass}
                        >
                          <option value="|">
                            Choose approved service template
                          </option>
                          {serviceTemplates.map((item) => (
                            <option
                              key={`${item.name}-${item.language}`}
                              value={`${item.name}|${item.language}`}
                            >
                              {item.name} · {item.language}
                            </option>
                          ))}
                        </select>
                      </label>
                      {!serviceTemplates.length && selected.connectionId && (
                        <p className="mt-1 text-xs text-amber-800">
                          No matching approved template found. It needs exactly
                          three body variables: lead name, service name,
                          brochure URL.
                        </p>
                      )}
                      <label className="mt-3 block text-sm font-medium text-stone-700">
                        Both or unrecognized service · 2-card carousel
                        <select
                          value={`${selected.carouselTemplateName}|${selected.carouselTemplateLanguage}`}
                          onChange={(event) => {
                            const [
                              carouselTemplateName,
                              carouselTemplateLanguage,
                            ] = event.target.value.split('|');
                            update({
                              carouselTemplateName: carouselTemplateName ?? '',
                              carouselTemplateLanguage:
                                carouselTemplateLanguage ?? '',
                            });
                          }}
                          className={inputClass}
                        >
                          <option value="|">
                            Choose approved two-card carousel
                          </option>
                          {carouselTemplates.map((item) => (
                            <option
                              key={`${item.name}-${item.language}`}
                              value={`${item.name}|${item.language}`}
                            >
                              {item.name} · {item.language}
                            </option>
                          ))}
                        </select>
                      </label>
                      {!carouselTemplates.length && selected.connectionId && (
                        <p className="mt-1 text-xs text-amber-800">
                          No approved 2-card image carousel template found.
                          Create one in WhatsApp Manager with both brochure
                          links in its cards.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-xs font-bold tracking-[0.12em] text-emerald-800">
                AUTOMATION PREVIEW
              </p>
              <h4 className="mt-2 text-lg font-bold text-stone-900">
                Lead arrives from Meta
              </h4>
              <div className="mt-4 space-y-3">
                <Preview
                  title="Construction"
                  detail="Sends the construction brochure link in the approved service template."
                />
                <Preview
                  title="Interiors"
                  detail="Sends the interiors brochure link in the approved service template."
                />
                <Preview
                  title="Both / not specified"
                  detail="Sends one approved carousel with construction and interiors brochure cards."
                />
              </div>
              <p className="mt-4 text-xs leading-5 text-stone-500">
                Activating this flow replaces the existing confirmation or
                quotation follow-up for this Meta form. Saving it paused keeps
                the current follow-up unchanged.
              </p>
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                WhatsApp requires an approved template for messages sent outside
                the 24-hour service window. Carousel card content and links must
                be included in the approved Meta template.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {canManage && (
                  <>
                    <button
                      type="button"
                      disabled={busy || !selected}
                      onClick={() => void save(false)}
                      className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 disabled:opacity-50"
                    >
                      Save paused
                    </button>
                    <button
                      type="button"
                      disabled={busy || !selected}
                      onClick={() => void save(true)}
                      className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busy ? 'Saving…' : 'Save and activate'}
                    </button>
                  </>
                )}
                {!canManage && (
                  <p className="text-sm text-stone-500">
                    You have view access. Ask an automation manager to change
                    these settings.
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm leading-6 text-stone-600">
              <strong className="text-stone-800">How leads are matched:</strong>{' '}
              the Meta form’s service answer is classified as construction,
              interiors, both, or unknown. The lead is saved in CRM first, then
              the chosen template is sent and logged.
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

function Preview({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-stone-100 bg-stone-50 p-3">
      <span aria-hidden="true" className="mt-0.5 text-emerald-700">
        ●
      </span>
      <div>
        <p className="text-sm font-semibold text-stone-900">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-stone-600">{detail}</p>
      </div>
    </div>
  );
}
