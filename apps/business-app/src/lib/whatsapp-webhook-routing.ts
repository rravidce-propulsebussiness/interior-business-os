export type WebhookConnection = {
  id: string;
  organization_id: string;
  phone_number_id: string;
};

export type WebhookRoute =
  | { kind: 'number'; connection: WebhookConnection }
  | { kind: 'account'; organizationIds: string[] }
  | { kind: 'ignore' };

/**
 * Decides who owns one webhook change. `connections` must hold only connected
 * rows. A change naming a number goes to that number alone, and a number we
 * do not hold is ignored. A change with no number is account-level: it is kept
 * for each company on that WhatsApp account and never enters an inbox.
 */
export function routeWebhookChange(
  connections: WebhookConnection[],
  change: unknown,
): WebhookRoute {
  if (connections.length === 0) return { kind: 'ignore' };
  const value = (change as { value?: { metadata?: { phone_number_id?: unknown } } } | null)
    ?.value;
  const phoneNumberId = value?.metadata?.phone_number_id;
  if (phoneNumberId === undefined || phoneNumberId === null || phoneNumberId === '')
    return {
      kind: 'account',
      organizationIds: [...new Set(connections.map((c) => c.organization_id))],
    };
  const connection = connections.find(
    (c) => c.phone_number_id === String(phoneNumberId),
  );
  return connection ? { kind: 'number', connection } : { kind: 'ignore' };
}
