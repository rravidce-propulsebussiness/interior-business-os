import { NextResponse } from 'next/server';
import { crmServices } from '@/app/dashboard/crm/service';
import {
  META_STATE_COOKIE,
  createOauthState,
  loginDialogUrl,
  metaLeadConfig,
  metaLeadMissingConfig,
} from '@/lib/meta-leads';

export const dynamic = 'force-dynamic';

/** Starts Facebook Login so a CRM manager can share the Pages that run lead ads. */
export async function GET() {
  const { origin } = metaLeadConfig();
  const back = (reason: string) =>
    NextResponse.redirect(
      new URL(
        '/dashboard/crm/leads?panel=meta&meta=' + reason,
        origin || 'http://localhost:3001',
      ),
      { status: 303, headers: { 'Cache-Control': 'private, no-store' } },
    );
  if (metaLeadMissingConfig().length) return back('not_configured');
  try {
    const s = await crmServices('lead.view');
    if (!s.allowed('crm.source.manage') || !s.allowed('crm.pipeline.manage'))
      return back('forbidden');
    const user = await s.authorization.requireAuthenticatedUser();
    const { state, nonce } = createOauthState(s.org, user.id);
    const response = NextResponse.redirect(loginDialogUrl(state), {
      status: 303,
      headers: { 'Cache-Control': 'private, no-store' },
    });
    response.cookies.set(META_STATE_COOKIE, nonce, {
      path: '/api/meta-leads/oauth',
      httpOnly: true,
      sameSite: 'lax',
      secure: origin.startsWith('https:'),
      maxAge: 15 * 60,
    });
    return response;
  } catch {
    return back('forbidden');
  }
}
