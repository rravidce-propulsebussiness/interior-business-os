'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crmSchemas } from '@business-os/core/crm';
import { safeFailure } from '@business-os/shared';
import { crmServices } from '../../service';

// Each invocation is deliberately bounded. Importing is never an unscoped
// Supabase insert: the authenticated member and the CRM RPC enforce tenant
// permissions, while duplicates are checked within that same organization.
const batch = z.object({
  sourceId: z.uuid(),
  stageId: z.uuid(),
  rows: z.array(z.unknown()).min(1).max(40),
}).strict();

const sheetRow = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(3).max(50),
  email: z.string().trim().max(254).default(''),
  location: z.string().trim().max(500).default(''),
  requirement: z.string().trim().max(200).default(''),
  notes: z.string().trim().max(5000).default(''),
  budget: z.string().trim().max(20).default(''),
}).strict();

export type SheetImportResult = {
  imported: number;
  duplicates: number;
  invalid: number;
  issues: string[];
  error?: string;
};

export async function importSheetLeads(
  input: unknown,
): Promise<SheetImportResult> {
  const report: SheetImportResult = {
    imported: 0, duplicates: 0, invalid: 0, issues: [],
  };
  try {
    const parsed = batch.parse(input);
    const s = await crmServices('lead.create');
    const [{ data: source, error: sourceError }, { data: stage, error: stageError }] =
      await Promise.all([
        s.client.from('lead_sources')
          .select('id')
          .eq('organization_id', s.org)
          .eq('id', parsed.sourceId)
          .eq('active', true)
          .maybeSingle(),
        s.client.from('crm_pipeline_stages')
          .select('id,outcome')
          .eq('organization_id', s.org)
          .eq('id', parsed.stageId)
          .eq('active', true)
          .maybeSingle(),
      ]);
    if (sourceError || stageError || !source || !stage || stage.outcome !== 'open') {
      return { ...report, error: 'Choose an active CRM lead source and an open pipeline stage.' };
    }

    for (const [index, item] of parsed.rows.entries()) {
      const row = sheetRow.safeParse(item);
      if (!row.success) {
        report.invalid++;
        report.issues.push('Row ' + (index + 1) + ': invalid name, phone, email, or field length.');
        continue;
      }
      const data = row.data;
      const budget = data.budget.replace(/[,₹\s]/g, '');
      if (budget && !/^\d{1,16}(\.\d{1,2})?$/.test(budget)) {
        report.invalid++;
        report.issues.push('Row ' + (index + 1) + ': budget must be a number.');
        continue;
      }
      const value = crmSchemas.leads.safeParse({
        name: data.name,
        phone: data.phone,
        email: data.email,
        source_id: parsed.sourceId,
        stage_id: parsed.stageId,
        source_detail: 'sheet:csv',
        service_type: data.requirement,
        location: data.location,
        notes: data.notes,
        site_address: {
          line1: '', line2: '', city: '', region: '',
          postal_code: '', country_code: '',
        },
        budget_min: budget || null,
        budget_max: null,
        expected_start_date: null,
      });
      if (!value.success) {
        report.invalid++;
        report.issues.push('Row ' + (index + 1) + ': invalid phone number or email.');
        continue;
      }
      try {
        const duplicates = z.object({
          leads: z.array(z.unknown()),
          customers: z.array(z.unknown()),
        }).parse(await s.crm.duplicates(data.phone, data.email));
        if (duplicates.leads.length || duplicates.customers.length) {
          report.duplicates++;
          continue;
        }
        await s.crm.save('leads', value.data);
        report.imported++;
      } catch {
        report.invalid++;
        report.issues.push('Row ' + (index + 1) + ': could not save. Check the source, permissions, or record.');
      }
    }
    if (report.imported) revalidatePath('/dashboard/crm/leads');
    return { ...report, issues: report.issues.slice(0, 15) };
  } catch (error) {
    return { ...report, error: safeFailure(error).message || 'Import failed.' };
  }
}
