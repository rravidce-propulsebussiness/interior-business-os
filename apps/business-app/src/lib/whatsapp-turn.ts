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

/**
 * Server-side relay settings (process.env compatible). Never prefix any of
 * these with NEXT_PUBLIC_: WHATSAPP_TURN_URLS, WHATSAPP_TURN_SHARED_SECRET,
 * WHATSAPP_TURN_CLOUDFLARE_KEY_ID, WHATSAPP_TURN_CLOUDFLARE_API_TOKEN.
 */
export type WhatsAppTurnEnvironment = Record<string, string | undefined>;

const CLOUDFLARE_TURN_ORIGIN = 'https://rtc.live.cloudflare.com';
const CLOUDFLARE_TIMEOUT_MS = 5000;
const ICE_URL =
  /^(?:stun|turns?):[A-Za-z0-9.-]+(?::\d{1,5})?(?:\?transport=(?:udp|tcp))?$/i;

/** Cloudflare Realtime TURN: a TURN key ID (32 hex) plus its API token. */
export function cloudflareTurnConfigured(env: WhatsAppTurnEnvironment) {
  return (
    /^[a-f0-9]{32}$/i.test(env.WHATSAPP_TURN_CLOUDFLARE_KEY_ID?.trim() ?? '') &&
    (env.WHATSAPP_TURN_CLOUDFLARE_API_TOKEN?.trim().length ?? 0) >= 20
  );
}

/** Whether a relay is configured (no network call; used to gate publishing). */
export function whatsappRelayConfigured(env: WhatsAppTurnEnvironment) {
  return (
    cloudflareTurnConfigured(env) ||
    whatsappIceConfig(env.WHATSAPP_TURN_URLS, env.WHATSAPP_TURN_SHARED_SECRET)
      .relayConfigured
  );
}

/**
 * Keep only well-formed STUN/TURN URLs. Cloudflare also lists port 53, which
 * browsers commonly block and which only slows ICE down, so it is dropped.
 */
export function sanitizeCloudflareIceServers(
  raw: unknown,
): WhatsAppIceConfig['iceServers'] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const servers: WhatsAppIceConfig['iceServers'] = [];
  for (const item of list.slice(0, 6)) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const urls = (Array.isArray(entry.urls) ? entry.urls : [entry.urls])
      .filter((url): url is string => typeof url === 'string')
      .map((url) => url.trim())
      .filter((url) => ICE_URL.test(url) && !/:53(?:\?|$)/.test(url))
      .slice(0, 8);
    if (!urls.length) continue;
    const isTurn = urls.some((url) => /^turns?:/i.test(url));
    if (isTurn) {
      if (
        typeof entry.username !== 'string' ||
        typeof entry.credential !== 'string' ||
        !entry.username ||
        !entry.credential
      )
        continue;
      servers.push({
        urls,
        username: entry.username,
        credential: entry.credential,
      });
    } else {
      servers.push({ urls });
    }
  }
  return servers;
}

/**
 * Resolve ICE servers for one authenticated calling session.
 * Prefers Cloudflare short-lived TURN credentials, then a coturn shared
 * secret, then STUN only. Provider secrets never reach the browser.
 */
export async function whatsappIceConfigFromEnvironment(
  env: WhatsAppTurnEnvironment,
  {
    fetchImpl = fetch,
    nowSeconds = Math.floor(Date.now() / 1000),
    ttlSeconds = 3600,
  }: {
    fetchImpl?: typeof fetch;
    nowSeconds?: number;
    ttlSeconds?: number;
  } = {},
): Promise<WhatsAppIceConfig> {
  if (cloudflareTurnConfigured(env)) {
    const keyId = env.WHATSAPP_TURN_CLOUDFLARE_KEY_ID!.trim();
    try {
      const response = await fetchImpl(
        `${CLOUDFLARE_TURN_ORIGIN}/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(CLOUDFLARE_TIMEOUT_MS),
          headers: {
            Authorization: `Bearer ${env.WHATSAPP_TURN_CLOUDFLARE_API_TOKEN!.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: ttlSeconds }),
        },
      );
      if (response.ok) {
        const body = (await response.json()) as { iceServers?: unknown };
        const iceServers = sanitizeCloudflareIceServers(body.iceServers);
        if (iceServers.some((server) => server.credential)) {
          return {
            iceServers,
            relayConfigured: true,
            credentialExpiresAt: Math.floor(nowSeconds) + ttlSeconds,
          };
        }
      }
      console.warn('whatsapp.turn.cloudflare_unavailable', {
        status: response.status,
      });
    } catch (error) {
      console.warn('whatsapp.turn.cloudflare_unavailable', {
        reason: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
  return whatsappIceConfig(
    env.WHATSAPP_TURN_URLS,
    env.WHATSAPP_TURN_SHARED_SECRET,
    nowSeconds,
  );
}
