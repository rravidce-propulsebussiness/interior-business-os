type SupportedImageMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/avif';

function detectImage(input: Buffer): SupportedImageMime | null {
  if (
    input.length >= 8 &&
    input[0] === 0x89 &&
    input.subarray(1, 4).toString('ascii') === 'PNG'
  )
    return 'image/png';
  if (
    input.length >= 3 &&
    input[0] === 0xff &&
    input[1] === 0xd8 &&
    input[2] === 0xff
  )
    return 'image/jpeg';
  if (
    input.length >= 12 &&
    input.subarray(0, 4).toString('ascii') === 'RIFF' &&
    input.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  if (
    input.length >= 16 &&
    input.subarray(4, 8).toString('ascii') === 'ftyp' &&
    ['avif', 'avis'].includes(input.subarray(8, 12).toString('ascii'))
  )
    return 'image/avif';
  return null;
}

function pngSize(input: Buffer) {
  if (input.length < 24) return { width: null, height: null };
  return {
    width: input.readUInt32BE(16),
    height: input.readUInt32BE(20),
  };
}

function jpegSize(input: Buffer) {
  let offset = 2;
  const sof = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  while (offset + 8 < input.length) {
    if (input[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = input[offset + 1]!;
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > input.length) break;
    const length = input.readUInt16BE(offset);
    if (length < 2 || offset + length > input.length) break;
    if (sof.has(marker) && length >= 7)
      return {
        height: input.readUInt16BE(offset + 3),
        width: input.readUInt16BE(offset + 5),
      };
    offset += length;
  }
  return { width: null, height: null };
}

function webpSize(input: Buffer) {
  if (input.length < 30) return { width: null, height: null };
  const kind = input.subarray(12, 16).toString('ascii');
  if (kind === 'VP8X') {
    return {
      width: 1 + input[24]! + (input[25]! << 8) + (input[26]! << 16),
      height: 1 + input[27]! + (input[28]! << 8) + (input[29]! << 16),
    };
  }
  if (kind === 'VP8L' && input.length >= 25 && input[20] === 0x2f) {
    const b1 = input[21]!;
    const b2 = input[22]!;
    const b3 = input[23]!;
    const b4 = input[24]!;
    return {
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
    };
  }
  if (
    kind === 'VP8 ' &&
    input[23] === 0x9d &&
    input[24] === 0x01 &&
    input[25] === 0x2a
  ) {
    return {
      width: input.readUInt16LE(26) & 0x3fff,
      height: input.readUInt16LE(28) & 0x3fff,
    };
  }
  return { width: null, height: null };
}

function dimensions(input: Buffer, mime: SupportedImageMime) {
  if (mime === 'image/png') return pngSize(input);
  if (mime === 'image/jpeg') return jpegSize(input);
  if (mime === 'image/webp') return webpSize(input);
  return { width: null, height: null };
}

/**
 * Worker-safe marketing image validation.
 *
 * Cloudflare Workers cannot execute Sharp's native binary, so the Worker
 * validates signatures and dimensions without native code and preserves the
 * source bytes. Presentation-time optimization can be handled by the CDN.
 */
export async function prepareMarketingImage(input: Buffer, print = false) {
  if (input.length > 10485760) throw new Error('Choose an image up to 10 MB');
  const mime = detectImage(input);
  if (!mime) throw new Error('Use a JPEG, PNG, WebP or AVIF image');
  if (print && mime !== 'image/webp')
    throw new Error('Use a WebP image for brochure media');
  const { width, height } = dimensions(input, mime);
  if (width && height && width * height > 40000000)
    throw new Error('Image exceeds the 40 MP decode limit');
  return {
    data: Buffer.from(input),
    width,
    height,
    mime,
  };
}
