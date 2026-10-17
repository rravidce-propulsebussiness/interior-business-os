import { activeOrganization, pageServices } from '@business-os/auth/server';
import { createLabourDisbursementsRepository } from '@business-os/database/labour-disbursements';
import { labourDisbursementsCsv } from '../labour-csv';
import { safeFailure } from '@business-os/shared';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const secureHeaders={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
};

function validDate(value:string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0,10)===value;
}
export async function GET(request:Request) {
  const params=new URL(request.url).searchParams;
  const from=params.get('from')??'';
  const to=params.get('to')??'';
  if(!validDate(from)||!validDate(to)||from>to||
    Date.parse(to)-Date.parse(from)>366*86400000) {
    return new Response('Select a valid labour work date range under one year.',{
      status:400,headers:secureHeaders,
    });
  }
  try {
    const ctx=await activeOrganization();
    if(!ctx)return new Response('Select a company workspace.',{status:403,headers:secureHeaders});
    const {authorization,client}=await pageServices();
    await authorization.requirePermission(ctx.organizationId,'payment.view');
    const rows=await createLabourDisbursementsRepository(client)
      .list(ctx.organizationId,from,to);
    return new Response(labourDisbursementsCsv(rows),{
      headers:{
        ...secureHeaders,
        'Content-Type':'text/csv; charset=utf-8',
        'Content-Disposition':'attachment; filename="labour-payments-'+from+'-to-'+to+'.csv"',
      },
    });
  } catch(error) {
    return new Response(safeFailure(error).message,{status:403,headers:secureHeaders});
  }
}
