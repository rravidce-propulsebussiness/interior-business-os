'use server';
import { Resolver } from 'node:dns/promises';
import { connect } from 'node:tls';
import { isIP } from 'node:net';
import { websiteServices, signWebsite } from './service';
import { revalidatePath } from 'next/cache';
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
    revalidatePath(`/dashboard/website/${site}/domains`);
    return {
      message:
        'Domain added. Configure the TXT and CNAME records, then verify.',
    };
  } catch {
    return { message: 'Domain unavailable or capability disabled.' };
  }
}
export async function checkWebsiteDomain(site: string, id: string) {
  try {
    const s = await websiteServices('website.domain.manage');
    const r = await s.client
      .from('website_domains')
      .select('*')
      .eq('id', id)
      .eq('website_id', site)
      .eq('organization_id', s.context.organizationId)
      .single();
    if (r.error) throw r.error;
    const domain = r.data;
    const config = await s.client.rpc('website_configuration', {
      p_organization_id: s.context.organizationId,
    });
    const cfg = config.data as { platform?: { baseDomain?: string } } | null;
    const base = cfg?.platform?.baseDomain;
    if (!base) throw new Error('Platform domain not configured');
    const resolver = new Resolver({ timeout: 3000, tries: 1 });
    let dns = false,
      tls = false;
    const answers = await Promise.allSettled([
      resolver.resolveTxt(`_business-os.${domain.hostname}`),
      resolver.resolve4(domain.hostname),
      resolver.resolve4(base),
    ]);
    if (
      answers[0].status === 'fulfilled' &&
      answers[1].status === 'fulfilled' &&
      answers[2].status === 'fulfilled'
    ) {
      const addresses = answers[1].value;
      dns =
        answers[0].value.some(
          (parts) =>
            parts.join('') === `business-os-verification=${domain.challenge}`,
        ) &&
        addresses.length > 0 &&
        addresses.every(
          (ip) =>
            publicIp(ip) &&
            answers[2].status === 'fulfilled' &&
            answers[2].value.includes(ip),
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
            ? 'DNS verified. Configure a valid HTTPS certificate with your hosting provider, then check again.'
            : 'DNS ownership or routing could not be verified.',
    };
  } catch {
    return {
      message:
        'Verification unavailable. Check DNS and platform signing configuration.',
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
