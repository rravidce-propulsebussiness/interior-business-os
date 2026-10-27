/**
 * Render the same premium concept photography in Preview and in the printed
 * PDF, using data: images so PDF Chromium/Cloudflare never makes network calls.
 * Only these two public, fixed illustration URLs may be fetched server-side.
 * Uploaded tenant branding is already embedded and is never modified.
 */
const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';

const conceptPhotos = {
  '1756435292384-1bf32eff7baf':
    'https://images.unsplash.com/photo-1756435292384-1bf32eff7baf?fm=webp&w=1000&q=70',
  '1751945965597-71171ec7a458':
    'https://images.unsplash.com/photo-1751945965597-71171ec7a458?fm=webp&w=900&q=70',
} as const;
type ConceptId = keyof typeof conceptPhotos;
const ids = Object.keys(conceptPhotos) as ConceptId[];
let photoCache: Promise<Record<ConceptId, string>> | undefined;

async function loadConcept(id: ConceptId): Promise<string> {
  try {
    const response = await fetch(conceptPhotos[id], {
      redirect: 'error',
      signal: AbortSignal.timeout(4_000),
      headers: { Accept: 'image/webp' },
    });
    if (
      !response.ok ||
      response.headers.get('content-type')?.split(';')[0] !== 'image/webp'
    )
      return TRANSPARENT_PNG;
    const declaredBytes = Number(response.headers.get('content-length') || 0);
    if (declaredBytes > 1_500_000) return TRANSPARENT_PNG;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 1_500_000) return TRANSPARENT_PNG;
    // WebP RIFF header, not an HTML error page disguised as an image.
    if (
      bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WEBP'
    )
      return TRANSPARENT_PNG;
    return 'data:image/webp;base64,' + bytes.toString('base64');
  } catch {
    return TRANSPARENT_PNG;
  }
}

export async function inlinePremiumConceptImages(
  html: string,
): Promise<string> {
  // No public source in this particular quote (tenant photos are data URIs).
  if (!html.includes('images.unsplash.com/photo-')) return html;
  photoCache ??= Promise.all(ids.map((id) => loadConcept(id))).then(
    ([cover, detail]) =>
      ({
        [ids[0]!]: cover ?? TRANSPARENT_PNG,
        [ids[1]!]: detail ?? TRANSPARENT_PNG,
      }) as Record<ConceptId, string>,
  );
  const images = await photoCache;
  return html.replace(
    /src=(["'])https:\/\/images\.unsplash\.com\/photo-(1756435292384-1bf32eff7baf|1751945965597-71171ec7a458)[^"']*\1/gi,
    (_match, _quote: string, photoId: ConceptId) =>
      'src="' + images[photoId] + '"',
  );
}
