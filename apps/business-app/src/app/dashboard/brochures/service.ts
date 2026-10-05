import 'server-only';
import { createHash, createHmac } from 'node:crypto';
import {
  activeOrganization,
  pageServices,
  serverServices,
} from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import {
  createBrochureRepository,
  brochureResult,
  jsonObject,
} from '@business-os/database/brochure';
import { DomainError } from '@business-os/shared';
import {
  assetReferences,
  resolveSnapshot,
  type BrochureDocument,
} from '@business-os/brochure-builder';
import {
  brochureHtml,
  imageWarnings,
} from '@business-os/brochure-builder/render';
import { renderPdf } from '@business-os/shared/pdf';
export async function brochureServices(
  permission = 'brochure.view',
  page = false,
) {
  const s = await (page ? pageServices() : serverServices());
  const context = await activeOrganization();
  if (!context) throw new DomainError('FORBIDDEN');
  await s.authorization.requirePermission(context.organizationId, permission, {
    moduleKey: 'brochure',
  });
  return {
    ...s,
    context,
    brochure: createBrochureRepository(s.client, context.organizationId),
    allowed: (permission: string) =>
      canAccess(context, {
        organizationId: context.organizationId,
        permission,
        moduleKey: 'brochure',
      }),
  };
}
export function signBrochure(payload: Record<string, unknown>) {
  const secret =
    process.env.BROCHURE_BUILD_SIGNING_KEY ??
    process.env.WEBSITE_BUILD_SIGNING_KEY;
  if (!secret || Buffer.byteLength(secret) < 32)
    throw new Error('Brochure signing is not configured');
  const body = JSON.stringify({
    ...payload,
    keyId:
      process.env.BROCHURE_BUILD_KEY_ID ??
      process.env.WEBSITE_BUILD_KEY_ID ??
      'primary',
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  });
  return {
    body,
    signature: createHmac('sha256', secret).update(body).digest('hex'),
  };
}
export const digest = (data: Buffer) =>
  createHash('sha256').update(data).digest('hex');
export async function prepareBrochure(
  s: Awaited<ReturnType<typeof brochureServices>>,
  input: BrochureDocument,
  watermark = '',
) {
  const context = await s.brochure.list();
  const document = resolveSnapshot(
    input,
    context.kit,
    String(context.business.name),
  );
  const assets = new Map<string, string>();
  const sizes: { id: string; width: number | null; height: number | null }[] =
    [];
  let total = 0;
  for (const id of assetReferences(document)) {
    const a = await s.brochure.asset(id);
    const bytes = Buffer.from(String(a.data), 'base64');
    total += bytes.length;
    if (total > 50000000)
      throw new Error('Print images exceed the 50 MB document limit');
    assets.set(id, `data:image/webp;base64,${bytes.toString('base64')}`);
    sizes.push({
      id,
      width: Number(a.width) || null,
      height: Number(a.height) || null,
    });
  }
  const businessName = String(context.business.name);
  const html = brochureHtml(document, {
    assetUrl: (id) => assets.get(id) ?? '',
    print: true,
    watermark,
    businessName,
  });
  const pdf = await renderPdf(html, {
    brochure: true,
    title: document.title,
    author: businessName,
    subject: document.description,
  });
  return {
    document,
    businessName,
    html,
    pdf,
    warnings: imageWarnings(document, sizes),
  };
}
export async function publishedPdf(
  s: Awaited<ReturnType<typeof brochureServices>>,
  id: string,
  versionId: string,
) {
  return jsonObject(
    brochureResult(
      await s.client.rpc('brochure_pdf_read', {
        p_organization_id: s.context.organizationId,
        p_brochure_id: id,
        p_version_id: versionId,
      }),
    ),
  );
}
