import { MetaApiError } from './whatsapp-meta-error';

/**
 * Only a definite Graph rejection is retryable. A timeout, provider 5xx, or
 * missing code might have been accepted, so the recipient stays in-flight.
 */
export function broadcastSendErrorKind(error: unknown):
  'billing' | 'rejected' | 'uncertain' {
  if (!(error instanceof MetaApiError) || error.httpStatus >= 500 ||
      error.code === null)
    return 'uncertain';
  return error.code === 131042 ? 'billing' : 'rejected';
}

export function isActiveBroadcast(status: string): boolean {
  return status === 'verifying' || status === 'sending';
}

/** Never resend an accepted or unresolved in-flight message. */
export function canRetryBroadcastRecipient(recipient: {
  status: string;
  retry_count: number;
}): boolean {
  return recipient.status === 'failed' && recipient.retry_count < 3;
}
