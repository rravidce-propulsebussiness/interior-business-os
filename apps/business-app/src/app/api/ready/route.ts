import { createReadiness } from '@business-os/shared/health';
export const dynamic = 'force-dynamic';
export const GET = createReadiness(process.env);
