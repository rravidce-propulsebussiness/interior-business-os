import { NextResponse } from 'next/server';
import { serverServices, activeOrganization } from '@business-os/auth/server';
import { DomainError, safeFailure } from '@business-os/shared';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { key } = await params;
    const { authorization, repository } = await serverServices();
    await authorization.requireAuthenticatedUser();
    const context = await activeOrganization();
    if (!context) throw new DomainError('FORBIDDEN');
    const definition = (await repository.modules()).find(
      (item) => item.key === key && item.status === 'active',
    );
    if (!definition) throw new DomainError('FORBIDDEN');
    await authorization.requirePermission(
      context.organizationId,
      definition.required_permission,
      { moduleKey: key },
    );
    await authorization.requireEntitlement(context.organizationId, key);
    return NextResponse.json(
      { key, enabled: true },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    const failure = safeFailure(error);
    return NextResponse.json(failure, {
      status:
        error instanceof DomainError && error.code === 'UNAUTHENTICATED'
          ? 401
          : error instanceof DomainError && error.code === 'FORBIDDEN'
            ? 403
            : 500,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
