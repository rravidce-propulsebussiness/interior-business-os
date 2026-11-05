import 'server-only';

import { createDecipheriv } from 'node:crypto';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import { DomainError } from '@business-os/shared';

export const privateHeaders = {
  'Cache-Control': 'private, no-store',
};

export async function whatsappContext(permission = 'automation.manage') {
  const context = await activeOrganization();
  if (!context) throw new DomainError('FORBIDDEN');
  const { authorization, client } = await serverServices();
  await authorization.requirePermission(context.organizationId, permission);
  return { organizationId: context.organizationId, client };
}

export async function getConnection(organizationId: string, id?: string) {
  const database = createOwnerProvisioningDatabase();
  let query = database
    .from('whatsapp_business_connections')
    .select(
      'id,organization_id,waba_id,phone_number_id,token_ciphertext,token_iv,token_tag,status',
    )
    .eq('organization_id', organizationId)
    .eq('status', 'connected');
  if (id) query = query.eq('id', id);
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new DomainError('NOT_FOUND');

  const keyHex = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY ?? '';
  if (!/^[a-fA-F0-9]{64}$/.test(keyHex))
    throw new Error('WHATSAPP_TOKEN_KEY_UNAVAILABLE');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(keyHex, 'hex'),
    Buffer.from(data.token_iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(data.token_tag, 'base64'));
  const accessToken = Buffer.concat([
    decipher.update(Buffer.from(data.token_ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return { ...data, accessToken };
}

export async function graphRequest<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const version = process.env.META_GRAPH_API_VERSION ?? '';
  if (!/^v\d+\.0$/.test(version)) throw new Error('META_API_UNAVAILABLE');
  const response = await fetch(
    `https://graph.facebook.com/${version}/${path}`,
    {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    },
  );
  const result = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !result) throw new Error('META_API_FAILED');
  return result;
}

export { validSameOrigin } from './whatsapp-origin';
