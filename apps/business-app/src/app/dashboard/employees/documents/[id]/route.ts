import { activeOrganization, serverServices } from '@business-os/auth/server';
import { idSchema } from '@business-os/shared';
import { employeeRepository } from '../../service';
import { downloadEmployeeProof } from '../../proof-storage';

export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const org = await activeOrganization();
    if (!org) return new Response('Not found', { status: 404 });
    const { client, authorization } = await serverServices();
    await authorization.requirePermission(org.organizationId, 'team.manage');
    const document = await employeeRepository(client).proof(
      org.organizationId,
      idSchema.parse(id),
    );
    if (!document) return new Response('Not found', { status: 404 });
    const raw = await downloadEmployeeProof(document.storageKey);
    const bytes = await raw.arrayBuffer();
    // User-controlled filenames are not sent as headers; bytes remain tenant-protected.
    return new Response(bytes, {
      headers: {
        'Content-Type': document.mimeType,
        'Content-Disposition':
          'attachment; filename="employee-proof.' +
          (document.mimeType === 'application/pdf'
            ? 'pdf'
            : document.mimeType === 'image/png'
              ? 'png'
              : document.mimeType === 'image/webp'
                ? 'webp'
                : 'jpg') +
          '"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Document unavailable', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
