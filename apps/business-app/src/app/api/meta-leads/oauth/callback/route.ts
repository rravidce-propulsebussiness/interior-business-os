import { NextResponse } from 'next/server';
import { publicAuthOrigin } from '@business-os/auth/origin';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { crmServices } from '@/app/dashboard/crm/service';
import {
  META_STATE_COOKIE,
  MetaLeadError,
  metaLeadConfig,
  metaLeadMissingConfig,
  readOauthState,
  savePagesFromCode,
} from '@/lib/meta-leads';

export const dynamic = 'force-dynamic';

/**
 * Facebook returns here after the owner chooses which Pages to share.
 * The signed state must match this browser (cookie), this signed-in member
 * and their active company before any Page token is stored.
 */
export async function GET(request: Request) {
  const { origin } = metaLeadConfig();
  const finish = (reason: string) => {
    const response = NextResponse.redirect(
      new URL(
        '/dashboard/meta-leads?meta=' + reason,
        origin || publicAuthOrigin(request.url),
      ),
      { status: 303, headers: { 'Cache-Control': 'private, no-store' } },
    );
    response.cookies.delete({
      name: META_STATE_COOKIE,
      path: '/api/meta-leads/oauth',
    });
    return response;
  };
  if (metaLeadMissingConfig().length) return finish('not_configured');
  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? '';
  const nonce = (await cookies()).get(META_STATE_COOKIE)?.value ?? '';
  const state = readOauthState(url.searchParams.get('state') ?? '', nonce);
  if (!state) return finish('expired');
  if (url.searchParams.get('error')) {
    return finish(
      url.searchParams.get('error') === 'access_denied'
        ? 'cancelled'
        : 'meta_rejected',
    );
  }
  if (!code) return finish('cancelled');
  if (code.length > 2000) return finish('failed');
  try {
    const s = await crmServices('lead.view');
    const user = await s.authorization.requireAuthenticatedUser();
    if (
      user.id !== state.userId ||
      s.org !== state.organizationId ||
      !s.allowed('crm.source.manage') ||
      !s.allowed('crm.pipeline.manage')
    )
      return finish('forbidden');
    const saved = await savePagesFromCode({
      code,
      organizationId: s.org,
      userId: user.id,
    });
    revalidatePath('/dashboard/crm/leads');
    revalidatePath('/dashboard/meta-leads');
    return finish(saved ? 'connected' : 'no_pages');
  } catch (error) {
    // Meta's raw response can contain sensitive data. Only log the error
    // class/status; the CRM gets a safe, actionable explanation.
    console.error(
      '[Meta Lead Ads] oauth.callback.failed',
      error instanceof Error ? error.name : 'UnknownError',
      error instanceof MetaLeadError ? (error.options.status ?? '') : '',
    );
    return finish(
      error instanceof MetaLeadError && error.options.needsReconnect
        ? 'permission_denied'
        : 'failed',
    );
  }
}
