import 'server-only';

import { randomUUID } from 'node:crypto';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import {
  ensureQuotationPdfBucket,
  QUOTATION_PDF_BUCKET,
  MAX_QUOTATION_PDF_BYTES,
} from '../../quotations/quotation-storage';

/**
 * Snapshot the source package PDF onto the draft quotation, so issued
 * revision PDFs never change if the original package is edited later.
 * The caller has already checked organization membership, quotation.edit
 * and pricing access before saving the revision's price line.
 */
export async function snapshotConstructionPackagePdf(
  organizationId: string,
  revisionId: string,
  packageId: string | null,
  userId: string,
) {
  const admin = createOwnerProvisioningDatabase();
  const { data: previous, error: previousError } = await admin
    .from('quotation_studio_attachments')
    .select('id,storage_path,byte_size')
    .eq('organization_id', organizationId)
    .eq('revision_id', revisionId)
    .not('source_package_id', 'is', null)
    .maybeSingle();
  if (previousError) throw Error('Cannot load existing package PDF snapshot');

  const { data: source, error: sourceError } = packageId
    ? await admin
        .from('construction_package_spec_attachments')
        .select('storage_path,filename,byte_size')
        .eq('organization_id', organizationId)
        .eq('package_id', packageId)
        .maybeSingle()
    : { data: null, error: null };
  if (sourceError) throw Error('Cannot load company package PDF');
  if (!source || !packageId) {
    if (previous) {
      const { error } = await admin
        .from('quotation_studio_attachments')
        .delete()
        .eq('id', previous.id)
        .eq('organization_id', organizationId)
        .eq('revision_id', revisionId);
      if (error) throw Error('Cannot detach old package PDF');
      await admin.storage
        .from(QUOTATION_PDF_BUCKET)
        .remove([previous.storage_path])
        .catch(() => undefined);
    }
    return;
  }
  if (source.byte_size > MAX_QUOTATION_PDF_BYTES)
    throw Error('Package PDF exceeds quotation attachment limit');

  const { data: existingFiles, error: countError } = await admin
    .from('quotation_studio_attachments')
    .select('id,byte_size')
    .eq('organization_id', organizationId)
    .eq('revision_id', revisionId);
  if (countError) throw Error('Quotation files unavailable');
  const others = (existingFiles ?? []).filter(
    (file) => file.id !== previous?.id,
  );
  if (
    others.length >= 6 ||
    others.reduce((sum, f) => sum + f.byte_size, source.byte_size) >
      30 * 1024 * 1024
  )
    throw Error('Remove an existing annexure before adding the package PDF');

  const { data: file, error: downloadError } = await admin.storage
    .from(QUOTATION_PDF_BUCKET)
    .download(source.storage_path);
  if (downloadError || !file) throw Error('Package PDF storage unavailable');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== source.byte_size)
    throw Error('Package PDF size validation failed');
  await ensureQuotationPdfBucket(admin);
  const path = [organizationId, revisionId, randomUUID() + '.pdf'].join('/');
  const { error: uploadError } = await admin.storage
    .from(QUOTATION_PDF_BUCKET)
    .upload(path, bytes, {
      contentType: 'application/pdf',
      cacheControl: '0',
      upsert: false,
    });
  if (uploadError) throw Error('Cannot snapshot package PDF');
  const { error: insertError } = await admin
    .from('quotation_studio_attachments')
    .upsert(
      {
        ...(previous ? { id: previous.id } : {}),
        organization_id: organizationId,
        revision_id: revisionId,
        source_package_id: packageId,
        storage_path: path,
        filename: source.filename,
        byte_size: source.byte_size,
        created_by: userId,
      },
      { onConflict: 'id' },
    );
  if (insertError) {
    await admin.storage.from(QUOTATION_PDF_BUCKET).remove([path]);
    throw Error('Cannot register package PDF with quotation');
  }
  if (previous)
    await admin.storage
      .from(QUOTATION_PDF_BUCKET)
      .remove([previous.storage_path])
      .catch(() => undefined);
}
