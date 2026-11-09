import { describe, expect, it } from 'vitest';
import { MetaApiError } from './whatsapp-meta-error';
import {
  broadcastSendErrorKind,
  canRetryBroadcastRecipient,
  isActiveBroadcast,
} from './whatsapp-broadcast-policy';

describe('WhatsApp billing-aware broadcast policy', () => {
  it('stops immediately on payment eligibility error 131042', () => {
    expect(
      broadcastSendErrorKind(new MetaApiError(400, 131042, null, null)),
    ).toBe('billing');
  });

  it('does not classify known template errors as billing errors', () => {
    expect(
      broadcastSendErrorKind(new MetaApiError(400, 132001, null, null)),
    ).toBe('rejected');
  });

  it('does not retry ambiguous failures that Meta could have accepted', () => {
    expect(broadcastSendErrorKind(new Error('network timeout'))).toBe(
      'uncertain',
    );
    expect(
      broadcastSendErrorKind(new MetaApiError(503, 131042, null, null)),
    ).toBe('uncertain');
    expect(
      broadcastSendErrorKind(new MetaApiError(400, null, null, null)),
    ).toBe('uncertain');
  });

  it('disables sending for both billing-paused and cancelled campaigns', () => {
    expect(isActiveBroadcast('verifying')).toBe(true);
    expect(isActiveBroadcast('sending')).toBe(true);
    expect(isActiveBroadcast('paused_billing')).toBe(false);
    expect(isActiveBroadcast('paused_error')).toBe(false);
    expect(isActiveBroadcast('completed')).toBe(false);
    expect(isActiveBroadcast('cancelled')).toBe(false);
  });

  it('retries only confirmed failed recipients within the retry budget', () => {
    expect(
      canRetryBroadcastRecipient({ status: 'failed', retry_count: 0 }),
    ).toBe(true);
    expect(
      canRetryBroadcastRecipient({ status: 'failed', retry_count: 2 }),
    ).toBe(true);
    expect(
      canRetryBroadcastRecipient({ status: 'failed', retry_count: 3 }),
    ).toBe(false);
    expect(canRetryBroadcastRecipient({ status: 'sent', retry_count: 0 })).toBe(
      false,
    );
    expect(
      canRetryBroadcastRecipient({ status: 'sending', retry_count: 0 }),
    ).toBe(false);
  });
});
