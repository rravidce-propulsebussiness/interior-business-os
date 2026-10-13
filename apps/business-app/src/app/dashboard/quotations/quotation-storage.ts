import 'server-only';

import { idSchema } from '@business-os/shared';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import { commercialServices } from '../commercial/service';

export const QUOTATION_PDF_BUCKET = 'quotation-private-annexures';
export const MAX_QUOTATION_PDF_BYTES = 15 * 1024 * 1024;

/**
 * Every attachment operation is authorized through the current user's tenant
 * and edition permission, never through a caller-controlled organization ID.
 * Storage uses a server-only service credential and a private bucket.
 */
export async function quotationAttachmentContext(
  revisionId: string,
  write = false,
) {
  const parsedId = idSchema.parse(revisionId);
  const s = await commercialServices(
    write ? 'quotation.edit' : 'quotation.view',
    'quotation',
  );
  const { data: revision, error } = await s.client
    .from('quotation_revisions')
    .select('id,organization_id,status')
    .eq('organization_id', s.org)
    .eq('id', parsedId)
    .maybeSingle();
  if (error || !revision || (write && revision.status !== 'draft'))
    throw new Error('Quotation unavailable or not editable');

  const user = await s.authorization.requireAuthenticatedUser();
  return {
    admin: createOwnerProvisioningDatabase(),
    organizationId: s.org,
    revisionId: parsedId,
    userId: user.id,
  };
}

export async function ensureQuotationPdfBucket(
  admin: ReturnType<typeof createOwnerProvisioningDatabase>,
) {
  const { data } = await admin.storage.getBucket(QUOTATION_PDF_BUCKET);
  if (data) return;
  const { error } = await admin.storage.createBucket(QUOTATION_PDF_BUCKET, {
    public: false,
    fileSizeLimit: MAX_QUOTATION_PDF_BYTES,
    allowedMimeTypes: ['application/pdf'],
  });
  if (error && !/already exists|duplicate|BucketAlreadyExists/i.test(error.message)) {
    throw new Error('Private quotation PDF storage is unavailable');
  }
}
