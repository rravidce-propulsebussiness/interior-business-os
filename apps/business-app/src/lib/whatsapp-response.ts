const UNREADABLE_REPLY =
  'The server could not complete this request. Try again in a moment.';

/**
 * Reads a WhatsApp API reply in the browser. Cloudflare replaces some gateway
 * errors with an HTML page, so a reply is not always JSON.
 */
export async function readApiResponse(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // Fall through to the plain message.
  }
  return { message: UNREADABLE_REPLY };
}
