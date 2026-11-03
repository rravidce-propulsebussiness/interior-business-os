'use server';
import { signWebsite } from './service';
import { domainServices } from './domain-service';
import { revalidatePath } from 'next/cache';
import {
  cloudflareDnsInstructions,
  cloudflareSaasConfigured,
  ensureCloudflareFallbackOrigin,
  ensureCloudflareHostname,
  getCloudflareHostname,
  type DomainDnsInstruction,
} from './cloudflare-domains';

function domainFailureMessage(error: unknown) {
  const reason = error instanceof Error ? error.message : '';
  if (/custom domain capability|required|not included in.*plan/i.test(reason))
    return 'Custom domains are not included in this website plan. Ask your Business OS administrator to enable the Custom Domain plan feature.';
  if (/quota has been allocated|SSL for SaaS|no quota|not been enabled/i.test(reason))
    return 'Custom-domain certificates are not enabled for this Cloudflare account yet. The platform administrator must enable Cloudflare for SaaS before customers can connect domains.';
  if (/fallback origin|CLOUDFLARE_SAAS_/i.test(reason))
    return 'The platform custom-domain gateway is not fully configured. Please contact the Business OS administrator.';
  return 'Custom-domain setup could not be completed. Check the domain, plan entitlement and Cloudflare configuration.';
}

export async function addWebsiteDomain(
  site: string,
  hostname: string,
  organizationId?: string,
): Promise<{
  message: string;
  hostname?: string;
  challenge?: string;
  records: DomainDnsInstruction[];
}> {
  try {
    const s = await domainServices(organizationId);
    const host = hostname.trim().toLowerCase().replace(/\.$/, '');
    if (!cloudflareSaasConfigured())
      return {
        message: 'Custom domains are not enabled by the platform administrator yet.',
        records: [],
      };

    // Ensure the shared SaaS fallback is ready before creating a customer
    // domain claim. This avoids leaving a pending DB row when Cloudflare has
    // not allocated the required SSL for SaaS feature/quota.
    // Verify the platform-level SaaS fallback before creating a tenant
    // claim; a missing Cloudflare SaaS quota must not leave orphan domains.
    await ensureCloudflareFallbackOrigin();

    const r = await s.client.rpc('website_domain_add', {
      p_organization_id: s.context.organizationId,
      p_website_id: site,
      p_hostname: host,
    });
    if (r.error || !r.data) throw r.error ?? new Error('Domain could not be registered');

    const cloudflare = await ensureCloudflareHostname(host);
    const saved = await s.client
      .from('website_domains')
      .select('hostname,challenge')
      .eq('id', String(r.data))
      .eq('website_id', site)
      .eq('organization_id', s.context.organizationId)
      .single();
    if (saved.error || !saved.data) throw new Error('Domain registration could not be read');

    revalidatePath(`/dashboard/website/${site}/domains`);
    revalidatePath('/admin/domains');
    return {
      message: 'Domain registered. Add the Business OS TXT record and point the hostname to the CNAME target shown below. Then verify DNS and HTTPS.',
      hostname: saved.data.hostname,
      challenge: saved.data.challenge,
      records: cloudflareDnsInstructions(cloudflare),
    };
  } catch (error) {
    return { message: domainFailureMessage(error), records: [] };
  }
}

export async function checkWebsiteDomain(
  site: string,
  id: string,
  organizationId?: string,
): Promise<{
  message: string;
  records: DomainDnsInstruction[];
}> {
  try {
    const s = await domainServices(organizationId);
    const r = await s.client
      .from('website_domains')
      .select('*')
      .eq('id', id)
      .eq('website_id', site)
      .eq('organization_id', s.context.organizationId)
      .single();
    if (
      r.error ||
      !r.data ||
      r.data.kind !== 'custom' ||
      r.data.status === 'removed'
    ) throw new Error('Unavailable domain');
    const domain = r.data;

    if (!cloudflareSaasConfigured())
      return {
        message: 'The platform custom-domain gateway is not configured yet. Contact the Business OS administrator.',
        records: [],
      };

    const config = organizationId
      ? await s.client.from('website_platform_settings').select('base_domain').single()
      : await s.client.rpc('website_configuration', {
          p_organization_id: s.context.organizationId,
        });
    if (config.error) throw new Error('Platform domain configuration unavailable');
    const base = organizationId
      ? (config.data as { base_domain?: string | null }).base_domain ?? undefined
      : ((config.data as { platform?: { baseDomain?: string } } | null)?.platform?.baseDomain);
    if (!base) throw new Error('Platform domain not configured');

    // The Business OS ownership proof is separate from Cloudflare's own
    // hostname/DCV validation. Both must be satisfied before activation.
    const resolver = new (await import('node:dns/promises')).Resolver({
      timeout: 3000,
      tries: 1,
    });
    const txtResult = await Promise.allSettled([
      resolver.resolveTxt('_business-os.' + domain.hostname),
    ]);
    const ownership =
      txtResult[0].status === 'fulfilled' &&
      txtResult[0].value.some(parts =>
        parts.join('') === 'business-os-verification=' + domain.challenge,
      );

    // Cloudflare status=active means it accepted the customer's CNAME/hostname
    // validation; ssl.status=active means the certificate is issued/deployed.
    // This works for both www CNAMEs and apex CNAME-flattened/ALIAS records.
    const cloudflare = await getCloudflareHostname(domain.hostname);
    const records = cloudflareDnsInstructions(cloudflare);
    const dns = ownership && cloudflare.status === 'active';
    const tls = dns && cloudflare.ssl?.status === 'active';

    const proof = signWebsite({
      purpose: 'website.domain',
      organizationId: s.context.organizationId,
      domainId: domain.id,
      hostname: domain.hostname,
      challenge: domain.challenge,
      dns,
      tls,
    });
    const result = await s.client.rpc('website_domain_check', {
      p_organization_id: s.context.organizationId,
      p_domain_id: id,
      p_proof: proof.body,
      p_signature: proof.signature,
    });
    if (result.error) throw result.error;
    revalidatePath(`/dashboard/website/${site}/domains`);
    revalidatePath('/admin/domains');
    return {
      message:
        result.data === 'active'
          ? 'Domain active: Cloudflare hostname validation and HTTPS certificate are ready.'
          : result.data === 'verified'
            ? 'Domain ownership and DNS are verified. Cloudflare is still issuing or activating HTTPS. Verify again when the certificate is active.'
            : ownership
              ? 'Business OS ownership is verified, but Cloudflare has not activated the hostname yet. Check the CNAME/ALIAS target and Cloudflare validation records.'
              : 'Add the exact Business OS TXT ownership record shown for this hostname, then verify again.',
      records,
    };
  } catch (error) {
    return {
      message: domainFailureMessage(error),
      records: [],
    };
  }
}

export async function removeWebsiteDomain(
  site: string,
  id: string,
  version: number,
  organizationId?: string,
) {
  const s = await domainServices(organizationId);
  const r = await s.client.rpc('website_domain_remove', {
    p_organization_id: s.context.organizationId,
    p_domain_id: id,
    p_version: version,
  });
  revalidatePath(`/dashboard/website/${site}/domains`);
  revalidatePath('/admin/domains');
  return {
    message: r.error
      ? 'Domain could not be removed. Reload and try again.'
      : 'Domain removed.',
  };
}
