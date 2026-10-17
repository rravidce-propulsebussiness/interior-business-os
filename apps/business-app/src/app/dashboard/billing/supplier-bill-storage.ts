import 'server-only';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import { DomainError, idSchema } from '@business-os/shared';

export const SUPPLIER_RECEIPTS_BUCKET = 'business-os-private-supplier-bills';
const MAX_FILE = 8 * 1024 * 1024;
const allowed = new Set(['application/pdf','image/jpeg','image/png','image/webp']);
export function supplierBillStorageKey(organizationId: string, documentId: string) {
  return idSchema.parse(organizationId) + '/' + idSchema.parse(documentId) + '/supplier-document';
}
async function bucket() {
  const admin = createOwnerProvisioningDatabase();
  const existing = await admin.storage.getBucket(SUPPLIER_RECEIPTS_BUCKET);
  if (existing.error && !/not found/i.test(existing.error.message))
    throw new DomainError('INTERNAL_ERROR');
  if (!existing.data) {
    const created = await admin.storage.createBucket(SUPPLIER_RECEIPTS_BUCKET, {
      public:false,fileSizeLimit:MAX_FILE,allowedMimeTypes:[...allowed],
    });
    if (created.error && !/already exists|duplicate/i.test(created.error.message))
      throw new DomainError('INTERNAL_ERROR');
  }
  return admin;
}
export async function saveSupplierBillAttachment(
  organizationId:string, documentId:string, file:File,
) {
  if (!allowed.has(file.type) || file.size < 1 || file.size > MAX_FILE)
    throw new DomainError('VALIDATION_FAILED');
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Never trust the user-supplied file name as a storage key.
  const admin = await bucket();
  const {error} = await admin.storage.from(SUPPLIER_RECEIPTS_BUCKET).upload(
    supplierBillStorageKey(organizationId,documentId),
    bytes,{contentType:file.type,upsert:true},
  );
  if (error) throw new DomainError('INTERNAL_ERROR');
}
export async function readSupplierBillAttachment(organizationId:string,documentId:string) {
  const admin = await bucket();
  const result = await admin.storage.from(SUPPLIER_RECEIPTS_BUCKET).download(
    supplierBillStorageKey(organizationId,documentId),
  );
  return result.data;
}
