'use server';
import { Resolver } from 'node:dns/promises';
import { connect } from 'node:tls';
import { isIP } from 'node:net';
import { websiteServices, signWebsite } from './service';
import { revalidatePath } from 'next/cache';
import {
  cloudflareSaasEnabled,
  cloudflareDnsInstructions,
  ensureCloudflareHostname,
  getCloudflareHostname,
  type DomainDnsInstruction,
} from './cloudflare-domains';
function publicIp(ip: string) {
  if (isIP(ip) === 4) {
    const a = ip.split('.').map(Number);
    return (
      a[0]! > 0 &&
      a[0]! < 224 &&
      ![10, 127, 169].includes(a[0]!) &&
      !(a[0] === 192 && [0, 2, 168].includes(a[1]!)) &&
      !(a[0] === 198 && [18, 19, 51].includes(a[1]!)) &&
      !(a[0] === 203 && a[1] === 0 && a[2] === 113) &&
      !(a[0] === 172 && a[1]! >= 16 && a[1]! <= 31) &&
      !(a[0] === 192 && a[1] === 168) &&
      !(a[0] === 100 && a[1]! >= 64 && a[1]! <= 127)
    );
  }
  return false;
}
export async function addWebsiteDomain(site: string, hostname: string) {
  try {
    const s = await websiteServices('website.domain.manage');
    const host = hostname.trim().toLowerCase();
    const r = await s.client.rpc('website_domain_add', {
      p_organization_id: s.context.organizationId,
      p_website_id: site,
      p_hostname: host,
    });
    if (r.error) throw new Error('Domain unavailable or capability disabled');
    let message = 'Domain added. Configure the TXT and CNAME records, then verify.';
    if (cloudflareSaasEnabled()) {
      try {
        await ensureCloudflareHostname(host);
        message =
          'Domain registered for automatic HTTPS. Add the TXT and CNAME records, then select Verify.';
      } catch {
        message =
          'Domain saved, but automatic HTTPS provisioning needs a retry. Configure DNS and select Verify.';
      }
    }
    revalidatePath(`/dashboard/website/${site}/domains`);
    return { message };
  } catch {
    return { message: 'Domain unavailable or capability disabled.' };
  }
}
export async function checkWebsiteDomain(site: string, id: string): Promise<{
  message: string;
  records: DomainDnsInstruction[];
}> {
  try {
    const s = await websiteServices('website.domain.manage');
    const r = await s.client
      .from('website_domains')
      .select('*')
      .eq('id', id)
      .eq('website_id', site)
      .eq('organization_id', s.context.organizationId)
      .single();
    if (r.error || !r.data || r.data.kind !== 'custom' || r.data.status === 'removed')
      throw new Error('Unavailable domain');
    const domain = r.data;
    const config = await s.client.rpc('website_configuration', {
      p_organization_id: s.context.organizationId,
    });
    const cfg = config.data as { platform?: { baseDomain?: string } } | null;
    const base = cfg?.platform?.baseDomain;
    if (!base) throw new Error('Platform domain not configured');

    // DNS ownership is always checked with the unique Business OS challenge,
    // even when Cloudflare reports an issued certificate for the hostname.
    const resolver = new Resolver({ timeout: 3000, tries: 1 });
    const txtResult = await Promise.allSettled([
      resolver.resolveTxt('_business-os.' + domain.hostname),
    ]);
    const ownership =
      txtResult[0].status === 'fulfilled' &&
      txtResult[0].value.some(
        (parts) =>
          parts.join('') === 'business-os-verification=' + domain.challenge,
      );
    let dns = false;
    let tls = false;
    let records: DomainDnsInstruction[] = [];

    if (cloudflareSaasEnabled()) {
      // In managed mode the public SaaS target must be an actual CNAME.
      // Direct apex/A records need a separate explicitly supported adapter.
      const cname = await Promise.allSettled([
        resolver.resolveCname(domain.hostname),
      ]);
      const canonical = (value: string) =>
        value.toLowerCase().replace(/\.$/, '');
      dns =
        ownership &&
        cname[0].status === 'fulfilled' &&
        cname[0].value.some((target) => canonical(target) === canonical(base));

      const cloudflare = await getCloudflareHostname(domain.hostname);
      records = cloudflareDnsInstructions(cloudflare);
      // Both activation and edge SSL must be active, not just the certificate
      // handshake or the status of the customer's DNS record.
      tls =
        dns &&
        cloudflare.status === 'active' &&
        cloudflare.ssl?.status === 'active';
    } else {
      // Preserve the existing manually provisioned origin/TLS flow.
      const answers = await Promise.allSettled([
        resolver.resolve4(domain.hostname),
        resolver.resolve4(base),
      ]);
      if (ownership &&
          answers[0].status === 'fulfilled' &&
          answers[1].status === 'fulfilled') {
        const addresses = answers[0].value;
        const targetAddresses = answers[1].value;
        dns =
          addresses.length > 0 &&
          addresses.every(
            (ip) => publicIp(ip) && targetAddresses.includes(ip),
          );
        if (dns)
          tls = await new Promise<boolean>((resolve) => {
            const socket = connect(
              {
                host: addresses[0]!,
                port: 443,
                servername: domain.hostname,
                rejectUnauthorized: true,
              },
              () => {
                resolve(socket.authorized);
                socket.destroy();
              },
            );
            socket.setTimeout(5000, () => {
              resolve(false);
              socket.destroy();
            });
            socket.on('error', () => {
              resolve(false);
              socket.destroy();
            });
          });
      }
    }

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
    return {
      message:
        result.data === 'active'
          ? 'Domain active: DNS and HTTPS verified.'
          : result.data === 'verified'
            ? cloudflareSaasEnabled()
              ? 'DNS verified. Cloudflare is still issuing or activating HTTPS. Verify again after provisioning finishes.'
              : 'DNS verified. Configure a valid HTTPS certificate with your hosting provider, then check again.'
            : 'DNS ownership or CNAME routing could not be verified.',
      records,
    };
  } catch {
    return {
      message:
        'Verification unavailable. Check DNS, platform signing configuration and HTTPS provisioning.',
      records: [],
    };
  }
}
export async function removeWebsiteDomain(
  site: string,
  id: string,
  version: number,
) {
  const s = await websiteServices('website.domain.manage');
  const r = await s.client.rpc('website_domain_remove', {
    p_organization_id: s.context.organizationId,
    p_domain_id: id,
    p_version: version,
  });
  revalidatePath(`/dashboard/website/${site}/domains`);
  return {
    message: r.error
      ? 'Domain could not be removed. Reload and try again.'
      : 'Domain removed.',
  };
}
