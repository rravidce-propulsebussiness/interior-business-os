'use client';

import Link from 'next/link';

type SavedBoq = {
  id: string;
  title: string;
  project_id: string | null;
  version: number;
  updated_at: string;
};

type SavedProject = {
  id: string;
  name: string;
};

export function BoqRegisterLanding({
  documents,
  projects,
  canCreate,
  canEdit,
  canStartNew,
  onView,
  onEdit,
}: {
  documents: SavedBoq[];
  projects: SavedProject[];
  canCreate: boolean;
  canEdit: boolean;
  canStartNew: boolean;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));

  return (
    <main className="erp-page manual-boq boq-register-landing">
      {canCreate &&
        (canStartNew ? (
          <Link
            href="/dashboard/execution/boq/new"
            className="boq-register-create"
          >
            <svg
              width="23"
              height="23"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create New BOQ
          </Link>
        ) : (
          <button
            type="button"
            className="boq-register-create"
            disabled
            title="A project with a saved quotation and no existing BOQ is required."
          >
            <svg
              width="23"
              height="23"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create New BOQ
          </button>
        ))}
      <section className="boq-register-list" aria-labelledby="completed-boqs">
        <h2 id="completed-boqs">Completed BOQs</h2>
        {documents.length ? (
          <div className="boq-register-cards">
            {documents.map((document) => {
              const name = (document.project_id &&
                projectNames.get(document.project_id)) || document.title;
              return (
                <article className="boq-register-card" key={document.id}>
                  <span className="boq-register-building" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 21h18M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" />
                      <path d="M9 7h2M14 7h1M9 11h2M14 11h1M9 15h2M14 15h1M11 21v-4h3v4" />
                    </svg>
                  </span>
                  <div className="boq-register-card-main">
                    <h3>{name}</h3>
                    <p>
                      Revision {document.version} · Updated{' '}
                      {new Date(document.updated_at).toLocaleDateString('en-IN')}
                    </p>
                    <div className="boq-register-card-actions">
                      <button
                        type="button"
                        className="boq-register-view"
                        aria-label={`View BOQ for ${name}`}
                        onClick={() => onView(document.id)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                          <circle cx="12" cy="12" r="2.5" />
                        </svg>
                        View
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          className="boq-register-edit"
                          aria-label={`Edit BOQ for ${name}`}
                          onClick={() => onEdit(document.id)}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="m15 5 4 4M4 20l4-.6L20 7.5a2.8 2.8 0 0 0-4-4L4.6 15.4 4 20Z" />
                          </svg>
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="boq-register-no-results">No BOQs saved yet.</div>
        )}
      </section>
    </main>
  );
}
