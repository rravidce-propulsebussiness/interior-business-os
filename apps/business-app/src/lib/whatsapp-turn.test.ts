import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { whatsappIceConfig } from './whatsapp-turn';

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
