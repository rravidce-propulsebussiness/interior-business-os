'use server';

/**
 * Retain the existing server-action export for compatibility with already
 * rendered forms, but never provision a tenant from an unreviewed POST.
 * The replacement application form is /dashboard/company/apply.
 */
export async function provisionOrganization(
  _state: { message: string },
  _form: FormData,
) {
  void _state;
  void _form;
  return {
    message:
      'Direct company creation is no longer available here. Submit your business for administrator review at /dashboard/company/apply.',
  };
}
