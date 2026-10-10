import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createServerDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';
import { createRepository } from '@business-os/database/repository';
import { DomainError } from '@business-os/shared';
import { createAuthorization } from './service';

export async function serverServices() {
  if (!isSupabaseConfigured()) throw new DomainError('UNAUTHENTICATED');
  const client = await createServerDatabase();
  const repository = createRepository(client);
  return { client, repository, authorization: createAuthorization(repository) };
}
export async function pageServices() {
  if (!isSupabaseConfigured()) redirect('/login');
  const services = await serverServices();
  try {
    await services.authorization.requireAuthenticatedUser();
  } catch (error) {
    if (error instanceof DomainError && error.code === 'UNAUTHENTICATED')
      redirect('/login');
    throw error;
  }
  return services;
}
/**
 * The proxy strips caller-supplied scope headers and repopulates them from
 * the validated request URL. The database remains authoritative about both
 * membership and active custom hostname ownership.
 */
export async function workspaceScope() {
  if (process.env.BUSINESS_OS_TENANT_ROUTES_ENABLED !== 'true') return null;
  const request = await headers();
  const slug = request.get('x-business-os-workspace-slug');
  const host = request.get('x-business-os-workspace-host');
  if (slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80)
    return { kind: 'slug' as const, value: slug };
  if (host && /^[a-z0-9.-]{4,253}$/.test(host))
    return { kind: 'hostname' as const, value: host };
  return null;
}

export async function activeOrganization() {
  const { authorization, repository, client } = await serverServices();
  const scope = await workspaceScope();
  if (scope?.kind === 'slug') {
    // Organization reads are limited by RLS to the authenticated member.
    const { data, error } = await client
      .from('organizations')
      .select('id')
      .eq('slug', scope.value)
      .maybeSingle();
    if (error || !data) throw new DomainError('FORBIDDEN');
    return authorization.requireOrganizationMembership(data.id);
  }
  if (scope?.kind === 'hostname') {
    // A user-controlled Host cannot select a company unless a published,
    // verified and active domain claim maps to their active membership.
    const { data, error } = await client.rpc(
      'workspace_organization_for_hostname',
      { p_hostname: scope.value },
    );
    if (error || !data) throw new DomainError('FORBIDDEN');
    return authorization.requireOrganizationMembership(data);
  }
  const selected = (await cookies()).get('business-os-organization')?.value;
  if (selected) return authorization.requireOrganizationMembership(selected);
  const user = await authorization.requireAuthenticatedUser();
  const memberships = await repository.memberships();
  const first = memberships.find(
    (m) => m.user_id === user.id && m.status === 'active',
  );
  return first
    ? authorization.requireOrganizationMembership(first.organization_id)
    : null;
}
