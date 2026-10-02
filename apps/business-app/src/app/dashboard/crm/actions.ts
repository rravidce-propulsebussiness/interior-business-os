'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  crmSchemas,
  crmCommandSchema,
  conversionSchema,
  type CrmEntity,
} from '@business-os/core/crm';
import { safeFailure } from '@business-os/shared';
import { crmServices } from './service';
export async function saveCrm(
  entity: CrmEntity,
  input: Record<string, unknown>,
): Promise<{ message: string; id?: string }> {
  try {
    const acknowledge = input.acknowledge_duplicate === true;
    input = { ...input };
    delete input.acknowledge_duplicate;
    const schema = crmSchemas[entity];
    if (!schema) throw new Error('Invalid entity');
    if (
      entity === 'crm_requirement_fields' &&
      typeof input.options === 'string'
    )
      input = {
        ...input,
        options: input.options
          .split(/\r?\n/)
          .map((v) => v.trim())
          .filter(Boolean),
      };
    if (
      entity === 'leads' &&
      input.requirements &&
      typeof input.requirements === 'object' &&
      !Array.isArray(input.requirements)
    )
      input = {
        ...input,
        requirements: Object.fromEntries(
          Object.entries(input.requirements).filter(
            ([, v]) => v !== '' && v !== null,
          ),
        ),
      };
    const parsed = schema.parse(input);
    const s = await crmServices();
    if (entity === 'leads' && !('id' in parsed) && !acknowledge) {
      const match = z
        .object({
          leads: z.array(z.unknown()),
          customers: z.array(z.unknown()),
        })
        .parse(
          await s.crm.duplicates(
            String(input.phone ?? ''),
            String(input.email ?? ''),
          ),
        );
      if (match.leads.length || match.customers.length)
        return {
          message:
            'Possible existing lead/customer. Review matches, then acknowledge the duplicate warning to create this lead intentionally.',
        };
    }
    const id = await s.crm.save(entity, parsed);
    revalidatePath('/dashboard', 'layout');
    return { message: 'Saved.', id };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
export async function runCrmCommand(
  input: Record<string, unknown>,
): Promise<{ message: string; id?: string }> {
  try {
    const { action, ...value } = crmCommandSchema.parse(input);
    const s = await crmServices();
    const id = await s.crm.command(action, value);
    revalidatePath('/dashboard', 'layout');
    return { message: 'Updated.', id };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
export async function convertLead(
  input: Record<string, unknown>,
): Promise<{ message: string; id?: string }> {
  try {
    const value = conversionSchema.parse(input);
    const s = await crmServices('lead.convert');
    const result = z
      .object({ project_id: z.uuid() })
      .parse(await s.crm.convert(value));
    revalidatePath('/dashboard', 'layout');
    return { message: 'Lead converted.', id: result.project_id };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
export async function checkDuplicates(
  input: Record<string, unknown>,
): Promise<{ message: string; id?: string }> {
  try {
    const v = z
      .object({ phone: z.string().max(50), email: z.string().max(254) })
      .parse(input);
    const s = await crmServices();
    const result = z
      .object({
        leads: z.array(z.object({ name: z.string() })),
        customers: z.array(z.object({ display_name: z.string() })),
      })
      .parse(await s.crm.duplicates(v.phone, v.email));
    return {
      message:
        result.leads.length || result.customers.length
          ? 'Possible existing lead/customer: ' +
            [
              ...result.leads.map((r) => r.name),
              ...result.customers.map((r) => r.display_name),
            ].join(', ')
          : 'No matching lead/customer found.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
