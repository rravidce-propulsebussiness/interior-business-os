/* eslint-disable @next/next/no-html-link-for-pages -- Use full-document navigation to All Leads on Hostinger. */
'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  importSheetLeads,
  initializeCrmForImports,
  type SheetImportResult,
} from './actions';

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
const headers = [
  'Name',
  'Phone',
  'Email',
  'Location',
  'Requirement',
  'Notes',
  'Budget',
];

function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value.trimStart()) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
function downloadTemplate() {
  const body = [
    headers,
    [
      'Asha Kumar',
      '+919876543210',
      'asha@example.com',
      'Hyderabad',
      '2 BHK interiors',
      'Initial enquiry',
      '500000',
    ],
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
  const url = URL.createObjectURL(
    new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'business-os-leads-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** RFC 4180 style parser: quoted commas, escaped quotes and multiline fields. */
function readCsv(text: string, separator = ','): string[][] {
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
    } else if (char === separator && !quoted) {
      record.push(cell);
      cell = '';
    } else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      record.push(cell);
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
      cell = '';
      if (records.length > MAX_ROWS + 1)
        throw new Error('Maximum 500 leads per import.');
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted cell.');
  record.push(cell);
  if (record.some((value) => value.trim())) records.push(record);
  if (records.length > MAX_ROWS + 1)
    throw new Error('Maximum 500 leads per import.');
  return records;
}

function normalize(key: string) {
  return key
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
}
const aliases: Record<keyof SheetRow, string[]> = {
  name: ['name', 'customername', 'leadname', 'clientname'],
  phone: [
    'phone',
    'mobile',
    'mobilenumber',
    'phonenumber',
    'contact',
    'contactnumber',
  ],
  email: ['email', 'emailaddress'],
  location: ['location', 'city', 'area', 'address'],
  requirement: [
    'requirement',
    'projecttype',
    'servicetype',
    'service',
    'project',
  ],
  notes: ['notes', 'remarks', 'description', 'details'],
  budget: ['budget', 'estimatedbudget'],
};
function mapRows(records: string[][]) {
  if (records.length < 2)
    throw new Error('Include a header row and at least one lead.');
  const raw = records[0]!.map((header) =>
    normalize(header.replace(/^\uFEFF/, '')),
  );
  const positions = Object.fromEntries(
    (Object.entries(aliases) as [keyof SheetRow, string[]][]).map(
      ([key, names]) => [
        key,
        raw.findIndex((column) => names.includes(column)),
      ],
    ),
  ) as Record<keyof SheetRow, number>;
  if (positions.name < 0 || positions.phone < 0) {
    throw new Error(
      'Your sheet must contain Name and Phone columns. Use the template for the other fields.',
    );
  }
  return records.slice(1).map((values) => {
    const get = (key: keyof SheetRow) =>
      positions[key] < 0 ? '' : (values[positions[key]] ?? '').trim();
    return {
      name: get('name'),
      phone: get('phone'),
      email: get('email'),
      location: get('location'),
      requirement: get('requirement'),
      notes: get('notes'),
      budget: get('budget'),
    };
  });
}

export function SheetImportForm({
  sources,
  stages,
  canSetup,
  method,
}: {
  sources: Choice[];
  stages: Choice[];
  canSetup: boolean;
  method: 'file' | 'google';
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteText, setPasteText] = useState('');
  const [dragActive, setDragActive] = useState(false);
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

  async function prepareFile(file: File | undefined) {
    setRows([]);
    setError('');
    setReport(null);
    if (!file) return;
    setFilename(file.name);
    if (!/\.csv$/i.test(file.name)) {
      setError(
        'Choose a CSV file. In Excel: Save As → CSV; in Google Sheets: File → Download → CSV.',
      );
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Maximum CSV file size is 1 MB.');
      return;
    }
    try {
      setRows(mapRows(readCsv(await file.text())));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not read this CSV.',
      );
    }
  }

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    await prepareFile(event.target.files?.[0]);
    event.target.value = '';
  }

  function loadGoogleRows() {
    setRows([]);
    setError('');
    setReport(null);
    try {
      if (!pasteText.trim())
        throw new Error('Copy a table from Google Sheets and paste it above.');
      const delimiter = pasteText.includes('\t') ? '\t' : ',';
      const parsed = mapRows(readCsv(pasteText, delimiter));
      setRows(parsed);
      setFilename('Google Sheets copied rows');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not read pasted rows.',
      );
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (!running) void prepareFile(event.dataTransfer.files[0]);
  }

  async function submit() {
    if (running || !rows.length) return;
    if (!sourceId || !stageId) {
      setError(
        'Select a lead source and an open pipeline stage before importing. If none are available, use the CRM setup option below.',
      );
      return;
    }
    setRunning(true);
    setError('');
    setReport(null);
    setProgress(0);
    const aggregate: SheetImportResult = {
      imported: 0,
      duplicates: 0,
      invalid: 0,
      issues: [],
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
        aggregate.issues.push(
          ...current.issues.map((issue) => {
            const match = /^Row (\d+):/.exec(issue);
            return match
              ? 'Row ' +
                  (Number(match[1]) + index) +
                  issue.slice(match[0].length - 1)
              : issue;
          }),
        );
        setProgress(Math.min(index + 40, rows.length));
      }
      setReport(aggregate);
      if (!aggregate.error) setRows([]);
    } catch {
      setError(
        'Connection interrupted. Some previous batches may have been imported. Reupload to skip duplicate leads.',
      );
      setReport(aggregate);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="crm-import-workspace">
      <section className="crm-import-main" aria-label="Upload CRM leads">
        <div className="crm-import-hero">
          <div className="crm-import-eyebrow">
            {method === 'file' ? 'CSV IMPORT' : 'SHEET IMPORT'}
          </div>
          <div className="crm-import-hero-heading">
            <div>
              <h2>
                {method === 'file'
                  ? 'Choose your CSV file'
                  : 'Paste your Google Sheets data'}
              </h2>
              <p>
                {method === 'file'
                  ? 'Upload a CSV file, preview customer enquiries and import them into All Leads.'
                  : 'Copy rows from your private Google Sheet, preview the data and import into All Leads.'}
              </p>
            </div>
            <button
              type="button"
              className="crm-import-template"
              onClick={downloadTemplate}
            >
              ↓ Download CSV template
            </button>
          </div>
          <div className="crm-import-facts">
            <span>✓ Duplicate detection</span>
            <span>✓ 500 leads per import</span>
            <span>✓ Private to your company</span>
          </div>
        </div>
        <div className="crm-import-content">
          {method === 'file' ? (
            <div
              className={
                'crm-import-dropzone' +
                (dragActive ? ' crm-import-dragging' : '')
              }
              onDragEnter={(event) => {
                event.preventDefault();
                if (!running) setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (!running) setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragActive(false);
              }}
              onDrop={handleDrop}
            >
              <div className="crm-import-drop-icon" aria-hidden="true">
                ↑
              </div>
              <h3>Drop your leads file here</h3>
              <p>Drag and drop a CSV file, or choose it from your computer</p>
              <label
                htmlFor="crm-import-upload-input"
                className="crm-import-primary crm-import-file-picker"
                aria-disabled={running}
              >
                Browse files
              </label>
              <input
                ref={fileInputRef}
                id="crm-import-upload-input"
                type="file"
                accept=".csv,text/csv"
                aria-label="Choose CSV lead sheet"
                disabled={running}
                onChange={loadFile}
                className="crm-import-file-input"
              />
              <small>Excel: Save As CSV · Max 1 MB · Up to 500 rows</small>
            </div>
          ) : (
            <div className="crm-import-google-panel">
              <div className="crm-import-google-info">
                <strong>
                  Import from Google Sheets without sharing your sheet
                </strong>
                <p>
                  Select the header row and lead rows in Google Sheets, press
                  Ctrl+C, then paste below. The first row should contain Name
                  and Phone column headings.
                </p>
              </div>
              <label
                className="crm-import-paste-label"
                htmlFor="crm-google-sheet-paste"
              >
                Paste copied spreadsheet cells
              </label>
              <textarea
                id="crm-google-sheet-paste"
                rows={6}
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                disabled={running}
                placeholder={
                  'Name\tPhone\tEmail\tLocation\tRequirement\nAsha Kumar\t+919876543210\tasha@example.com\tHyderabad\t2 BHK interiors'
                }
              />
              <div className="crm-import-google-footer">
                <span>
                  Tab-separated spreadsheet rows and CSV text are supported.
                </span>
                <button
                  type="button"
                  className="crm-import-primary"
                  onClick={loadGoogleRows}
                  disabled={running || !pasteText.trim()}
                >
                  Preview pasted leads →
                </button>
              </div>
              <p className="crm-import-google-note">
                This is a secure manual paste, not a background Google account
                connection.
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="crm-import-error">
              {error}
            </p>
          )}
          {!!rows.length && (
            <div className="crm-import-preview">
              <div className="crm-import-section-heading">
                <div>
                  <span className="crm-import-step">01</span>
                  <div>
                    <h3>Review lead preview</h3>
                    <p>
                      {filename} · {rows.length} ready for validation
                    </p>
                  </div>
                </div>
                <span className="crm-import-count">{rows.length} leads</span>
              </div>
              <div className="crm-import-preview-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Customer name</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Location</th>
                      <th>Requirement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((row, index) => (
                      <tr key={index}>
                        <td>{row.name || '—'}</td>
                        <td>{row.phone || '—'}</td>
                        <td>{row.email || '—'}</td>
                        <td>{row.location || '—'}</td>
                        <td>{row.requirement || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 8 && (
                <p className="crm-import-preview-extra">
                  Showing the first 8 of {rows.length} rows.
                </p>
              )}
            </div>
          )}
          <div className="crm-import-options">
            <div className="crm-import-section-heading">
              <div>
                <span className="crm-import-step">02</span>
                <div>
                  <h3>Choose import settings</h3>
                  <p>New records will enter the same All Leads workspace.</p>
                </div>
              </div>
            </div>
            <div className="crm-import-selectors">
              <label>
                Lead source
                <select
                  value={sourceId}
                  onChange={(event) => setSourceId(event.target.value)}
                  disabled={running}
                >
                  {!sources.length && (
                    <option value="">No active sources configured</option>
                  )}
                  {sources.map((source) => (
                    <option key={source.value} value={source.value}>
                      {source.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Starting stage
                <select
                  value={stageId}
                  onChange={(event) => setStageId(event.target.value)}
                  disabled={running}
                >
                  {!stages.length && (
                    <option value="">No open stages configured</option>
                  )}
                  {stages.map((stage) => (
                    <option key={stage.value} value={stage.value}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {(!sources.length || !stages.length) && (
              <div role="alert" className="crm-import-warning">
                This company does not yet have an active lead source or open
                pipeline stage. Set up the default CRM options below before
                importing.
                {canSetup && (
                  <button
                    type="button"
                    disabled={setupBusy}
                    onClick={async () => {
                      setSetupBusy(true);
                      const result = await initializeCrmForImports().catch(
                        () => ({
                          ok: false,
                          message: 'Could not initialize CRM. Try again.',
                        }),
                      );
                      setSetupMessage(result.message);
                      setSetupBusy(false);
                      if (result.ok) window.location.reload();
                    }}
                  >
                    {setupBusy
                      ? 'Setting up CRM…'
                      : 'Set up default CRM stages and sources'}
                  </button>
                )}
                {setupMessage && <p role="status">{setupMessage}</p>}
              </div>
            )}
            <div className="crm-import-footer-actions">
              <div>
                <strong>Ready to import?</strong>
                <p>Existing phone/email matches are skipped automatically.</p>
              </div>
              <button
                type="button"
                className="crm-import-primary crm-import-confirm"
                disabled={running || !rows.length || !sourceId || !stageId}
                onClick={submit}
              >
                {running
                  ? 'Importing ' + progress + ' / ' + rows.length + '…'
                  : 'Import ' + rows.length + ' leads →'}
              </button>
            </div>
            {running && (
              <div
                className="crm-import-progress"
                role="progressbar"
                aria-label="Lead import progress"
                aria-valuemin={0}
                aria-valuemax={rows.length}
                aria-valuenow={progress}
              >
                <span
                  style={{
                    width:
                      (rows.length ? (progress / rows.length) * 100 : 0) + '%',
                  }}
                />
              </div>
            )}
          </div>
          {report && (
            <div role="status" className="crm-import-report">
              <h3>Import results</h3>
              <div className="crm-import-report-stats">
                <span>
                  <strong>{report.imported}</strong> Imported
                </span>
                <span>
                  <strong>{report.duplicates}</strong> Duplicates skipped
                </span>
                <span>
                  <strong>{report.invalid}</strong> Invalid
                </span>
              </div>
              {report.error && (
                <p className="crm-import-error">{report.error}</p>
              )}
              {!!report.issues.length && (
                <ul>
                  {report.issues.slice(0, 10).map((issue, index) => (
                    <li key={index}>{issue}</li>
                  ))}
                </ul>
              )}
              <a className="crm-import-view-leads" href="/dashboard/crm/leads">
                View All Leads →
              </a>
            </div>
          )}
        </div>
      </section>
      <aside className="crm-import-help">
        <div className="crm-import-help-icon" aria-hidden="true">
          ✦
        </div>
        <h3>Import without the busywork</h3>
        <p>
          {method === 'file'
            ? 'Upload an Excel CSV export into the same CRM your team uses to contact customers.'
            : 'Paste lead rows copied from Google Sheets without sharing your sheet publicly.'}
        </p>
        <ol>
          <li>
            <span>1</span>
            <div>
              <strong>Prepare your sheet</strong>
              <p>Include Name and Phone columns. Other fields are optional.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Upload or paste</strong>
              <p>Preview the information before saving anything.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Import into All Leads</strong>
              <p>
                Duplicates are checked and your team can contact customers
                immediately.
              </p>
            </div>
          </li>
        </ol>
        <div className="crm-import-help-note">
          <strong>Your customer data stays private</strong>
          <p>
            Imports are saved into your current company only. Google Sheets rows
            can be pasted without making the sheet public.
          </p>
        </div>
      </aside>
    </div>
  );
}
