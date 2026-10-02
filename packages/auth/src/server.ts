import 'server-only';
import { cookies } from 'next/headers';
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
export async function activeOrganization() {
  const { authorization, repository } = await serverServices();
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
