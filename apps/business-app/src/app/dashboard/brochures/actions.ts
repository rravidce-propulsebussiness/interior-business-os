'use server';
import { revalidatePath } from 'next/cache';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  emptyBrochure,
  validateDocument,
  kitSchema,
} from '@business-os/brochure-builder';
import { starterBrochure } from '@business-os/brochure-builder/templates';
import {
  brochureJson,
  brochureResult,
  jsonObject,
} from '@business-os/database/brochure';
import { prepareMarketingImage } from '@business-os/shared/media';
import {
  brochureServices,
  signBrochure,
  prepareBrochure,
  publishedPdf,
  digest,
} from './service';
function failure(e: unknown) {
  return {
    ok: false as const,
    message:
      e instanceof Error && e.message.startsWith('Print preflight:')
        ? e.message
        : 'Unable to complete this operation. Check access, limits and content, then reload if the draft changed.',
  };
}
export async function createBrochure(
  name: string,
  slug: string,
  template: string,
  copyId?: string,
) {
  try {
    const s = await brochureServices('brochure.manage');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80)
      throw new Error('Invalid slug');
    let imageId: string | undefined;
    if (template && s.allowed('brochure.media.manage')) {
      const file = await readFile(
        resolve(
          process.cwd(),
          '../../packages/industry-interior/assets/living-room-concept.webp',
        ),
      );
      const image = await prepareMarketingImage(file, true);
      const proof = signBrochure({
        purpose: 'brochure.asset',
        organizationId: s.context.organizationId,
        ...image,
        data: undefined,
        name: 'Interior concept - replace with approved project photo',
        alt: 'AI-generated interior concept, not a completed customer project',
        digest: digest(image.data),
      });
      const r = jsonObject(
        brochureResult(
          await s.client.rpc('brochure_media', {
            p_organization_id: s.context.organizationId,
            p_action: 'upload',
            p_proof: proof.body,
            p_signature: proof.signature,
            p_data: image.data.toString('base64'),
          }),
        ),
      );
      imageId = String(r.id);
    }
    let document = copyId
      ? (await s.brochure.read(copyId)).document
      : template
        ? starterBrochure(template, name, imageId)
        : emptyBrochure(name);
    document = validateDocument({
      ...document,
      title: name,
      settings: { ...document.settings, sharing: false },
    });
    const proof = signBrochure({
      purpose: 'brochure.save',
      organizationId: s.context.organizationId,
      brochureId: null,
      version: 0,
      slug,
      template,
      document,
    });
    const result = await s.brochure.save(null, 0, proof.body, proof.signature);
    revalidatePath('/dashboard/brochures');
    return {
      ok: true as const,
      id: String(result.id),
      message: 'Brochure created',
    };
  } catch (e) {
    return failure(e);
  }
}
export async function saveBrochure(
  id: string,
  version: number,
  input: unknown,
) {
  try {
    const s = await brochureServices('brochure.manage');
    const document = validateDocument(input);
    const proof = signBrochure({
      purpose: 'brochure.save',
      organizationId: s.context.organizationId,
      brochureId: id,
      version,
      document,
    });
    const r = await s.brochure.save(id, version, proof.body, proof.signature);
    revalidatePath(`/dashboard/brochures/${id}`);
    return {
      ok: true as const,
      version: Number(r.version),
      message: 'Draft saved. Published content is unchanged.',
    };
  } catch (e) {
    return failure(e);
  }
}
export async function publishBrochure(
  id: string,
  version: number,
  summary: string,
  restoreId?: string,
) {
  try {
    const s = await brochureServices('brochure.publish');
    await s.authorization.requirePermission(
      s.context.organizationId,
      'brochure.export',
      { moduleKey: 'brochure' },
    );
    const current = await s.brochure.read(id);
    if (current.version !== version) throw new Error('Stale version');
    const draftDigest = brochureResult(
      await s.client.rpc('brochure_document_digest', {
        p_organization_id: s.context.organizationId,
        p_brochure_id: id,
      }),
    );
    const selected = restoreId ? await s.brochure.read(id, restoreId) : current;
    const prepared = restoreId
      ? null
      : await prepareBrochure(s, current.document);
    const old = restoreId ? await publishedPdf(s, id, restoreId) : null;
    const pdf = prepared?.pdf ?? Buffer.from(String(old?.data), 'base64');
    const proof = signBrochure({
      purpose: 'brochure.publish',
      organizationId: s.context.organizationId,
      brochureId: id,
      version,
      restoreId: restoreId ?? null,
      draftDigest,
      document: prepared?.document ?? selected.document,
      businessName: prepared?.businessName ?? selected.businessName,
      pdfDigest: digest(pdf),
    });
    brochureResult(
      await s.client.rpc('brochure_publish', {
        p_organization_id: s.context.organizationId,
        p_brochure_id: id,
        p_version: version,
        p_proof: proof.body,
        p_signature: proof.signature,
        p_pdf: restoreId ? '' : pdf.toString('base64'),
        p_summary: summary.slice(0, 500),
        ...(restoreId ? { p_restore_id: restoreId } : {}),
      }),
    );
    revalidatePath(`/dashboard/brochures/${id}`);
    return {
      ok: true as const,
      version: version + 1,
      message: restoreId
        ? 'Restored as a new published version.'
        : `Published successfully.${prepared?.warnings.length ? ' ' + prepared.warnings.join(' ') : ''}`,
    };
  } catch (e) {
    return failure(e);
  }
}
export async function changeBrochureStatus(
  id: string,
  version: number,
  status: string,
) {
  try {
    const s = await brochureServices(
      status === 'unpublished' ? 'brochure.publish' : 'brochure.manage',
    );
    const r = await s.client.rpc('brochure_status', {
      p_organization_id: s.context.organizationId,
      p_brochure_id: id,
      p_version: version,
      p_status: status,
    });
    if (r.error) throw r.error;
    revalidatePath('/dashboard/brochures');
    return { ok: true as const, message: 'Status updated' };
  } catch (e) {
    return failure(e);
  }
}
export async function saveMarketingKit(version: number, input: unknown) {
  try {
    const s = await brochureServices('brochure.brand.manage');
    const kit = kitSchema.parse(input);
    const proof = signBrochure({
      purpose: 'brochure.kit',
      organizationId: s.context.organizationId,
      version,
      kit,
    });
    const next = brochureResult(
      await s.client.rpc('brochure_kit_save', {
        p_organization_id: s.context.organizationId,
        p_version: version,
        p_proof: proof.body,
        p_signature: proof.signature,
      }),
    );
    revalidatePath('/dashboard/brochures');
    return {
      ok: true as const,
      version: next,
      message:
        'Brand kit saved. Published brochures retain their original content.',
    };
  } catch (e) {
    return failure(e);
  }
}
export async function brochureSources(kind: string, query: string, page = 1) {
  const s = await brochureServices('brochure.brand.manage');
  const r = brochureResult(
    await s.client.rpc('brochure_sources', {
      p_organization_id: s.context.organizationId,
      p_kind: kind,
      p_query: query,
      p_page: page,
    }),
  );
  return Array.isArray(r) ? r.map(jsonObject) : [];
}
export async function brochureAssetPage(page: number) {
  const s = await brochureServices('brochure.media.manage');
  return (await s.brochure.assets(page)).map((a) => ({
    id: String(a.id),
    name: String(a.name),
    width: a.width ? Number(a.width) : null,
    height: a.height ? Number(a.height) : null,
  }));
}
export async function archiveBrochureAsset(id: string) {
  try {
    const s = await brochureServices('brochure.media.manage');
    brochureResult(
      await s.client.rpc('brochure_media', {
        p_organization_id: s.context.organizationId,
        p_action: 'archive',
        p_asset_id: id,
      }),
    );
    revalidatePath('/dashboard/brochures/media');
    return { ok: true as const, message: 'Unused image archived' };
  } catch (e) {
    return {
      ...failure(e),
      message:
        'Image unavailable or still used by a draft, brand kit or historical brochure. Referenced images must be retained.',
    };
  }
}
export async function grantBrochureDesigner(userId: string) {
  try {
    const s = await brochureServices('brochure.manage');
    const r = await s.client.rpc('brochure_grant_designer', {
      p_organization_id: s.context.organizationId,
      p_user_id: userId,
    });
    if (r.error) throw r.error;
    return { ok: true as const, message: 'Brochure Designer role assigned' };
  } catch (e) {
    return failure(e);
  }
}
export async function saveBrochureBlock(name: string, components: unknown) {
  const s = await brochureServices('brochure.brand.manage');
  const data = await s.brochure.list();
  return saveMarketingKit(data.kitVersion, {
    ...data.kit,
    blocks: [
      ...data.kit.blocks,
      {
        id: 'block' + crypto.randomUUID().replaceAll('-', ''),
        name,
        components: brochureJson(components),
      },
    ],
  });
}
