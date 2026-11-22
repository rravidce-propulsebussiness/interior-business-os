'use client';

type ProjectChoice = { id: string; name: string };

export function BoqCreateStep({
  projects,
  projectId,
  title,
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
  saving: boolean;
  preparing: boolean;
  error: string;
  onProjectChange: (id: string) => void;
  onTitleChange: (name: string) => void;
  onContinue: () => void;
}) {
  return (
    <main className="erp-page manual-boq boq-create-step">
      <form
        className="boq-create-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saving && !preparing && projectId && title.trim()) onContinue();
        }}
      >
        <label htmlFor="boq-create-project">Project</label>
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
        <label htmlFor="boq-create-name">BOQ name</label>
        <input
          id="boq-create-name"
          value={title}
          maxLength={200}
          placeholder="Project name · Construction BOQ"
          onChange={(event) => onTitleChange(event.target.value)}
          disabled={saving}
          required
        />
        {error && (
          <p className="boq-create-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="boq-create-continue"
          type="submit"
          disabled={!projectId || !title.trim() || saving || preparing}
        >
          {saving ? 'Saving BOQ…' : preparing ? 'Preparing BOQ…' : 'Continue'}
          {!saving && !preparing && <span aria-hidden="true">→</span>}
        </button>
      </form>
    </main>
  );
}
