import 'server-only';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import {
 r2MediaEnabled,r2MediaPut,r2MediaGet,r2MediaDelete,
} from './dashboard/projects/[id]/site/r2-media';

const BUCKET='business-os-private-payment-proofs';
const LIMIT=5*1024*1024;
const allowed=['image/jpeg','image/png','image/webp','application/pdf'] as const;
const isAllowed=(value:string):value is typeof allowed[number]=>
 allowed.some(type=>type===value);

export function proofKey(org:string,project:string,proof:string){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(![org,project,proof].every(id=>uuid.test(id)))throw Error('Invalid media scope');
 return ['payment-proof',org,project,proof].join('/');
}
function check(bytes:Buffer,mime:string){
 if(bytes.length<1||bytes.length>LIMIT||!isAllowed(mime))
  throw Error('Only image or PDF evidence up to 5 MB is supported');
 const prefix=(hex:string)=>bytes.subarray(0,hex.length/2).equals(Buffer.from(hex,'hex'));
 const correct=mime==='image/jpeg'?prefix('ffd8'):
  mime==='image/png'?prefix('89504e47'):
  mime==='image/webp'?bytes.toString('ascii',0,4)==='RIFF'&&
   bytes.toString('ascii',8,12)==='WEBP':
  mime==='application/pdf'?prefix('25504446'):false;
 if(!correct)throw Error('File contents do not match image / PDF type');
}
async function bucket(){
 const admin=createOwnerProvisioningDatabase();
 const existing=await admin.storage.getBucket(BUCKET);
 if(existing.error&&!/not found/i.test(existing.error.message))
  throw Error('Private payment-proof storage unavailable');
 if(!existing.data){
  const created=await admin.storage.createBucket(BUCKET,{
   public:false,fileSizeLimit:LIMIT,allowedMimeTypes:[...allowed],
  });
  if(created.error&&!/already exists|duplicate/i.test(created.error.message))
   throw Error('Private payment-proof storage setup failed');
 }
 return admin.storage.from(BUCKET);
}
export async function savePaymentProof(key:string,bytes:Buffer,mime:string){
 if(!/^payment-proof\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/i.test(key))
  throw Error('Invalid storage key');
 check(bytes,mime);
 if(r2MediaEnabled()){await r2MediaPut(key,bytes,mime);return;}
 const client=await bucket();
 const r=await client.upload(key,new Uint8Array(bytes),
  {contentType:mime,upsert:false});
 if(r.error)throw Error('Payment screenshot upload failed');
}
export async function getPaymentProof(key:string){
 if(!/^payment-proof\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/i.test(key))
  throw Error('Invalid storage key');
 if(r2MediaEnabled())return r2MediaGet(key);
 const client=await bucket();
 const r=await client.download(key);
 if(r.error||!r.data)return null;
 const bytes=Buffer.from(await r.data.arrayBuffer());
 if(bytes.length>LIMIT)throw Error('Evidence exceeds supported size');
 return bytes;
}
export async function deletePaymentProof(key:string){
 if(!/^payment-proof\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/i.test(key))
  return;
 if(r2MediaEnabled()){await r2MediaDelete(key);return;}
 const client=await bucket();
 await client.remove([key]);
}
