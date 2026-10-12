'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crmSchemas } from '@business-os/core/crm';
import { crmServices } from '../service';

const leadInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    phone: z.string().trim().min(3).max(50),
    email: z.string().trim().max(254),
    location: z.string().trim().max(500),
    requirement: z.string().trim().max(200),
    notes: z.string().trim().max(5000),
    sourceId: z.uuid(),
    stageId: z.uuid(),
  })
  .strict();

export async function createQuickLead(
  input: unknown,
): Promise<{ ok: boolean; message: string }> {
  try {
    const data = leadInput.parse(input);
    const s = await crmServices('lead.create');
    const [
      { data: source, error: sourceError },
      { data: stage, error: stageError },
    ] = await Promise.all([
      s.client
        .from('lead_sources')
        .select('id,key')
        .eq('organization_id', s.org)
        .eq('id', data.sourceId)
        .eq('active', true)
        .maybeSingle(),
      s.client
        .from('crm_pipeline_stages')
        .select('id,outcome')
        .eq('organization_id', s.org)
        .eq('id', data.stageId)
        .eq('active', true)
        .maybeSingle(),
    ]);
    if (
      sourceError ||
      stageError ||
      !source ||
      !stage ||
      stage.outcome !== 'open' ||
      source.key === 'propulse_marketplace'
    ) {
      return {
        ok: false,
        message: 'Choose an active lead source and an open pipeline stage.',
      };
    }
    const duplicates = z
      .object({
        leads: z.array(z.unknown()),
        customers: z.array(z.unknown()),
      })
      .parse(await s.crm.duplicates(data.phone, data.email));
    if (duplicates.leads.length || duplicates.customers.length) {
      return {
        ok: false,
        message:
          'A matching phone number or email already exists in this company CRM.',
      };
    }
    const saved = crmSchemas.leads.safeParse({
      name: data.name,
      phone: data.phone,
      email: data.email,
      source_id: source.id,
      stage_id: stage.id,
      source_detail: source.key === 'manual' ? 'manual:entry' : 'manual:form',
      location: data.location,
      service_type: data.requirement,
      notes: data.notes,
      site_address: {
        line1: '',
        line2: '',
        city: '',
        region: '',
        postal_code: '',
        country_code: '',
      },
      budget_min: null,
      budget_max: null,
      expected_start_date: null,
    });
    if (!saved.success) {
      return {
        ok: false,
        message:
          'Enter a valid customer name, phone number and optional email.',
      };
    }
    await s.crm.save('leads', saved.data);
    revalidatePath('/dashboard/crm/leads');
    return { ok: true, message: 'Lead added to All Leads.' };
  } catch {
    return {
      ok: false,
      message: 'Unable to add lead. Check the fields and company permissions.',
    };
  }
}
