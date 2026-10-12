import { providerStart } from '../provider-start';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return providerStart(request, 'propulse');
}
