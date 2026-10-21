import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { createServerDatabase } from '@business-os/database/server';
import { ClientDashboard } from '../../client-dashboard';

export const dynamic = 'force-dynamic';

const report = z.object({
  report_date: z.string(),
  completed_work: z.string(),
  tomorrow_plan: z.string(),
  worker_count: z.number().nullable(),
  tomorrow_workers: z.number().nullable().optional(),
  created_at: z.string(),
});
const projectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  company_name: z.string(),
  stage: z.string(),
  client_approved_at: z.string().nullable().optional(),
  reports: z.array(report).default([]),
  drawings: z
    .array(
      z.object({
        kind: z.string(),
        revision: z.number(),
        reference: z.string(),
        status: z.string(),
        created_at: z.string(),
      }),
    )
    .default([]),
  photos: z
    .array(
      z.object({
        id: z.uuid(),
        filename: z.string(),
        category: z.string(),
        mime: z.string(),
        caption: z.string(),
        created_at: z.string(),
      }),
    )
    .default([]),
});
const timelineSchema = z.array(
  z.object({
    id: z.uuid(),
    title: z.string(),
    description: z.string(),
    phase: z.string(),
    floor_code: z.string().nullable(),
    status: z.string(),
    completed_at: z.string().nullable(),
    activities: z.array(z.string()),
  }),
);
const stageRequestSchema=z.array(z.object({
 id:z.uuid(),number:z.string(),label:z.string(),total:z.number(),
 date:z.string(),dueDate:z.string().nullable(),
 paymentStatus:z.literal('payment_requested'),contractNumber:z.string(),
}));
const invoicesSchema=z.array(z.object({
 id:z.uuid(),number:z.string(),documentType:z.string(),
 date:z.string(),dueDate:z.string().nullable(),
 total:z.number(),paymentStatus:z.literal('payment_requested'),
}));
const requestsSchema=z.array(z.object({
 id:z.uuid(),kind:z.string(),details:z.string(),status:z.string(),
 requested_date:z.string().nullable(),response:z.string(),created_at:z.string(),
 responded_at:z.string().nullable(),
}));
const dashboardSchema = z.object({
  materials: z
    .array(
      z.object({
        description: z.string(),
        unit: z.string().nullable(),
        ordered_quantity: z.string().nullable(),
        po_number: z.string().nullable(),
        expected_date: z.string().nullable(),
        status: z.string(),
        received_date: z.string().nullable(),
        sort_time: z.string().nullable(),
      }),
    )
    .default([]),
  checks: z
    .array(
      z.object({
        name: z.string(),
        status: z.string(),
        due_date: z.string().nullable(),
        completed_at: z.string().nullable(),
        sort_time: z.string(),
        source: z.string(),
      }),
    )
    .default([]),
  latest_report: report
    .extend({
      checks_done: z.string().nullable().optional(),
      checks_required: z.string().nullable().optional(),
    })
    .nullable(),
  updates: z
    .array(
      z.object({
        category: z.string(),
        summary: z.string(),
        created_at: z.string(),
      }),
    )
    .default([]),
  local_date: z.string(),
});

export default async function ClientProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const db = await createServerDatabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect('/client/login?project=' + id);

  // Every client-facing RPC independently checks the same verified email,
  // exact project ID, active invitation and customer/project relationship.
  const rpc = db.rpc.bind(db) as unknown as (
    name: string,
    args: Record<string, string>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const [projectResult, timelineResult, dashboardResult, requestsResult, invoicesResult, stageRequestsResult] = await Promise.all([
    rpc('client_portal_project', { p_project_id: id }),
    rpc('client_portal_timeline', { p_project_id: id }),
    rpc('client_portal_dashboard', { p_project_id: id }),
    rpc('project_client_request_list', { p_project_id: id }),
    rpc('client_portal_invoices', { p_project_id: id }),
    rpc('client_portal_stage_payment_requests', { p_project_id: id }),
  ]);
  const project = projectSchema.safeParse(projectResult.data);
  if (projectResult.error || !project.success) notFound();

  const parsedTimeline = timelineSchema.safeParse(timelineResult.data);
  const parsedDashboard = dashboardSchema.safeParse(dashboardResult.data);
  const parsedRequests=requestsSchema.safeParse(requestsResult.data);
  const latest = parsedDashboard.success ? parsedDashboard.data : null;
  const invoices=invoicesSchema.safeParse(invoicesResult.data);
  const stageRequests=stageRequestSchema.safeParse(stageRequestsResult.data);

  return (
    <ClientDashboard
      project={project.data}
      timeline={
        parsedTimeline.success && !timelineResult.error
          ? parsedTimeline.data
          : []
      }
      timelineUnavailable={Boolean(
        timelineResult.error || !parsedTimeline.success,
      )}
      metrics={
        latest && !dashboardResult.error
          ? latest
          : {
              materials: [],
              checks: [],
              updates: [],
              latest_report: null,
              local_date: '1970-01-01',
            }
      }
      metricsUnavailable={Boolean(
        dashboardResult.error || !parsedDashboard.success,
      )}
      requests={parsedRequests.success&&!requestsResult.error?parsedRequests.data:[]}
      invoices={invoices.success&&!invoicesResult.error?invoices.data:[]}
      paymentRequests={stageRequests.success&&!stageRequestsResult.error?stageRequests.data:[]}
      clientEmail={auth.user.email ?? ''}
    />
  );
}
