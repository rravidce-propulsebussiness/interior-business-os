'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { openOrCreateWonLeadProject } from './lead-project-actions';

export function LeadProjectAction({
  leadId, version, lifecycle, convertedProjectId,
  quotationProjectId, canConvert, canViewProject,
}: {
  leadId: string; version: number; lifecycle: string;
  convertedProjectId: string | null; quotationProjectId: string | null;
  canConvert: boolean; canViewProject: boolean;
}) {
  const router = useRouter();
  const [pending,setPending] = useState(false);
  const [error,setError] = useState('');

  if (lifecycle === 'archived') return null;
  if (convertedProjectId) {
    return canViewProject ? <Link className="crm-project-open"
      href={'/dashboard/projects/'+encodeURIComponent(convertedProjectId)}>
      Open Project <span aria-hidden="true">↗</span>
    </Link> : null;
  }
  if (lifecycle !== 'won' || !canConvert) return null;

  const existingQuoteProject = Boolean(quotationProjectId);
  const save = async () => {
    if (pending || !existingQuoteProject) return;
    setPending(true);setError('');
    try {
      const result = await openOrCreateWonLeadProject({
        leadId, version,
      });
      if (!result.ok || !result.projectId) {
        setError(result.message || 'Could not create project.');
        return;
      }
      router.push('/dashboard/projects/'+encodeURIComponent(result.projectId));
      router.refresh();
    } catch {
      setError('Unable to open the project. Retry.');
    } finally {
      setPending(false);
    }
  };

  if (existingQuoteProject) return <div className="crm-project-inline">
    <button type="button" className="crm-project-open" disabled={pending}
      onClick={()=>void save()}>
      {pending ? 'Linking project…' : 'Open Project ↗'}
    </button>
    {error && <small role="alert" className="crm-project-error">{error}</small>}
  </div>;

  return <div className="crm-project-inline">
    <Link className="crm-project-create" href={'/dashboard/quotations/new?lead='+encodeURIComponent(leadId)}>
      Create a quotation to start the project
    </Link>
    {error && <small role="alert" className="crm-project-error">{error}</small>}
  </div>;
}
