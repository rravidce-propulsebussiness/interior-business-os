/* eslint-disable @next/next/no-html-link-for-pages -- Use full document links on Hostinger to avoid incomplete RSC Flight navigation. */
import { crmServices } from '../../service';
import { lookups } from '../../lookups';
import { LeadsSectionNav } from '../sections-nav';
import { SheetImportForm } from './sheet-import-form';
import '../leads.css';

export const dynamic = 'force-dynamic';

export default async function ImportLeads() {
  const s = await crmServices('lead.create', true);
  const choices = await lookups(s, {});
  const sources = choices.sources.rows
    .filter((row) => typeof row.id === 'string' && typeof row.name === 'string')
    .map((row) => ({ value: String(row.id), label: String(row.name) }));
  const stages = choices.stages.rows
    .filter(
      (row) =>
        typeof row.id === 'string' &&
        typeof row.name === 'string' &&
        row.outcome === 'open',
    )
    .map((row) => ({ value: String(row.id), label: String(row.name) }));
  return (
    <main id="main-content" className="crm-leads-root">
      <div className="crm-leads-breadcrumb">
        <a href="/dashboard">Workspace</a>
        <span>›</span>
        <a href="/dashboard/crm/leads">CRM Leads</a>
        <span>›</span>
        <strong>Sheet Import</strong>
      </div>
      <div className="crm-leads-heading">
        <div>
          <h1>Import leads</h1>
          <p>
            Upload a spreadsheet, preview your leads and skip duplicates
            automatically.
          </p>
        </div>
        <a href="/dashboard/crm/leads" className="crm-outline">
          ← All Leads
        </a>
      </div>
      <LeadsSectionNav active="import" />
      <SheetImportForm
        sources={sources}
        stages={stages}
        canSetup={
          s.allowed('crm.source.manage') && s.allowed('crm.pipeline.manage')
        }
      />
    </main>
  );
}
