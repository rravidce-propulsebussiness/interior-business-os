import { providerStart } from '../provider-start';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const audience =
    new URL(request.url).searchParams.get('audience') === 'client'
      ? 'client'
      : 'business';
  return providerStart(request, 'google', audience);
}
