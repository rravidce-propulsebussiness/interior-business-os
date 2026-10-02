'use server';
import { revalidatePath } from 'next/cache';
import { quotationCommandSchema } from '@business-os/core/commercial';
import { safeFailure, idSchema, DomainError } from '@business-os/shared';
import { commercialServices } from '../commercial/service';
export async function quotationCommand(
  input: unknown,
): Promise<{ message: string; id?: string }> {
  try {
    const command = quotationCommandSchema.parse(input),
      s = await commercialServices('quotation.view', 'quotation');
    const id = await s.commercial.commit(s.org, command);
    revalidatePath('/dashboard', 'layout');
    return { message: 'Quotation updated.', id };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
export async function saveQuotationLine(
  revisionId: string,
  version: number,
  type: 'catalog' | 'manual',
  input: unknown,
): Promise<{ message: string; id?: string }> {
  try {
    idSchema.parse(revisionId);
    if (
      !Number.isInteger(version) ||
      version < 1 ||
      !['catalog', 'manual'].includes(type)
    )
      throw new DomainError('VALIDATION_FAILED');
    const s = await commercialServices('quotation.edit', 'quotation');
    const id =
      type === 'catalog'
        ? await s.commercial.saveCatalogLine(s.org, revisionId, version, input)
        : await s.commercial.saveManualLine(s.org, revisionId, version, input);
    revalidatePath('/dashboard', 'layout');
    return { message: 'Line saved using authoritative pricing.', id };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
