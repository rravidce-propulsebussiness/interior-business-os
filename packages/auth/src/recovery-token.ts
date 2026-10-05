import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const lifetime = 10 * 60 * 1000;
export const validRecoveryToken = (token: string) =>
  /^[A-Za-z0-9_-]{20,512}$/.test(token);
function keyBytes(key: string) {
  if (!/^[a-f0-9]{64}$/.test(key))
    throw new Error('AUTH_RECOVERY_SIGNING_KEY is required');
  return Buffer.from(key, 'hex');
}
/** A pending provider token, not an authenticated session. Bound to this app origin. */
export function sealRecoveryToken(
  token: string,
  key: string,
  origin: string,
  now = Date.now(),
) {
  if (!validRecoveryToken(token)) throw new Error('Invalid recovery link');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(key), iv);
  cipher.setAAD(Buffer.from(`recovery:v1:${origin}`));
  const data = Buffer.concat([
    cipher.update(JSON.stringify({ token, expiresAt: now + lifetime }), 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), data]
    .map((value) => value.toString('base64url'))
    .join('.');
}
export function openRecoveryToken(
  value: string | undefined,
  key: string,
  origin: string,
  now = Date.now(),
): string | null {
  try {
    if (!value || value.length > 1200 || !/^[A-Za-z0-9_.-]+$/.test(value))
      return null;
    const parts = value
      .split('.')
      .map((part) => Buffer.from(part, 'base64url'));
    if (
      parts.length !== 3 ||
      parts[0]!.length !== 12 ||
      parts[1]!.length !== 16
    )
      return null;
    const decipher = createDecipheriv('aes-256-gcm', keyBytes(key), parts[0]!);
    decipher.setAAD(Buffer.from(`recovery:v1:${origin}`));
    decipher.setAuthTag(parts[1]!);
    const data = JSON.parse(
      Buffer.concat([decipher.update(parts[2]!), decipher.final()]).toString(
        'utf8',
      ),
    );
    return typeof data.token === 'string' &&
      validRecoveryToken(data.token) &&
      Number.isFinite(data.expiresAt) &&
      data.expiresAt > now &&
      data.expiresAt <= now + lifetime
      ? data.token
      : null;
  } catch {
    return null;
  }
}
