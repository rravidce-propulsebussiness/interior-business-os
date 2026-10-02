import {
  financeEntitySchema,
  financePermissions,
} from '@business-os/core/finance';
import { safeFailure } from '@business-os/shared';
import { financeServices } from '../../../dashboard/finance/service';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  try {
    const entity = financeEntitySchema.parse((await params).entity),
      s = await financeServices(financePermissions[entity]),
      url = new URL(request.url);
    const data = await s.finance.search(
      entity,
      Object.fromEntries(
        [...url.searchParams.entries()].filter(
          ([key, value]) => key !== 'page' && value,
        ),
      ),
      Number(url.searchParams.get('page') ?? '1'),
    );
    return Response.json(data, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return Response.json(safeFailure(error), {
      status: 403,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
