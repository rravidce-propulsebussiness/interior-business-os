'use server';

import { revalidatePath } from 'next/cache';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import { crmSchemas } from '@business-os/core/crm';
import { z } from 'zod';
import { crmServices } from '../service';

const origin = 'https://propulsetechnologies.online';
const matchCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{43}$/);
const redemption = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  subject: z.string().regex(/^propulse:[0-9]+$/),
  display_name: z.string().max(200),
  email: z.string().email().max(254),
  expires_in: z.number().int().positive(),
});
const record = z.object({
  organization_id: z.uuid(),
  access_token: z.string().min(32),
  token_expires_at: z.string(),
  sync_page: z.number().int().positive(),
  last_synced_at: z.string().nullable(),
});
const lead = z.object({
  lead_id: z.number().int().nonnegative(),
  customer_name: z.string().nullable().optional(),
  customer_phone: z.string().nullable().optional(),
  customer_email: z.string().nullable().optional(),
  requirement: z.string().nullable().optional(),
  service: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  budget: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  // Proof comes from the authenticated, account-scoped ProPulse purchases feed.
  // Complimentary/member-granted and merely visible leads are rejected.
  access_type: z.literal('purchased'),
  purchase_status: z.literal('paid'),
  purchase_id: z.number().int().positive(),
  purchase_payment_id: z.number().int().positive(),
});
const feed = z.object({
  leads: z.array(lead).max(50),
  page: z.number().int().positive(),
  has_more: z.boolean(),
});
type ActionResult = {
  ok: boolean;
  message: string;
  created?: number;
  skipped?: number;
};

function requireManager(s: Awaited<ReturnType<typeof crmServices>>) {
  if (!s.allowed('crm.source.manage') || !s.allowed('crm.pipeline.manage'))
    throw new Error('Only company owners/CRM managers can connect ProPulse.');
}

async function proRequest(path: string, init: RequestInit) {
  const response = await fetch(origin + path, {
    ...init,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    if (response.status === 401)
      throw new Error('The ProPulse connection has expired. Connect again.');
    if (response.status === 400)
      throw new Error(
        'Invalid or expired pairing code. Generate a new code in ProPulse.',
      );
    throw new Error('ProPulse could not be reached. Try again shortly.');
  }
  return response.json() as Promise<unknown>;
}

/** One-time pairing: independent ProPulse login proves ownership, not matching email. */
export async function connectPropulseLeads(
  code: string,
): Promise<ActionResult> {
  try {
    const pairingCode = matchCode.parse(code);
    const s = await crmServices('lead.view');
    requireManager(s);
    const user = await s.authorization.requireAuthenticatedUser();
    // Avoid consuming a valid pairing code if this deployment lacks its
    // server-only Supabase secret/service-role credential.
    const admin = createOwnerProvisioningDatabase();
    const verified = redemption.parse(
      await proRequest('/api/business-os/link/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: pairingCode }),
      }),
    );
    // A paid purchase belongs to one business. Do not let a connected
    // ProPulse purchaser distribute its private feed across OS tenants.
    const { data: otherTenant, error: ownerError } = await admin
      .from('propulse_lead_connections')
      .select('organization_id')
      .eq('propulse_subject', verified.subject)
      .neq('organization_id', s.org)
      .limit(1);
    if (ownerError)
      throw new Error('Could not verify the ProPulse purchasing company.');
    if (otherTenant?.length)
      throw new Error('This ProPulse purchasing account is already connected to another Business OS company.');
    const { data: existing, error: priorError } = await admin
      .from('propulse_lead_connections')
      .select('access_token')
      .eq('organization_id', s.org)
      .maybeSingle();
    if (priorError)
      throw new Error('Could not check existing ProPulse connection.');
    const { error } = await admin.from('propulse_lead_connections').upsert(
      {
        organization_id: s.org,
        connected_by: user.id,
        propulse_subject: verified.subject,
        display_email: verified.email,
        display_name: verified.display_name,
        access_token: verified.token,
        token_expires_at: new Date(
          Date.now() + verified.expires_in * 1000,
        ).toISOString(),
        last_synced_at: null,
        sync_page: 1,
      },
      { onConflict: 'organization_id' },
    );
    if (error) {
      await proRequest('/api/business-os/link/revoke', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + verified.token },
      }).catch(() => undefined);
      throw new Error('Could not save the ProPulse company connection.');
    }
    if (existing?.access_token) {
      await proRequest('/api/business-os/link/revoke', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + existing.access_token },
      }).catch(() => undefined);
    }
    revalidatePath('/dashboard/crm/leads');
    return {
      ok: true,
      message:
        'ProPulse connected. Eligible leads will appear in All Leads after syncing.',
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Could not connect ProPulse.',
    };
  }
}

export async function disconnectPropulseLeads(): Promise<ActionResult> {
  try {
    const s = await crmServices('lead.view');
    requireManager(s);
    const admin = createOwnerProvisioningDatabase();
    const { data, error } = await admin
      .from('propulse_lead_connections')
      .select('access_token')
      .eq('organization_id', s.org)
      .maybeSingle();
    if (error) throw new Error('Could not read connection.');
    if (data) {
      await proRequest('/api/business-os/link/revoke', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + data.access_token },
      });
      const removed = await admin
        .from('propulse_lead_connections')
        .delete()
        .eq('organization_id', s.org);
      if (removed.error) throw new Error('Could not remove connection.');
    }
    revalidatePath('/dashboard/crm/leads');
    return {
      ok: true,
      message: 'ProPulse disconnected. Existing CRM leads are retained.',
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not disconnect.',
    };
  }
}

/** Automatically called on CRM open and periodically while CRM remains open.
 * The server never returns, logs or serializes the ProPulse bearer token.
 */
export async function syncPropulseLeads(): Promise<ActionResult> {
  try {
    const s = await crmServices('lead.create');
    const admin = createOwnerProvisioningDatabase();
    const { data, error } = await admin
      .from('propulse_lead_connections')
      .select(
        'organization_id,access_token,token_expires_at,last_synced_at,sync_page',
      )
      .eq('organization_id', s.org)
      .maybeSingle();
    if (error || !data)
      return {
        ok: false,
        message: 'Connect ProPulse to receive your eligible leads.',
      };
    const connection = record.parse(data);
    if (Date.parse(connection.token_expires_at) < Date.now())
      return {
        ok: false,
        message: 'ProPulse connection expired. Connect again.',
      };
    if (
      connection.last_synced_at &&
      Date.now() - Date.parse(connection.last_synced_at) < 90000
    )
      return {
        ok: true,
        message: 'Already up to date.',
        created: 0,
        skipped: 0,
      };
    // Claim a 90s lease: prevents concurrent dashboard tabs from saving twice.
    const cutoff = new Date(Date.now() - 90000).toISOString();
    const { data: claimed, error: leaseError } = await admin
      .from('propulse_lead_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('organization_id', s.org)
      .or('last_synced_at.is.null,last_synced_at.lt.' + cutoff)
      .select('organization_id');
    if (leaseError || !claimed?.length)
      return {
        ok: true,
        message: 'Sync already running.',
        created: 0,
        skipped: 0,
      };

    const [sourcesResult, stagesResult] = await Promise.all([
      s.crm.search('lead_sources', { active: true }),
      s.crm.search('crm_pipeline_stages', { active: true }),
    ]);
    const options = z.object({
      rows: z.array(z.object({ id: z.uuid(), key: z.string() })),
    });
    const source = options
      .parse(sourcesResult)
      .rows.find((v) => v.key === 'propulse_marketplace');
    const stage = options.parse(stagesResult).rows.find((v) => v.key === 'new');
    if (!source || !stage)
      return {
        ok: false,
        message: 'Set up CRM sources and stages before ProPulse sync.',
      };
    let created = 0,
      skipped = 0;
    let page = connection.sync_page;
    for (let batch = 0; batch < 2; batch++) {
      const body = feed.parse(
        await proRequest('/api/business-os/leads?page=' + page, {
          method: 'GET',
          headers: { authorization: 'Bearer ' + connection.access_token },
        }),
      );
      for (const row of body.leads) {
        const key = 'propulse:' + row.lead_id;
        const { data: found, error: findError } = await s.client
          .from('leads')
          .select('id')
          .eq('organization_id', s.org)
          .eq('source_detail', key)
          .limit(1);
        if (findError) throw new Error('CRM lead lookup unavailable.');
        if (found?.length) {
          skipped++;
          continue;
        }
        const phone = String(row.customer_phone || '').trim();
        const email = String(row.customer_email || '').trim();
        if (!phone || !/^(?:\+|00)?[0-9() .-]{3,50}$/.test(phone)) {
          skipped++;
          continue;
        }
        // Purchased leads always land in this buyer's CRM, even if another
        // lead/client shares a phone. Conversion handles the customer match.
        // Exact ProPulse lead ID is deduplicated by the tenant-scoped index.
        const rawBudget = String(row.budget || '').replace(/[₹,\s]/g, '');
        const amount = /^\d{1,16}(\.\d{1,2})?$/.test(rawBudget)
          ? rawBudget
          : null;
        const input = crmSchemas.leads.safeParse({
          name: (row.customer_name || 'ProPulse customer').slice(0, 200),
          phone,
          email: email.slice(0, 254),
          source_id: source.id,
          stage_id: stage.id,
          source_detail: key,
          location: (row.city || '').slice(0, 500),
          service_type: (row.service || '').slice(0, 200),
          notes: (row.requirement || '').slice(0, 10000),
          requirements: { propulse_purchase_id: row.purchase_id },
          site_address: {
            line1: '',
            line2: '',
            city: '',
            region: '',
            postal_code: '',
            country_code: '',
          },
          budget_min: amount,
          budget_max: null,
          expected_start_date: null,
        });
        if (!input.success) {
          skipped++;
          continue;
        }
        try {
          await s.crm.save('leads', input.data);
          created++;
        } catch {
          skipped++;
        } // Concurrent duplicate or tenant validation; never leak details.
      }
      page = body.has_more ? page + 1 : 1;
      if (!body.has_more) break;
    }
    await admin
      .from('propulse_lead_connections')
      .update({ sync_page: page })
      .eq('organization_id', s.org);
    if (created) revalidatePath('/dashboard/crm/leads');
    return {
      ok: true,
      message: created
        ? created + ' new ProPulse leads added.'
        : 'ProPulse leads are up to date.',
      created,
      skipped,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Lead sync unavailable.',
    };
  }
}
