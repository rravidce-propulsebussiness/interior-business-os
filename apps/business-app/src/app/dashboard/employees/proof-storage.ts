import 'server-only';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import { DomainError, idSchema } from '@business-os/shared';

const BUCKET = 'business-os-private-employee-proofs';
export const MAX_PROOF_BYTES = 8 * 1024 * 1024;
export const PROOF_MIME = new Set([
  'application/pdf','image/jpeg','image/png','image/webp',
]);
export function employeeProofKey(org:string,employee:string,unique:string) {
  return idSchema.parse(org)+'/'+idSchema.parse(employee)+'/'+idSchema.parse(unique);
}
async function storage() {
  const admin = createOwnerProvisioningDatabase();
  const existing = await admin.storage.getBucket(BUCKET);
  if (existing.error && !/not found/i.test(existing.error.message))
    throw new DomainError('INTERNAL_ERROR');
  if (!existing.data) {
    const created = await admin.storage.createBucket(BUCKET,{
      public:false,fileSizeLimit:MAX_PROOF_BYTES,allowedMimeTypes:[...PROOF_MIME],
    });
    if (created.error && !/already exists|duplicate/i.test(created.error.message))
      throw new DomainError('INTERNAL_ERROR');
  }
  return admin.storage.from(BUCKET);
}
export async function uploadEmployeeProof(key:string,file:File) {
  if (!PROOF_MIME.has(file.type)||file.size<1||file.size>MAX_PROOF_BYTES)
    throw new DomainError('VALIDATION_FAILED');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const valid=file.type==='application/pdf'
    ? bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70
    : file.type==='image/jpeg'
      ? bytes[0]===255&&bytes[1]===216&&bytes[2]===255
      : file.type==='image/png'
        ? bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71
        : file.type==='image/webp'
          ? String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&
            String.fromCharCode(...bytes.slice(8,12))==='WEBP' : false;
  if(!valid)throw new DomainError('VALIDATION_FAILED');
  const target = await storage();
  const result = await target.upload(
    key,bytes,{
      contentType:file.type,upsert:false,
    });
  if (result.error) throw new DomainError('INTERNAL_ERROR');
}
export async function removeEmployeeProof(key:string) {
  const target = await storage();
  await target.remove([key]);
}
export async function downloadEmployeeProof(key:string) {
  const target = await storage();
  const result=await target.download(key);
  if (result.error || !result.data) throw new DomainError('INTERNAL_ERROR');
  return result.data;
}
