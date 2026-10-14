'use client';

import { useActionState, useState } from 'react';
import {
  defaultConstructionSpecSections,
  type ConstructionSpecSection,
} from '@business-os/core/construction-specifications';
import { SpecificationFieldsEditor } from '../../../../dashboard/pricing/construction/specification-fields-editor';
import { saveGlobalConstructionTemplate } from './template-actions';

export function PlatformConstructionTemplateEditor({
  initialSections,
}: {
  initialSections: ConstructionSpecSection[];
}) {
  const [sections, setSections] = useState<ConstructionSpecSection[]>(
    initialSections.length
      ? initialSections
      : defaultConstructionSpecSections(),
  );
  const [state, action, pending] = useActionState(
    saveGlobalConstructionTemplate,
    { message: '' },
  );
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="sections" value={JSON.stringify(sections)} />
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        Platform category defaults apply to{' '}
        <strong>new company packages only</strong>. Companies own their pricing,
        can edit or remove categories for their own packages, and never share
        package data across tenants.
      </div>
      <SpecificationFieldsEditor
        sections={sections}
        onChange={setSections}
        heading="Global default categories, drawings and editable fields"
      />
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          {pending ? 'Saving defaults…' : 'Save platform defaults'}
        </button>
        <button
          type="button"
          onClick={() => setSections(defaultConstructionSpecSections())}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"
        >
          Restore suggested categories (not saved yet)
        </button>
      </div>
      {state.message && (
        <p
          role={state.saved ? 'status' : 'alert'}
          className="rounded-xl bg-slate-100 p-4 text-sm text-slate-800"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
