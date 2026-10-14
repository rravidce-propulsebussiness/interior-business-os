import {
  createPublicDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';
import { z } from 'zod';
import { escapeHtml, publicHeaders } from '../../q/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
const projectionSchema = z.object({
  project: z.object({ name: z.string(), code: z.string() }),
  stages: z.array(z.object({
    title: z.string(), floor: z.string().nullable(), phase: z.string(),
    certified: z.boolean(),
  })),
  updates: z.array(z.object({
    date: z.string(), completed: z.string(), tomorrow: z.string(),
  })),
  as_of: z.string(),
});

function unavailable(): Response {
  return new Response(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project updates unavailable</title><main><h1>Project updates unavailable</h1><p>This secure link is invalid, expired or revoked. Ask your project manager for a current link.</p></main></html>',
    {
      status: 404,
      headers: { ...publicHeaders, 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}

const css = `
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;color:#102b40;background:#f5f8fc}
main{max-width:1060px;margin:0 auto;padding:32px 20px 68px}header{padding:24px 0}
header .eyebrow{font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#2563eb}
h1{font-size:clamp(27px,4vw,42px);line-height:1.2;margin:10px 0}h2{font-size:22px;margin:36px 0 16px}
small,.subtle{font-size:13px;color:#526478}.section{margin-top:32px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:14px}
article{border:1px solid #dfE7ef;border-radius:18px;background:white;padding:22px;box-shadow:0 8px 28px #103b6610}
article .floor{font-size:12px;font-weight:700;color:#52709a;text-transform:uppercase;letter-spacing:.08em}
article h3{font-size:17px;margin:6px 0 10px}article p{margin:8px 0}
.status{display:inline-block;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:800;background:#fff5d8;color:#875700}
.status.complete{background:#e0f8ee;color:#116142}
.updates{display:grid;gap:15px}.update{border-left:4px solid #2563eb}
.label{font-weight:800;color:#184f84;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.notice{border-radius:14px;border:1px solid #c5d6ed;padding:17px;background:#eef6ff;font-size:13px}
@media(max-width:640px){main{padding:20px 14px 55px}article{padding:17px}}
`;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  try {
    if (!isSupabaseConfigured()) return unavailable();
    const { token } = await params;
    const valid = tokenSchema.safeParse(token);
    if (!valid.success) return unavailable();
    const response = await createPublicDatabase().rpc('construction_client_view', {
      p_token: valid.data,
    });
    if (response.error || !response.data) return unavailable();
    const parsed = projectionSchema.safeParse(response.data);
    if (!parsed.success) return unavailable();
    const { project, stages, updates, as_of } = parsed.data;
    const esc = escapeHtml;
    const stageCards = stages.map((stage) => `
      <article>
        <p class="floor">${esc(stage.floor || 'Project-wide')} · ${esc(stage.phase)}</p>
        <h3>${esc(stage.title)}</h3>
        <span class="status${stage.certified ? ' complete' : ''}">${stage.certified ? 'Quality cleared' : 'Work / quality checks in progress'}</span>
      </article>
    `).join('');
    const updatesHtml = updates.map((update) => `
      <article class="update">
        <p class="floor">Site update · ${esc(update.date)}</p>
        <p class="label">Completed work</p><p>${esc(update.completed)}</p>
        <p class="label">Tomorrow's work</p><p>${esc(update.tomorrow)}</p>
      </article>
    `).join('');
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(project.name)} · Construction progress</title><style>${css}</style></head>
<body><main>
<header><p class="eyebrow">Construction project updates</p>
<h1>${esc(project.name)}</h1><p class="subtle">Project ${esc(project.code)} · Shared progress overview</p>
</header>
<p class="notice">This page contains only site updates expressly published by your project team.
A stage is shown as quality-cleared only while all required inspections, curing
and contractual prerequisites remain valid. This is not an invoice or a payment receipt.</p>
<section class="section"><h2>Construction stages</h2>
<div class="grid">${stageCards || '<p>No construction stages published yet.</p>'}</div></section>
<section class="section"><h2>Approved daily updates</h2>
<div class="updates">${updatesHtml || '<p>No daily updates have been published yet.</p>'}</div></section>
<footer><p class="subtle">Data last checked ${esc(as_of)}. For private drawings,
agreements, payments or changes, contact your project manager directly.</p></footer>
</main></body></html>`;
    return new Response(html, {
      headers: { ...publicHeaders, 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return unavailable();
  }
}
