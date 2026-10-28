import { afterEach, describe, expect, it } from 'vitest';
import { isAllowedWebsiteUploadOrigin } from './upload-origin';

const originalOrigin = process.env.APP_ORIGIN;
const originalHosts = process.env.BUSINESS_OS_CENTRAL_HOSTNAMES;
afterEach(() => {
  if (originalOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = originalOrigin;
  if (originalHosts === undefined) delete process.env.BUSINESS_OS_CENTRAL_HOSTNAMES;
  else process.env.BUSINESS_OS_CENTRAL_HOSTNAMES = originalHosts;
});
function request(origin: string | null, host = 'localhost:3000') {
  const headers = new Headers({host});
  if (origin) headers.set('origin', origin);
  return new Request('http://127.0.0.1:3000/dashboard/website/site/uploads/media', {
    method: 'POST', headers,
  });
}
describe('website upload origin behind reverse proxy', () => {
  it('accepts configured public app origin when request URL is internal', () => {
    process.env.APP_ORIGIN = 'https://sghomesinterior.in';
    expect(isAllowedWebsiteUploadOrigin(request('https://sghomesinterior.in'))).toBe(true);
    expect(isAllowedWebsiteUploadOrigin(request('https://evil.example'))).toBe(false);
  });
  it('requires a real Origin', () => {
    process.env.APP_ORIGIN = 'https://sghomesinterior.in';
    expect(isAllowedWebsiteUploadOrigin(request(null))).toBe(false);
    expect(isAllowedWebsiteUploadOrigin(request('null'))).toBe(false);
    expect(isAllowedWebsiteUploadOrigin(request('https://sghomesinterior.in.evil.example'))).toBe(false);
  });
  it('allows only exact configured central hostnames', () => {
    delete process.env.APP_ORIGIN;
    process.env.BUSINESS_OS_CENTRAL_HOSTNAMES = 'sghomesinterior.in';
    expect(isAllowedWebsiteUploadOrigin(request('https://sghomesinterior.in'))).toBe(true);
    expect(isAllowedWebsiteUploadOrigin(request('http://sghomesinterior.in'))).toBe(false);
  });
});
