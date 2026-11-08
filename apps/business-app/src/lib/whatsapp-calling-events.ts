export type CallEvent = {
  id: string;
  event: string;
  direction: string;
  from: string;
  to: string;
  session?: { sdp_type?: string; sdp?: string } | undefined;
  timestamp: number;
};

export function eventForConnection(
  payload: unknown,
  phoneNumberId: string,
  connectionId: string,
): CallEvent[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = payload as Record<string, unknown>;
  if (data.kind === 'outbound_call') {
    if (data.connection_id !== connectionId) return [];
    const id = String(data.call_id ?? '');
    return id
      ? [
          {
            id,
            event: 'dialing',
            direction: 'BUSINESS_INITIATED',
            from: '',
            to: String(data.to ?? ''),
            timestamp: Number(data.timestamp ?? 0),
          },
        ]
      : [];
  }
  const change = data.change as Record<string, unknown> | undefined;
  const value = change?.value as Record<string, unknown> | undefined;
  const metadata = value?.metadata as Record<string, unknown> | undefined;
  if (String(metadata?.phone_number_id ?? '') !== phoneNumberId) return [];
  if (!Array.isArray(value?.calls)) return [];
  return value.calls.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const call = item as Record<string, unknown>;
    const id = String(call.id ?? '');
    if (!id || id.length > 256) return [];
    const event = String(call.event ?? call.status ?? '').toLowerCase();
    const session = call.session as Record<string, unknown> | undefined;
    return [
      {
        id,
        event,
        direction: String(call.direction ?? ''),
        from: String(call.from ?? ''),
        to: String(call.to ?? ''),
        session:
          typeof session?.sdp === 'string' && session.sdp.length <= 150000
            ? { sdp_type: String(session.sdp_type ?? ''), sdp: session.sdp }
            : undefined,
        timestamp: Number(call.timestamp ?? 0),
      },
    ];
  });
}
