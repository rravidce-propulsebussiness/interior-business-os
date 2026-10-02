import {
  executionEntitySchema,
  executionPermissions,
  executionFilterSchema,
} from '@business-os/core/execution';
import { executionServices } from '../../../dashboard/execution/service';
import { safeFailure } from '@business-os/shared';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  try {
    const entity = executionEntitySchema.parse((await params).entity),
      s = await executionServices(executionPermissions[entity]),
      url = new URL(request.url);
    const filter = executionFilterSchema.parse(
        Object.fromEntries(
          [...url.searchParams].filter(([key]) => key !== 'page'),
        ),
      ),
      page = Number(url.searchParams.get('page') ?? 1);
    return Response.json(await s.execution.search(entity, filter, page), {
      headers,
    });
  } catch (error) {
    return Response.json(safeFailure(error), { status: 403, headers });
  }
}
