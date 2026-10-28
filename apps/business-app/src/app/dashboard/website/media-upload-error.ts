/** Present safe, actionable website-media errors without leaking database payloads. */
export function classifyWebsiteMediaSaveFailure(reason: string, sqlState = ''): {
  code: string; message: string; status: number;
} {
  if (/Invalid or expired build proof|Invalid media proof|Media content mismatch/i.test(reason))
    return {
      code: 'WEBSITE_BUILD_SIGNATURE_MISMATCH', status: 503,
      message: 'Website image upload is blocked by a website signing-key mismatch. The administrator must align Hostinger WEBSITE_BUILD_SIGNING_KEY and WEBSITE_BUILD_KEY_ID with the active Supabase private.website_build_keys record.',
    };
  if (sqlState === 'PGRST202' || /Could not find the function .*website_asset_save/i.test(reason))
    return {
      code: 'WEBSITE_MEDIA_RPC_MISSING', status: 503,
      message: 'The website media upload function is missing from the configured Supabase database or its API schema cache. An administrator must apply the website database migrations to the correct Business OS project, then reload the API schema.',
    };
  if (/Media storage limit reached/i.test(reason))
    return {
      code: 'WEBSITE_MEDIA_QUOTA', status: 413,
      message: 'Your website storage allowance is full. Remove unused media or increase the storage limit.',
    };
  if (sqlState === '42501' || /permission denied|not permitted|insufficient privilege/i.test(reason))
    return {
      code: 'WEBSITE_MEDIA_PERMISSION', status: 403,
      message: 'Media upload permission was denied. Check the website membership, media permission and tenant ownership.',
    };
  return {
    code: 'WEBSITE_MEDIA_REJECTED', status: 400,
    message: 'The website database rejected this upload. Check website storage limits and migrations. Ask an administrator to review the request reference in the server logs.',
  };
}
