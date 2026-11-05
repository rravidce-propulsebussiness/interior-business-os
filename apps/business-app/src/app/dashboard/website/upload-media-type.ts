/**
 * Classify supported MP4 file signatures without treating AVIF (also an
 * ISO BMFF ftyp container) as MP4. All other files are passed to the
 * signature-based image validator, not trusted by their extension/MIME.
 */
export function isSupportedWebsiteMp4(bytes: Buffer): boolean {
  if (bytes.length < 12 || bytes.subarray(4, 8).toString('ascii') !== 'ftyp')
    return false;
  return ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V '].includes(
    bytes.subarray(8, 12).toString('ascii'),
  );
}
