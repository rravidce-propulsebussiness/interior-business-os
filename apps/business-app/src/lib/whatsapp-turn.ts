import { createHmac, randomBytes } from 'node:crypto';

export type WhatsAppIceConfig = {
  iceServers: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
  relayConfigured: boolean;
  credentialExpiresAt: number | null;
};

const DEFAULT_STUN = 'stun:stun.l.google.com:19302';

/**
 * Issue short-lived coturn REST-auth credentials on the server, not permanent
 * TURN credentials or the shared secret in a NEXT_PUBLIC variable.
 * The credentials are scoped to an authenticated WhatsApp manager request.
 */
export function whatsappIceConfig(
  turnUrls: string | undefined,
  sharedSecret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): WhatsAppIceConfig {
  const iceServers: WhatsAppIceConfig['iceServers'] = [{ urls: DEFAULT_STUN }];
  const urls = (turnUrls ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) =>
      /^turns?:[^\s/@?#]+(?::\d{1,5})?(?:\?transport=(?:tcp|udp))?$/i.test(url),
    )
    .slice(0, 8);

  if (!urls.length || !sharedSecret || sharedSecret.length < 24) {
    return { iceServers, relayConfigured: false, credentialExpiresAt: null };
  }
  const expires = Math.floor(nowSeconds) + 3600;
  const username = `${expires}:${randomBytes(12).toString('hex')}`;
  const credential = createHmac('sha1', sharedSecret)
    .update(username)
    .digest('base64');
  iceServers.push({ urls, username, credential });
  return { iceServers, relayConfigured: true, credentialExpiresAt: expires };
}
