import { createHmac } from 'node:crypto';
import { expect, it } from 'vitest';
import { attestQuotation } from './quotation-attestation';
it('binds reserved identity and operation fields and signs exact UTF-8 bytes', () => {
  const key = '00'.repeat(32),
    proof = attestQuotation(key, 'trusted-actor', 'trusted-org', 'commit', {
      actor: 'spoof',
      organization_id: 'spoof',
      operation: 'spoof',
      expires: 1,
      nonce: 'spoof',
      description: 'Quotation — wardrobe',
    }),
    message = JSON.parse(proof.p_message);
  expect(message.actor).toBe('trusted-actor');
  expect(message.organization_id).toBe('trusted-org');
  expect(message.operation).toBe('commit');
  expect(message.expires).toBeGreaterThan(Date.now() / 1000);
  expect(message.nonce).not.toBe('spoof');
  expect(proof.p_signature).toBe(
    createHmac('sha256', Buffer.from(key, 'hex'))
      .update(proof.p_message, 'utf8')
      .digest('hex'),
  );
});
it('fails closed without a valid key and generates unique replay nonces', () => {
  expect(() => attestQuotation('', 'actor', 'org', 'commit', {})).toThrow(
    'not configured',
  );
  const first = attestQuotation('00'.repeat(32), 'actor', 'org', 'commit', {}),
    second = attestQuotation('00'.repeat(32), 'actor', 'org', 'commit', {});
  expect(JSON.parse(first.p_message).nonce).not.toBe(
    JSON.parse(second.p_message).nonce,
  );
});
