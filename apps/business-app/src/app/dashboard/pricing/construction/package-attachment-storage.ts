import 'server-only';

import { activeOrganization, serverServices } from '@business-os/auth/server';
import { createConstructionPackagesRepository } from '@business-os/database/construction-packages';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import { idSchema, DomainError } from '@business-os/shared';
import {
  QUOTATION_PDF_BUCKET,
  ensureQuotationPdfBucket,
  MAX_QUOTATION_PDF_BYTES,
} from '../../quotations/quotation-storage';

export {
  QUOTATION_PDF_BUCKET,
  ensureQuotationPdfBucket,
  MAX_QUOTATION_PDF_BYTES,
};

/** No public bucket URLs, arbitrary package IDs or service-role permissions
 * are exposed to clients. Every request is scoped to the signed-in tenant. */
export async function packageAttachmentContext(
  packageId: string,
  write = false,
) {
  const id = idSchema.parse(packageId);
  const active = await activeOrganization();
  if (!active) throw new DomainError('FORBIDDEN');
  const { authorization, client } = await serverServices();
  await authorization.requirePermission(active.organizationId, 'pricing.view', {
    moduleKey: 'pricing',
  });
  if (write)
    await authorization.requirePermission(
      active.organizationId,
      'pricing.manage',
      { moduleKey: 'pricing' },
    );
  const packageItem = (
    await createConstructionPackagesRepository(client).list(
      active.organizationId,
    )
  ).find((item) => item.id === id);
  if (!packageItem) throw new DomainError('FORBIDDEN');
  const user = await authorization.requireAuthenticatedUser();
  return {
    orgId: active.organizationId,
    packageId: id,
    client,
    // Only uploads/downloads require the service credential. A normal
    // company package preview must work without elevated storage access.
    get admin() {
      return createOwnerProvisioningDatabase();
    },
    userId: user.id,
    packageItem,
  };
}
