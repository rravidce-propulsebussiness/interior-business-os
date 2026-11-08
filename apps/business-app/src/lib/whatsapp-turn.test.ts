import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  cloudflareTurnConfigured,
  sanitizeCloudflareIceServers,
  whatsappIceConfig,
  whatsappIceConfigFromEnvironment,
  whatsappRelayConfigured,
} from './whatsapp-turn';

const cloudflareEnv = {
  WHATSAPP_TURN_CLOUDFLARE_KEY_ID: '0123456789abcdef0123456789abcdef',
  WHATSAPP_TURN_CLOUDFLARE_API_TOKEN: 'cf-test-api-token-not-a-real-secret',
};

describe('Cloudflare TURN relay', () => {
  it('requests short-lived Cloudflare credentials and drops port 53', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        iceServers: [
          {
            urls: [
              'stun:stun.cloudflare.com:3478',
              'stun:stun.cloudflare.com:53',
            ],
          },
          {
            urls: [
              'turn:turn.cloudflare.com:3478?transport=udp',
              'turn:turn.cloudflare.com:53?transport=udp',
              'turns:turn.cloudflare.com:443?transport=tcp',
              'https://evil.example',
            ],
            username: 'short-lived-user',
            credential: 'short-lived-pass',
          },
        ],
      }),
    );
    const result = await whatsappIceConfigFromEnvironment(cloudflareEnv, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      nowSeconds: 2000000000,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'https://rtc.live.cloudflare.com/v1/turn/keys/0123456789abcdef0123456789abcdef/credentials/generate-ice-servers',
    );
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${cloudflareEnv.WHATSAPP_TURN_CLOUDFLARE_API_TOKEN}`,
    );
    expect(JSON.parse(String(init.body))).toEqual({ ttl: 3600 });
    expect(result).toEqual({
      relayConfigured: true,
      credentialExpiresAt: 2000003600,
      iceServers: [
        { urls: ['stun:stun.cloudflare.com:3478'] },
        {
          urls: [
            'turn:turn.cloudflare.com:3478?transport=udp',
            'turns:turn.cloudflare.com:443?transport=tcp',
          ],
          username: 'short-lived-user',
          credential: 'short-lived-pass',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(
      cloudflareEnv.WHATSAPP_TURN_CLOUDFLARE_API_TOKEN,
    );
  });

  it('accepts the older single-object Cloudflare response shape', () => {
    expect(
      sanitizeCloudflareIceServers({
        urls: ['turn:turn.cloudflare.com:3478?transport=udp'],
        username: 'u',
        credential: 'c',
      }),
    ).toEqual([
      {
        urls: ['turn:turn.cloudflare.com:3478?transport=udp'],
        username: 'u',
        credential: 'c',
      },
    ]);
  });

  it('falls back to STUN when Cloudflare is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await whatsappIceConfigFromEnvironment(cloudflareEnv, {
      fetchImpl: (async () =>
        new Response('down', { status: 503 })) as typeof fetch,
    });
    expect(result.relayConfigured).toBe(false);
    expect(result.iceServers).toEqual([
      { urls: 'stun:stun.l.google.com:19302' },
    ]);
    warn.mockRestore();
  });

  it('refuses a malformed key ID so it cannot alter the request path', async () => {
    const fetchImpl = vi.fn();
    const env = {
      ...cloudflareEnv,
      WHATSAPP_TURN_CLOUDFLARE_KEY_ID: '../../evil',
    };
    expect(cloudflareTurnConfigured(env)).toBe(false);
    await whatsappIceConfigFromEnvironment(env, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('treats Cloudflare or coturn as a configured relay for publishing', () => {
    expect(whatsappRelayConfigured(cloudflareEnv)).toBe(true);
    expect(whatsappRelayConfigured({})).toBe(false);
  });
});

describe('WhatsApp WebRTC ICE configuration', () => {
  it('never exposes a static or invalid relay credential', () => {
    const result = whatsappIceConfig(
      'turn:relay.example.com:3478',
      undefined,
      2000000000,
    );
    expect(result.relayConfigured).toBe(false);
    expect(result.iceServers).toEqual([
      { urls: 'stun:stun.l.google.com:19302' },
    ]);
    expect(result.credentialExpiresAt).toBeNull();
  });

  it('creates an expiring coturn credential from a shared secret', () => {
    const secret = 'test-only-turn-secret-of-adequate-length';
    const result = whatsappIceConfig(
      'turn:relay.example.com:3478?transport=udp, turns:relay.example.com:5349?transport=tcp',
      secret,
      2000000000,
    );
    expect(result.relayConfigured).toBe(true);
    expect(result.credentialExpiresAt).toBe(2000003600);
    const relay = result.iceServers[1];
    expect(relay?.username).toMatch(/^2000003600:[a-f0-9]{24}$/);
    expect(relay?.credential).toBe(
      createHmac('sha1', secret).update(relay!.username!).digest('base64'),
    );
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('rejects URL injection, embedded credentials and unrelated schemes', () => {
    const secret = 'test-only-turn-secret-of-adequate-length';
    const result = whatsappIceConfig(
      'https://evil.example, turn:example.com@evil.example, turn:turn.example.com:3478, turn:bad host:3478, turns:secure.example:5349',
      secret,
      2000000000,
    );
    expect(result.iceServers[1]?.urls).toEqual([
      'turn:turn.example.com:3478',
      'turns:secure.example:5349',
    ]);
  });
});
