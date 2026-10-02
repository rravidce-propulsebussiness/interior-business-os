import { calculatePreview } from '../../../dashboard/catalog/service';
import { DomainError, safeFailure } from '@business-os/shared';
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 32768) throw new DomainError('VALIDATION_FAILED');
    const result = await calculatePreview(JSON.parse(text));
    return Response.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const failure = safeFailure(error),
      status =
        error instanceof DomainError
          ? error.code === 'UNAUTHENTICATED'
            ? 401
            : error.code === 'FORBIDDEN'
              ? 403
              : 400
          : 400;
    return Response.json(failure, {
      status,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
