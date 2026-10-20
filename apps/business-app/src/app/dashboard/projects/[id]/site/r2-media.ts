import 'server-only';

import { createHash, createHmac, randomUUID } from 'node:crypto';

const BUCKET = 'business-os-media';
const MAX_BYTES = 8 * 1024 * 1024;
type R2Config = {
  account: string;
  access: string;
  secret: string;
};
function config(): R2Config | null {
  if (process.env.BUSINESS_OS_R2_ENABLED !== 'true') return null;
  const account = process.env.BUSINESS_OS_R2_ACCOUNT_ID?.trim();
  const access = process.env.BUSINESS_OS_R2_ACCESS_KEY_ID?.trim();
  const secret = process.env.BUSINESS_OS_R2_SECRET_ACCESS_KEY?.trim();
  if (!account || !access || !secret || !/^[0-9a-f]{32}$/.test(account)) {
    throw new Error('R2 media is enabled but its private credentials are missing');
  }
  return { account, access, secret };
}
export function r2MediaEnabled() {
  return config() !== null;
}
export function r2MediaKey(org: string, project: string) {
  return 'site/' + org + '/' + project + '/' + randomUUID();
}
export function r2MediaHash(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}
export function validateR2MediaBytes(bytes: Buffer, mime: string) {
  if (bytes.length < 1 || bytes.length > MAX_BYTES) throw new Error('File too large');
  const isPrefix = (hex: string) => bytes.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));
  const valid = mime === 'image/jpeg' ? isPrefix('ffd8') :
    mime === 'image/png' ? isPrefix('89504e47') :
    mime === 'image/webp' ? bytes.length >= 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP' :
    mime === 'video/mp4' ? bytes.length >= 8 &&
      bytes.toString('ascii', 4, 8) === 'ftyp' :
    mime === 'application/pdf' ? isPrefix('25504446') : false;
  if (!valid) throw new Error('File content does not match the selected type');
}
function sha256(bytes: Buffer | string) {
  return createHash('sha256').update(bytes).digest('hex');
}
function hmac(secret: Buffer | string, text: string) {
  return createHmac('sha256', secret).update(text).digest();
}
async function request(
  method: 'PUT' | 'GET' | 'HEAD' | 'DELETE',
  key: string,
  bytes?: Buffer,
  mime?: string,
) {
  const values = config();
  if (!values) throw new Error('R2 media is not configured');
  if (!/^site\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/.test(key))
    throw new Error('Invalid R2 object key');
  if (bytes && bytes.length > MAX_BYTES) throw new Error('File too large');
  const host = values.account + '.r2.cloudflarestorage.com';
  const uri = '/' + BUCKET + '/' + key.split('/').map(encodeURIComponent).join('/');
  const now = new Date().toISOString();
  const timestamp = now.replace(/[:-]|\.\d{3}/g, '');
  const date = timestamp.slice(0, 8);
  const hash = sha256(bytes ?? Buffer.alloc(0));
  const scope = date + '/auto/s3/aws4_request';
  const canonicalHeaders =
    'host:' + host + '\n' +
    'x-amz-content-sha256:' + hash + '\n' +
    'x-amz-date:' + timestamp + '\n';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonical = [
    method, uri, '', canonicalHeaders, signedHeaders, hash,
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    scope,
    sha256(canonical),
  ].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac('AWS4' + values.secret, date), 'auto'), 's3'),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey)
    .update(stringToSign).digest('hex');
  const headers: Record<string, string> = {
    'x-amz-date': timestamp,
    'x-amz-content-sha256': hash,
    Authorization:
      'AWS4-HMAC-SHA256 Credential=' + values.access + '/' + scope +
      ', SignedHeaders=' + signedHeaders + ', Signature=' + signature,
  };
  if (method === 'PUT' && mime) headers['Content-Type'] = mime;
  return fetch('https://' + host + uri, {
    method, headers, body: bytes ? new Uint8Array(bytes) : undefined,
    cache: 'no-store', redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
}
export async function r2MediaPut(key: string, bytes: Buffer, mime: string) {
  validateR2MediaBytes(bytes, mime);
  const response = await request('PUT', key, bytes, mime);
  if (!response.ok) throw new Error('R2 upload failed: ' + response.status);
  try {
    const check = await request('HEAD', key);
    if (!check.ok || Number(check.headers.get('content-length')) !== bytes.length)
      throw new Error('R2 upload verification failed');
  } catch (error) {
    await r2MediaDelete(key).catch(() => undefined);
    throw error;
  }
}
export async function r2MediaGet(key: string) {
  const response = await request('GET', key);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('R2 retrieval failed: ' + response.status);
  if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES)
    throw new Error('R2 object too large');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error('R2 object too large');
  return bytes;
}
export async function r2MediaDelete(key: string) {
  const response = await request('DELETE', key);
  if (!response.ok && response.status !== 404)
    throw new Error('R2 cleanup failed: ' + response.status);
}
