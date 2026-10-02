import { createHmac, randomUUID } from 'node:crypto';

/** Server-only transport integrity; database authorization remains mandatory. */
export function attestQuotation(
  key: string,
  actor: string,
  organizationId: string,
  operation:
    'pricing_context' | 'commit' | 'finance_pricing' | 'finance_change',
  payload: Record<string, unknown>,
) {
  if (!/^[0-9a-f]{64}$/.test(key))
    throw new Error('Quotation signing key is not configured');
  const message = JSON.stringify({
    ...payload,
    operation,
    actor,
    organization_id: organizationId,
    nonce: randomUUID(),
    expires: Math.floor(Date.now() / 1000) + 90,
  });
  return {
    p_message: message,
    p_signature: createHmac('sha256', Buffer.from(key, 'hex'))
      .update(message, 'utf8')
      .digest('hex'),
  };
}
