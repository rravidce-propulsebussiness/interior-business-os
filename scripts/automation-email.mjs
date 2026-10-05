/** One idempotent transport. Provider credentials never enter application bundles. */
export async function deliverEmail(delivery, configuration, request = fetch) {
  const { apiKey, from } = configuration;
  if (!apiKey || !from) return { result: 'unconfigured' };
  if (!/^[^\r\n]+@[^\r\n]+$/.test(from)) return { result: 'permanent' };
  try {
    const response = await request('https://api.resend.com/emails', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': delivery.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [delivery.recipient],
        subject: delivery.subject,
        text: delivery.text,
      }),
    });
    if (response.ok) {
      const data = await response.json();
      return typeof data.id === 'string' && data.id.length <= 200
        ? { result: 'sent', providerId: data.id }
        : { result: 'transient' };
    }
    // 409 can mean a concurrent identical request; retry the same immutable key/body.
    return {
      result:
        response.status === 429 ||
        response.status === 409 ||
        response.status >= 500
          ? 'transient'
          : 'permanent',
    };
  } catch {
    // Network ambiguity is retried only inside the DB-enforced 23-hour window.
    return { result: 'transient' };
  }
}
