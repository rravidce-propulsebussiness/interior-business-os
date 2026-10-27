'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { openOrCreateWonLeadProject } from './lead-project-actions';

export function LeadProjectAction({
  leadId,
  version,
  leadName,
  lifecycle,
  convertedProjectId,
  quotationProjectId,
  canConvert,
  canViewProject,
}: {
  leadId: string;
  version: number;
  leadName: string;
  lifecycle: string;
  convertedProjectId: string | null;
  quotationProjectId: string | null;
  canConvert: boolean;
  canViewProject: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState(leadName + ' project');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  if (lifecycle === 'archived') return null;
  if (convertedProjectId) {
    return canViewProject ? (
      <Link
        className="crm-project-open"
        href={'/dashboard/projects/' + encodeURIComponent(convertedProjectId)}
      >
        Open Project <span aria-hidden="true">↗</span>
      </Link>
    ) : null;
  }
  if (lifecycle !== 'won' || !canConvert) return null;

  const existingQuoteProject = Boolean(quotationProjectId);
  const save = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (pending || (!existingQuoteProject && !projectName.trim())) return;
    setPending(true);
    setError('');
    try {
      const result = await openOrCreateWonLeadProject({
        leadId,
        version,
        ...(!existingQuoteProject ? { projectName: projectName.trim() } : {}),
      });
      if (!result.ok || !result.projectId) {
        setError(result.message || 'Could not create project.');
        return;
      }
      router.push(
        '/dashboard/projects/' + encodeURIComponent(result.projectId),
      );
      router.refresh();
    } catch {
      setError('Unable to open the project. Retry.');
    } finally {
      setPending(false);
    }
  };

  if (existingQuoteProject)
    return (
      <div className="crm-project-inline">
        <button
          type="button"
          className="crm-project-open"
          disabled={pending}
          onClick={() => void save()}
        >
          {pending ? 'Linking project…' : 'Open Project ↗'}
        </button>
        {error && (
          <small role="alert" className="crm-project-error">
            {error}
          </small>
        )}
      </div>
    );

  return (
    <div className="crm-project-inline">
      {!creating ? (
        <button
          className="crm-project-create"
          type="button"
          onClick={() => setCreating(true)}
        >
          + Create Project
        </button>
      ) : (
        <form className="crm-project-quick-form" onSubmit={save}>
          <label htmlFor={'lead-project-' + leadId}>Project name</label>
          <input
            id={'lead-project-' + leadId}
            autoFocus
            required
            maxLength={200}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Enter project name"
          />
          <div className="crm-project-quick-actions">
            <button
              className="crm-project-create"
              disabled={pending || !projectName.trim()}
              type="submit"
            >
              {pending ? 'Creating…' : 'Create Project'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setCreating(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <small role="alert" className="crm-project-error">
          {error}
        </small>
      )}
    </div>
  );
}
