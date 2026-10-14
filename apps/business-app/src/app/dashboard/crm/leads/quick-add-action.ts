'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crmSchemas } from '@business-os/core/crm';
import { crmServices } from '../service';
import { leadServiceFromIndustryKey } from './lead-service-options';

const constructionFields = z.object({
  projectType: z.enum(['residential', 'commercial', 'renovation', 'extension']),
  plotArea: z.string().trim().max(15),
  floors: z.enum(['ground', 'g1', 'g2', 'g3plus']),
  builtUpArea: z.string().trim().max(15),
  budget: z.string().trim().max(100),
  timeline: z.string().trim().max(100),
}).strict();

const interiorFields = z.object({
  propertyType: z.enum([
    'apartment', 'villa', 'independent_house', 'office', 'commercial_space',
  ]),
  bhk: z.string().trim().max(20),
  scope: z.enum(['end_to_end', 'selected_work']),
  selectedWork: z.array(z.enum([
    'modular_kitchen', 'wardrobes', 'tv_unit', 'false_ceiling',
    'furniture', 'lighting', 'painting', 'pooja_unit', 'study_unit',
    'crockery_unit',
  ])).max(10),
  style: z.string().trim().max(100),
  budget: z.string().trim().max(100),
  timeline: z.string().trim().max(100),
}).strict();

const leadInput = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(3).max(50),
  email: z.string().trim().max(254),
  location: z.string().trim().max(500),
  pincode: z.string().trim().max(6),
  notes: z.string().trim().max(5000),
  service: z.enum(['construction', 'interior']),
  construction: constructionFields.optional(),
  interior: interiorFields.optional(),
  sourceId: z.uuid(),
  stageId: z.uuid(),
}).strict();

function validArea(input: string): boolean {
  const value = Number(input);
  return /^[0-9]+(?:\.[0-9]{1,2})?$/.test(input) && Number.isFinite(value) &&
    value > 0 && value <= 10000000;
}

export async function createQuickLead(
  input: unknown,
): Promise<{ ok: boolean; message: string }> {
  try {
    const data = leadInput.parse(input);
    const s = await crmServices('lead.create');
    if (data.pincode && !/^[0-9]{6}$/.test(data.pincode))
      return { ok: false, message: 'Enter a valid 6-digit PIN code.' };

    if (data.service === 'construction' &&
      (!data.construction || !validArea(data.construction.plotArea)))
      return { ok: false, message: 'Select construction details and a valid plot area.' };

    if (data.service === 'construction' && data.construction?.builtUpArea &&
      !validArea(data.construction.builtUpArea))
      return { ok: false, message: 'Enter a valid built-up area in square feet.' };

    if (data.service === 'interior') {
      const details = data.interior;
      if (!details || (
        !['office', 'commercial_space'].includes(details.propertyType) &&
        !['1_bhk', '2_bhk', '3_bhk', '4_bhk', '5_plus_bhk'].includes(details.bhk)
      ) || (details.scope === 'selected_work' && !details.selectedWork.length))
        return { ok: false, message: 'Complete the interior property, BHK and work scope.' };
    }

    // A service choice is an authorization-sensitive industry. Never accept a
    // client supplied industry ID or infer service permission from a label.
    const [{ data: memberships, error: industryError }, industries] =
      await Promise.all([
        s.client.from('organization_industries')
          .select('industry_id')
          .eq('organization_id', s.org),
        s.repository.industries(),
      ]);
    if (industryError || !memberships)
      return { ok: false, message: 'Could not verify company services.' };
    const enabled = new Set(memberships.map((row) => row.industry_id));
    const industry = industries.find((entry) =>
      enabled.has(entry.id) &&
      leadServiceFromIndustryKey(entry.key) === data.service,
    );
    if (!industry)
      return { ok: false, message: 'This service is not enabled for your company.' };

    const [
      { data: source, error: sourceError },
      { data: stage, error: stageError },
    ] = await Promise.all([
      s.client.from('lead_sources')
        .select('id,key')
        .eq('organization_id', s.org)
        .eq('id', data.sourceId)
        .eq('active', true)
        .maybeSingle(),
      s.client.from('crm_pipeline_stages')
        .select('id,outcome')
        .eq('organization_id', s.org)
        .eq('id', data.stageId)
        .eq('active', true)
        .maybeSingle(),
    ]);
    if (sourceError || stageError || !source || !stage ||
      stage.outcome !== 'open' || source.key === 'propulse_marketplace') {
      return { ok: false, message: 'Choose an active lead source and open pipeline stage.' };
    }

    const duplicates = z.object({
      leads: z.array(z.unknown()),
      customers: z.array(z.unknown()),
    }).parse(await s.crm.duplicates(data.phone, data.email));
    if (duplicates.leads.length || duplicates.customers.length)
      return {
        ok: false,
        message: 'A matching phone number or email already exists in this company CRM.',
      };

    const c = data.service === 'construction' ? data.construction : undefined;
    const i = data.service === 'interior' ? data.interior : undefined;
    const requirements: Record<string, string> = data.service === 'construction' && c
      ? {
          service: 'construction',
          project_type: c.projectType,
          plot_area_sq_yards: c.plotArea,
          floors: c.floors,
          ...(c.builtUpArea ? { built_up_area_sq_ft: c.builtUpArea } : {}),
          ...(c.budget ? { budget: c.budget } : {}),
          ...(c.timeline ? { timeline: c.timeline } : {}),
        }
      : i ? {
          service: 'interior',
          property_type: i.propertyType,
          ...(!['office', 'commercial_space'].includes(i.propertyType) ? { bhk: i.bhk } : {}),
          interior_scope: i.scope,
          ...(i.scope === 'selected_work'
            ? { selected_work: i.selectedWork.join(', ') } : {}),
          ...(i.style ? { design_style: i.style } : {}),
          ...(i.budget ? { budget: i.budget } : {}),
          ...(i.timeline ? { timeline: i.timeline } : {}),
        } : {};

    const saved = crmSchemas.leads.safeParse({
      name: data.name,
      phone: data.phone,
      email: data.email,
      source_id: source.id,
      stage_id: stage.id,
      source_detail: source.key === 'manual' ? 'manual:entry' : 'manual:form',
      industry_id: industry.id,
      service_type: data.service === 'construction' ? 'Construction' : 'Interiors',
      location: data.location,
      site_address: {
        line1: '', line2: '', city: data.location, region: '',
        postal_code: data.pincode, country_code: 'IN',
      },
      project_size: c ? c.plotArea + ' sq yards' : (i?.bhk ?? ''),
      requirements,
      notes: data.notes,
      budget_min: null,
      budget_max: null,
      expected_start_date: null,
    });
    if (!saved.success)
      return { ok: false, message: 'Check the customer details and project information.' };
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
