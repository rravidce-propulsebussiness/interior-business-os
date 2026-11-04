import { createCipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const inputSchema = z
  .object({
    code: z.string().min(8).max(4096),
    wabaId: z.string().regex(/^[0-9]{5,32}$/),
    phoneNumberId: z.string().regex(/^[0-9]{5,32}$/),
  })
  .strict();

function encryptToken(token: string) {
  const keyHex = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY ?? '';
  if (!/^[a-fA-F0-9]{64}$/.test(keyHex))
    throw new Error('TOKEN_KEY_UNAVAILABLE');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

function graphVersion() {
  const version = process.env.META_GRAPH_API_VERSION ?? '';
  if (!/^v\d+\.0$/.test(version)) throw new Error('META_API_UNAVAILABLE');
  return version;
}

async function graph<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion()}/${path}`,
    {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    },
  );
  const data = (await response.json().catch(() => null)) as
    | T
    | { error?: unknown }
    | null;
  if (!response.ok || !data) throw new Error('META_API_FAILED');
  return data as T;
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin)
      return Response.json(
        { message: 'Request origin was not accepted.' },
        { status: 403, headers },
      );
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 8192)
      return Response.json(
        { message: 'Request is too large.' },
        { status: 413, headers },
      );
    const raw = await request.text();
    if (raw.length > 8192)
      return Response.json(
        { message: 'Request is too large.' },
        { status: 413, headers },
      );

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return Response.json(
        { message: 'Invalid request.' },
        { status: 400, headers },
      );
    }
    const parsed = inputSchema.safeParse(json);
    if (!parsed.success)
      return Response.json(
        { message: 'Invalid WhatsApp signup response.' },
        { status: 400, headers },
      );

    const context = await activeOrganization();
    if (!context)
      return Response.json(
        { message: 'Choose a company workspace first.' },
        { status: 403, headers },
      );
    const { authorization, client } = await serverServices();
    await authorization.requirePermission(
      context.organizationId,
      'automation.manage',
    );

    const appId = process.env.META_APP_ID ?? '';
    const appSecret = process.env.META_APP_SECRET ?? '';
    if (
      !appId ||
      !appSecret ||
      !process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY
    )
      return Response.json(
        { message: 'WhatsApp connection is not fully configured on the server.' },
        { status: 503, headers },
      );

    const form = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      code: parsed.data.code,
    });
    const tokenResponse = await fetch(
      `https://graph.facebook.com/${graphVersion()}/oauth/access_token`,
      {
        method: 'POST',
        body: form,
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
      },
    );
    const tokenBody = (await tokenResponse.json().catch(() => null)) as
      | { access_token?: string }
      | null;
    if (!tokenResponse.ok || !tokenBody?.access_token)
      return Response.json(
        {
          message:
            'Meta could not exchange the signup code. Check app review, app roles, and the embedded signup configuration.',
        },
        { status: 502, headers },
      );

    const token = tokenBody.access_token;
    const waba = await graph<{ id: string; name?: string }>(
      `${parsed.data.wabaId}?fields=id,name`,
      token,
    );
    if (waba.id !== parsed.data.wabaId)
      throw new Error('META_ASSET_MISMATCH');

    const numbers = await graph<{
      data?: Array<{
        id: string;
        display_phone_number?: string;
        verified_name?: string;
      }>;
    }>(
      `${parsed.data.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100`,
      token,
    );
    const phone = numbers.data?.find(
      (item) => item.id === parsed.data.phoneNumberId,
    );
    if (!phone) throw new Error('META_PHONE_NOT_IN_WABA');

    await graph<{ success?: boolean }>(
      `${parsed.data.wabaId}/subscribed_apps`,
      token,
      { method: 'POST' },
    );
    const encrypted = encryptToken(token);
    const saved = await client.rpc('whatsapp_connection_save', {
      p_organization_id: context.organizationId,
      p_waba_id: waba.id,
      p_business_name: waba.name ?? '',
      p_phone_number_id: phone.id,
      p_display_phone_number: phone.display_phone_number ?? '',
      p_verified_name: phone.verified_name ?? '',
      p_token_ciphertext: encrypted.ciphertext,
      p_token_iv: encrypted.iv,
      p_token_tag: encrypted.tag,
    });
    if (saved.error || !saved.data)
      throw new Error('CONNECTION_SAVE_FAILED');
    return Response.json({ connected: true }, { status: 200, headers });
  } catch (error) {
    if (error instanceof DomainError && error.code === 'UNAUTHENTICATED')
      return Response.json(
        { message: 'Sign in to your workspace and try again.' },
        { status: 401, headers },
      );
    if (error instanceof DomainError && error.code === 'FORBIDDEN')
      return Response.json(
        {
          message:
            'You do not have permission to connect WhatsApp for this workspace.',
        },
        { status: 403, headers },
      );
    // Graph errors may contain account and request details. Do not return or log them.
    return Response.json(
      {
        message:
          'WhatsApp could not be connected. Verify the Meta app configuration and try again.',
      },
      { status: 502, headers },
    );
  }
}
