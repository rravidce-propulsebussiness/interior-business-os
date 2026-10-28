import { describe, expect, it } from 'vitest';
import { classifyWebsiteMediaSaveFailure as classify } from './media-upload-error';

describe('website media upload error categories', () => {
  it('identifies signing mismatches without exposing proof material', () => {
    const result = classify('Invalid or expired build proof');
    expect(result.code).toBe('WEBSITE_BUILD_SIGNATURE_MISMATCH');
    expect(result.status).toBe(503);
    expect(result.message).not.toContain('secret=');
  });
  it('identifies absent RPCs and quota failures', () => {
    expect(classify('Could not find function', 'PGRST202').code).toBe('WEBSITE_MEDIA_RPC_MISSING');
    expect(classify('Media storage limit reached').status).toBe(413);
  });
  it('identifies permission issues and defaults to generic safe error', () => {
    expect(classify('permission denied', '42501').status).toBe(403);
    const unexpected = classify('unexpected token in proof input');
    expect(unexpected.code).toBe('WEBSITE_MEDIA_REJECTED');
    expect(unexpected.message).not.toContain('proof input');
  });
});
