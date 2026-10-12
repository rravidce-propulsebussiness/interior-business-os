'use client';

import { useState, type ChangeEvent } from 'react';
import { importSheetLeads, initializeCrmForImports, type SheetImportResult } from './actions';

type Choice = { value: string; label: string };
type SheetRow = {
  name: string;
  phone: string;
  email: string;
  location: string;
  requirement: string;
  notes: string;
  budget: string;
};

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_ROWS = 500;
const headers = ['Name', 'Phone', 'Email', 'Location', 'Requirement', 'Notes', 'Budget'];

function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value.trimStart()) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
function downloadTemplate() {
  const body = [
    headers,
    ['Asha Kumar', '+919876543210', 'asha@example.com', 'Hyderabad', '2 BHK interiors', 'Initial enquiry', '500000'],
  ].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'business-os-leads-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** RFC 4180 style parser: quoted commas, escaped quotes and multiline fields. */
function readCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      record.push(cell);
      cell = '';
    } else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      record.push(cell);
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
      cell = '';
      if (records.length > MAX_ROWS + 1) throw new Error('Maximum 500 leads per import.');
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted cell.');
  record.push(cell);
  if (record.some((value) => value.trim())) records.push(record);
  if (records.length > MAX_ROWS + 1) throw new Error('Maximum 500 leads per import.');
  return records;
}

function normalize(key: string) {
  return key.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}
const aliases: Record<keyof SheetRow, string[]> = {
  name: ['name', 'customername', 'leadname', 'clientname'],
  phone: ['phone', 'mobile', 'mobilenumber', 'phonenumber', 'contact', 'contactnumber'],
  email: ['email', 'emailaddress'],
  location: ['location', 'city', 'area', 'address'],
  requirement: ['requirement', 'projecttype', 'servicetype', 'service', 'project'],
  notes: ['notes', 'remarks', 'description', 'details'],
  budget: ['budget', 'estimatedbudget'],
};
function mapRows(records: string[][]) {
  if (records.length < 2) throw new Error('Include a header row and at least one lead.');
  const raw = records[0]!.map((header) => normalize(header.replace(/^\uFEFF/, '')));
  const positions = Object.fromEntries(
    (Object.entries(aliases) as [keyof SheetRow, string[]][]).map(([key, names]) =>
      [key, raw.findIndex((column) => names.includes(column))]),
  ) as Record<keyof SheetRow, number>;
  if (positions.name < 0 || positions.phone < 0) {
    throw new Error('Your sheet must contain Name and Phone columns. Use the template for the other fields.');
  }
  return records.slice(1).map((values) => {
    const get = (key: keyof SheetRow) =>
      positions[key] < 0 ? '' : (values[positions[key]] ?? '').trim();
    return {
      name: get('name'), phone: get('phone'), email: get('email'),
      location: get('location'), requirement: get('requirement'),
      notes: get('notes'), budget: get('budget'),
    };
  });
}

export function SheetImportForm({
  sources,
  stages,
  canSetup,
}: {
  sources: Choice[];
  stages: Choice[];
  canSetup: boolean;
}) {
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [sourceId, setSourceId] = useState(sources[0]?.value ?? '');
  const [stageId, setStageId] = useState(stages[0]?.value ?? '');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<SheetImportResult | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupMessage, setSetupMessage] = useState('');

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    setRows([]);
    setError('');
    setReport(null);
    const file = event.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    if (!/\.csv$/i.test(file.name)) {
      setError('Export the spreadsheet as CSV (.csv) in Excel or Google Sheets, then select that file.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Maximum CSV file size is 1 MB.');
      return;
    }
    try {
      const parsed = mapRows(readCsv(await file.text()));
      setRows(parsed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read this CSV.');
    }
  }

  async function submit() {
    if (running || !rows.length || !sourceId || !stageId) return;
    setRunning(true);
    setError('');
    setReport(null);
    setProgress(0);
    const aggregate: SheetImportResult = {
      imported: 0, duplicates: 0, invalid: 0, issues: [],
    };
    try {
      for (let index = 0; index < rows.length; index += 40) {
        const current = await importSheetLeads({
          sourceId,
          stageId,
          rows: rows.slice(index, index + 40),
        });
        if (current.error) {
          aggregate.error = current.error;
          break;
        }
        aggregate.imported += current.imported;
        aggregate.duplicates += current.duplicates;
        aggregate.invalid += current.invalid;
        aggregate.issues.push(...current.issues.map((issue) => {
          const match = /^Row (\d+):/.exec(issue);
          return match ? 'Row ' + (Number(match[1]) + index) + issue.slice(match[0].length - 1) : issue;
        }));
        setProgress(Math.min(index + 40, rows.length));
      }
      setReport(aggregate);
      if (!aggregate.error) setRows([]);
    } catch {
      setError('Connection interrupted. Some previous batches may have been imported. Reupload to skip duplicate leads.');
      setReport(aggregate);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Upload a lead sheet</h2>
            <p className="mt-2 text-sm text-slate-500">
              CSV files exported from Google Sheets or Excel · up to 500 leads · max 1 MB
            </p>
          </div>
          <button type="button" onClick={downloadTemplate}
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700">
            Download template
          </button>
        </div>
        <label className="mt-6 block cursor-pointer rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/60 p-9 text-center">
          <span className="block text-base font-semibold text-slate-800">Choose a .csv file</span>
          <span className="mt-2 block text-sm text-slate-500">Export Excel or Google Sheets as CSV first</span>
          <input type="file" accept=".csv,text/csv" onChange={loadFile} disabled={running}
            className="mx-auto mt-4 block max-w-full text-sm text-slate-700" />
        </label>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">Lead source
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}
              disabled={running} className="mt-2 block w-full rounded-lg border border-slate-200 p-3">
              {!sources.length && <option value="">No active sources configured</option>}
              {sources.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">Initial pipeline stage
            <select value={stageId} onChange={(event) => setStageId(event.target.value)}
              disabled={running} className="mt-2 block w-full rounded-lg border border-slate-200 p-3">
              {!stages.length && <option value="">No open stages configured</option>}
              {stages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
            </select>
          </label>
        </div>
        {(!sources.length || !stages.length) && (
          <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            Configure at least one active lead source and one open pipeline stage in{' '}
            <a className="font-semibold underline" href="/dashboard/crm/settings">CRM Settings</a> before importing.
            {canSetup && (
              <button type="button" disabled={setupBusy} onClick={async () => {
                setSetupBusy(true);
                const result = await initializeCrmForImports().catch(() => ({
                  ok: false, message: 'Could not initialize CRM. Try again.',
                }));
                setSetupMessage(result.message);
                setSetupBusy(false);
                if (result.ok) window.location.reload();
              }} className="mt-3 block rounded-lg bg-amber-900 px-4 py-2 text-sm font-bold text-white">
                {setupBusy ? 'Setting up CRM…' : 'Set up default CRM sources and stages'}
              </button>
            )}
            {setupMessage && <span className="mt-3 block" role="status">{setupMessage}</span>}
          </p>
        )}
        {filename && <p className="mt-5 text-sm text-slate-500">{filename} · {rows.length} rows loaded</p>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {!!rows.length && (
          <>
            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr>
                  <th className="px-3 py-3">Name</th><th className="px-3 py-3">Phone</th>
                  <th className="px-3 py-3">Location</th><th className="px-3 py-3">Requirement</th>
                </tr></thead>
                <tbody>{rows.slice(0, 8).map((row, index) => (
                  <tr key={index} className="border-t border-slate-100">
                    <td className="px-3 py-3">{row.name || '—'}</td>
                    <td className="px-3 py-3">{row.phone || '—'}</td>
                    <td className="px-3 py-3">{row.location || '—'}</td>
                    <td className="px-3 py-3">{row.requirement || '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {rows.length > 8 && <p className="mt-2 text-xs text-slate-500">Previewing 8 of {rows.length} rows</p>}
            <button type="button" disabled={running || !sourceId || !stageId} onClick={submit}
              className="mt-5 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
              {running ? 'Importing ' + progress + '/' + rows.length + '…' : 'Import ' + rows.length + ' leads'}
            </button>
          </>
        )}
        {report && (
          <div role="status" className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <strong>{report.imported} imported · {report.duplicates} duplicates skipped · {report.invalid} invalid</strong>
            {report.error && <p className="mt-2 text-red-700">{report.error}</p>}
            {report.issues.length > 0 && <ul className="mt-2 list-disc pl-5">
              {report.issues.slice(0, 10).map((issue, i) => <li key={i}>{issue}</li>)}
            </ul>}
            <p className="mt-2"><a className="font-bold underline" href="/dashboard/crm/leads">View CRM leads →</a></p>
          </div>
        )}
      </section>
      <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">How importing works</h2>
        <ol className="mt-5 list-decimal space-y-4 pl-5 text-sm leading-6 text-slate-600">
          <li>Download the template or export your existing spreadsheet as CSV.</li>
          <li>Upload the file, review the preview, and choose the CRM source and pipeline stage.</li>
          <li>Import leads into your current company workspace. Existing lead/customer phone or email matches are skipped.</li>
          <li>Use All Leads to assign staff, manage follow-ups, and prepare quotations.</li>
        </ol>
        <div className="mt-6 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
          Your sheet is parsed in your browser. Only the lead rows you confirm are submitted
          to the secured company CRM; other organizations cannot read them.
        </div>
      </aside>
    </div>
  );
}
