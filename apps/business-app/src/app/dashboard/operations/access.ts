import { canAccess } from '@business-os/auth';
import { operationsModules } from '@business-os/core/operations';

type AccessContext = NonNullable<Parameters<typeof canAccess>[0]>;

export function canUseOperations(
  context: AccessContext | null,
  permission: string,
) {
  return (
    !!context &&
    canAccess(context, {
      organizationId: context.organizationId,
      permission,
      moduleKey: 'projects',
    }) &&
    operationsModules(permission).every((moduleKey) =>
      context.entitlements.includes(moduleKey),
    )
  );
}
