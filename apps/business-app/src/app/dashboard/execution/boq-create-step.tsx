'use client';

import Link from 'next/link';

type ProjectChoice = { id: string; name: string };

export function BoqCreateStep({
  projects,
  projectId,
  title,
  quoteLabel,
  floors,
  builtUpSqft,
  saving,
  preparing,
  error,
  onProjectChange,
  onTitleChange,
  onContinue,
}: {
  projects: readonly ProjectChoice[];
  projectId: string;
  title: string;
  quoteLabel?: string;
  floors?: number;
  builtUpSqft?: number;
  saving: boolean;
  preparing: boolean;
  error: string;
  onProjectChange: (id: string) => void;
  onTitleChange: (name: string) => void;
  onContinue: () => void;
}) {
  const ready = Boolean(projectId && title.trim());
  return (
    <main className="erp-page manual-boq boq-create-step">
      <header className="boq-create-hero">
        <div className="boq-create-logo" aria-hidden="true">
          ▤
        </div>
        <div>
          <p className="boq-create-eyebrow">BOQ &amp; Estimating / New BOQ</p>
          <h1>Create New BOQ</h1>
          <p>
            Link one project and its final quotation. All measurements and
            floor-wise costs belong to this BOQ.
          </p>
        </div>
      </header>
      <nav className="boq-create-progress" aria-label="BOQ creation process">
        <span className="selected">
          <b>1</b> Project &amp; Quotation
        </span>
        <span>
          <b>2</b> Floor Setup
        </span>
        <span>
          <b>3</b> Structural Measurements
        </span>
        <span>
          <b>4</b> Rates &amp; Labour
        </span>
        <span>
          <b>5</b> Final Detailed BOQ
        </span>
      </nav>
      <div className="boq-create-layout">
        <form
          className="boq-create-card"
          onSubmit={(event) => {
            event.preventDefault();
            if (!saving && !preparing && ready) onContinue();
          }}
        >
          <div className="boq-create-card-head">
            <span aria-hidden="true">▤</span>
            <div>
              <h2>Project &amp; Quotation Details</h2>
              <p>
                Select the project, confirm the linked quotation and name your
                BOQ.
              </p>
            </div>
          </div>
          <label htmlFor="boq-create-project">Project *</label>
          <select
            id="boq-create-project"
            value={projectId}
            onChange={(event) => onProjectChange(event.target.value)}
            required
            disabled={saving}
          >
            <option value="">Select project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <label htmlFor="boq-create-quotation">Linked Final Quotation</label>
          <div id="boq-create-quotation" className="boq-create-readonly">
            {quoteLabel || 'Select a project to load its final quotation'}
          </div>
          <label htmlFor="boq-create-name">BOQ Name *</label>
          <input
            id="boq-create-name"
            value={title}
            maxLength={200}
            placeholder="Project name · Detailed BOQ"
            onChange={(event) => onTitleChange(event.target.value)}
            disabled={saving}
            required
          />
          <div className="boq-create-metrics">
            <div>
              <small>Floors</small>
              <strong>{floors || '—'}</strong>
            </div>
            <div>
              <small>Built-up area</small>
              <strong>
                {builtUpSqft && builtUpSqft > 0
                  ? builtUpSqft.toLocaleString('en-IN', {
                      maximumFractionDigits: 2,
                    }) + ' sq ft'
                  : '—'}
              </strong>
            </div>
          </div>
          {error && (
            <p className="boq-create-error" role="alert">
              {error}
            </p>
          )}
          <div className="boq-create-actions">
            <Link href="/dashboard/execution/boq" className="boq-create-back">
              ← Saved BOQs
            </Link>
            <button
              className="boq-create-continue"
              type="submit"
              disabled={!ready || saving || preparing}
            >
              {saving
                ? 'Saving BOQ…'
                : preparing
                  ? 'Preparing BOQ…'
                  : 'Continue'}
              {!saving && !preparing && <span aria-hidden="true">→</span>}
            </button>
          </div>
        </form>
        <aside className="boq-create-context">
          <div className="boq-create-card-head">
            <span aria-hidden="true">♧</span>
            <div>
              <h2>One Project, One BOQ</h2>
              <p>
                Existing BOQs stay editable. A second BOQ is not generated for
                the same project.
              </p>
            </div>
          </div>
          <div className="boq-create-context-content">
            <div className="boq-create-context-row">
              <span>01</span>
              <div>
                <strong>Enter drawing measurements once</strong>
                <small>
                  Footings, columns, beams, slabs, wall sizes and finishes
                </small>
              </div>
            </div>
            <div className="boq-create-context-row">
              <span>02</span>
              <div>
                <strong>Calculate quantity and cost automatically</strong>
                <small>
                  Material recipes, RMC or site mix, steel and labour
                </small>
              </div>
            </div>
            <div className="boq-create-context-row">
              <span>03</span>
              <div>
                <strong>One detailed floor-wise report</strong>
                <small>
                  Foundation and every floor with quantities, rates and totals
                </small>
              </div>
            </div>
            <Link
              href="/dashboard/execution/boq"
              className="boq-create-existing"
            >
              Open an existing BOQ instead →
            </Link>
          </div>
        </aside>
      </div>
      <div className="boq-create-note">
        Measurements and price inputs are saved against one project BOQ.
        Structural quantities are not re-entered in another estimate or priced
        twice.
      </div>
    </main>
  );
}
