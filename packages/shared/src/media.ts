type MarketingImageMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/avif';

interface ImageInfo {
  mime: MarketingImageMime;
  width: number;
  height: number;
}

const readUInt24LE = (input: Buffer, offset: number) =>
  input[offset]! | (input[offset + 1]! << 8) | (input[offset + 2]! << 16);

function jpegInfo(input: Buffer): ImageInfo | null {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return null;
  let offset = 2;
  const sof = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  while (offset + 8 < input.length) {
    while (offset < input.length && input[offset] !== 0xff) offset++;
    while (offset < input.length && input[offset] === 0xff) offset++;
    if (offset >= input.length) break;
    const marker = input[offset++]!;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
    if (offset + 1 >= input.length) break;
    const length = input.readUInt16BE(offset);
    if (length < 2 || offset + length > input.length) break;
    if (sof.has(marker) && length >= 7) {
      return {
        mime: 'image/jpeg',
        height: input.readUInt16BE(offset + 3),
        width: input.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  return null;
}

function pngInfo(input: Buffer): ImageInfo | null {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (input.length < 24 || !input.subarray(0, 8).equals(signature)) return null;
  return {
    mime: 'image/png',
    width: input.readUInt32BE(16),
    height: input.readUInt32BE(20),
  };
}

function webpInfo(input: Buffer): ImageInfo | null {
  if (
    input.length < 30 ||
    input.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    input.subarray(8, 12).toString('ascii') !== 'WEBP'
  )
    return null;

  const kind = input.subarray(12, 16).toString('ascii');
  if (kind === 'VP8X' && input.length >= 30)
    return {
      mime: 'image/webp',
      width: 1 + readUInt24LE(input, 24),
      height: 1 + readUInt24LE(input, 27),
    };

  if (
    kind === 'VP8 ' &&
    input.length >= 30 &&
    input[23] === 0x9d &&
    input[24] === 0x01 &&
    input[25] === 0x2a
  )
    return {
      mime: 'image/webp',
      width: input.readUInt16LE(26) & 0x3fff,
      height: input.readUInt16LE(28) & 0x3fff,
    };

  if (kind === 'VP8L' && input.length >= 25 && input[20] === 0x2f) {
    const b1 = input[21]!;
    const b2 = input[22]!;
    const b3 = input[23]!;
    const b4 = input[24]!;
    return {
      mime: 'image/webp',
      width: 1 + ((b1 | (b2 << 8)) & 0x3fff),
      height: 1 + (((b2 >> 6) | (b3 << 2) | (b4 << 10)) & 0x3fff),
    };
  }
  return null;
}

function avifInfo(input: Buffer): ImageInfo | null {
  if (
    input.length < 32 ||
    input.subarray(4, 8).toString('ascii') !== 'ftyp' ||
    !/avif|avis/.test(input.subarray(8, Math.min(input.length, 64)).toString('ascii'))
  )
    return null;

  for (let offset = 4; offset + 16 <= input.length; offset++) {
    if (input.subarray(offset, offset + 4).toString('ascii') !== 'ispe') continue;
    const width = input.readUInt32BE(offset + 8);
    const height = input.readUInt32BE(offset + 12);
    if (width && height) return { mime: 'image/avif', width, height };
  }
  return null;
}

function inspectImage(input: Buffer): ImageInfo {
  const info =
    pngInfo(input) ?? jpegInfo(input) ?? webpInfo(input) ?? avifInfo(input);
  if (!info) throw new Error('Use a JPEG, PNG, WebP or AVIF image');
  if (
    !Number.isSafeInteger(info.width) ||
    !Number.isSafeInteger(info.height) ||
    info.width < 1 ||
    info.height < 1 ||
    info.width * info.height > 40_000_000
  )
    throw new Error('Image dimensions exceed the 40 MP limit');
  return info;
}

/**
 * Validate marketing images without native codecs so uploads remain compatible
 * with Cloudflare Workers. The original bytes are retained; layout cropping and
 * image optimization are handled by the publishing/rendering layer.
 */
export async function prepareMarketingImage(input: Buffer, print = false) {
  void print;
  if (input.length > 10_485_760) throw new Error('Choose an image up to 10 MB');
  const info = inspectImage(input);
  return {
    data: Buffer.from(input),
    width: info.width,
    height: info.height,
    mime: info.mime,
  };
}
