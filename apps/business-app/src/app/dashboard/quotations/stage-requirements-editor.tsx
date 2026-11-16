'use client';

import { useId, useState } from 'react';
import {
  defaultStageRequirements,
  reconcileStageExecutionFlow,
  type StageRequirements,
} from '@business-os/core/quotation-stage-requirements';
import { milestoneConstructionStages } from '@business-os/core/construction-payment-schedule';
import { StageExecutionFlowEditor } from './stage-execution-flow-editor';

const fields = [
  {
    key: 'work',
    title: 'Work items',
    hint: 'Activities completed one by one on site',
  },
  {
    key: 'materials',
    title: 'Materials to arrange',
    hint: 'Choose quantities separately when requesting materials',
  },
  {
    key: 'checks',
    title: 'Quality checks & tests',
    hint: 'Photo evidence and formal approval remain separate',
  },
  {
    key: 'reports',
    title: 'Test & QC reports',
    hint: 'Supporting report requirements for site tests and QC evidence',
  },
] as const;
type Field = (typeof fields)[number]['key'];

function Section({
  field,
  title,
  hint,
  base,
  requirements,
  locked,
  onUpdate,
  editable,
}: {
  field: Field;
  title: string;
  hint: string;
  base: readonly string[];
  requirements: StageRequirements;
  locked: boolean;
  editable: boolean;
  onUpdate: (next: StageRequirements) => void;
}) {
  const id = useId();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editError, setEditError] = useState('');
  const current = requirements[field];
  const available = base.filter((label) => !current.includes(label));
  const minimum = field === 'checks' ? 3 : 2;

  const cancelEdit = () => {
    setEditing(null);
    setDraft('');
    setEditError('');
  };

  const saveEdit = () => {
    if (editing === null) return;
    const entered = draft.replace(/\s+/g, ' ').trim();
    const position = current.indexOf(editing);
    if (position < 0) {
      cancelEdit();
      return;
    }
    if (entered.length < minimum || entered.length > 180) {
      setEditError('Enter a name between ' + minimum + ' and 180 characters.');
      return;
    }
    if (
      current.some(
        (label, index) =>
          index !== position && label.toLowerCase() === entered.toLowerCase(),
      )
    ) {
      setEditError('This item is already selected.');
      return;
    }
    if (
      entered !== editing &&
      base.some(
        (label) =>
          label !== editing && label.toLowerCase() === entered.toLowerCase(),
      )
    ) {
      setEditError(
        'This standard item is already available. Select it instead.',
      );
      return;
    }
    if (entered !== editing) {
      const updated = [...current];
      updated[position] = entered;
      onUpdate({ ...requirements, [field]: updated });
    }
    cancelEdit();
  };

  const add = () => {
    const entered = name.replace(/\s+/g, ' ').trim();
    if (
      entered.length < minimum ||
      entered.length > 180 ||
      current.length >= 50 ||
      current.some((label) => label.toLowerCase() === entered.toLowerCase())
    )
      return;
    onUpdate({ ...requirements, [field]: [...current, entered] });
    setName('');
  };

  return (
    <details className="qs-stage-requirements-section">
      <summary>
        <span>{title}</span>
        <small>{current.length} selected</small>
      </summary>
      <p>
        {hint}
        {locked
          ? ' · Required structural checks cannot be removed or renamed.'
          : ''}
      </p>
      <div className="qs-stage-requirements-items">
        {current.map((label, index) => {
          const required = locked && base.includes(label);
          const checkboxId = id + '-' + field + '-' + index;
          const editingThis = editing === label;
          return (
            <div key={label} className="qs-stage-requirement-option">
              <input
                id={checkboxId}
                type="checkbox"
                checked
                disabled={
                  !editable ||
                  required ||
                  (field === 'work' && current.length === 1)
                }
                onChange={() => {
                  if (editingThis) cancelEdit();
                  if (
                    !required &&
                    !(field === 'work' && current.length === 1)
                  ) {
                    onUpdate({
                      ...requirements,
                      [field]: current.filter((item) => item !== label),
                    });
                  }
                }}
              />
              {editingThis ? (
                <div className="qs-stage-item-inline-edit">
                  <input
                    type="text"
                    autoFocus
                    maxLength={180}
                    aria-label={'Edit ' + title.toLowerCase() + ': ' + label}
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setEditError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        saveEdit();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelEdit();
                      }
                    }}
                  />
                  <div className="qs-stage-item-edit-actions">
                    <button type="button" onClick={saveEdit}>
                      Save item
                    </button>
                    <button type="button" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                  {editError && (
                    <small role="alert" className="qs-stage-item-error">
                      {editError}
                    </small>
                  )}
                </div>
              ) : (
                <>
                  <label htmlFor={checkboxId}>{label}</label>
                  {required ? (
                    <small>Required</small>
                  ) : (
                    editable && (
                      <button
                        type="button"
                        className="qs-stage-item-edit-button"
                        aria-label={'Edit ' + label}
                        title={'Edit ' + label}
                        onClick={() => {
                          setEditing(label);
                          setDraft(label);
                          setEditError('');
                        }}
                      >
                        ✎ Edit
                      </button>
                    )
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {available.length > 0 && (
        <details className="qs-stage-available">
          <summary>Add from standard items ({available.length})</summary>
          <div className="qs-stage-requirements-items">
            {available.map((label) => (
              <label
                key={label}
                className="qs-stage-requirement-option qs-stage-available-option"
              >
                <input
                  type="checkbox"
                  checked={false}
                  disabled={!editable}
                  onChange={() =>
                    onUpdate({ ...requirements, [field]: [...current, label] })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </details>
      )}
      {editable && (
        <div className="qs-stage-add-line">
          <input
            aria-label={'New ' + title.toLowerCase()}
            maxLength={180}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
            placeholder={
              'Add a custom ' + title.toLowerCase().replace(/s$/, '')
            }
          />
          <button
            type="button"
            onClick={add}
            disabled={name.trim().length < minimum || current.length >= 50}
          >
            + Add
          </button>
        </div>
      )}
    </details>
  );
}

export function StageRequirementsEditor({
  code,
  value,
  editable,
  onChange,
  onApplyRelated,
  relatedCount,
  payments = [],
}: {
  code: string;
  value: StageRequirements | undefined;
  editable: boolean;
  onChange: (value: StageRequirements) => void;
  onApplyRelated?: (value: StageRequirements) => void;
  relatedCount: number;
  payments?: { index: number; name: string; percent: string }[];
}) {
  const defaults = defaultStageRequirements(code);
  const requirements = value ?? defaults;
  const template = milestoneConstructionStages().find(
    (stage) => stage.code === code.split('/')[0],
  );
  const structural = template?.holdPoint === 'structural';
  const title = code.replaceAll('_', ' ').replace('/', ' · ');

  return (
    <div className="qs-stage-requirements-editor">
      <div className="qs-stage-requirements-title">
        <strong>{title}</strong>
        <small>{value ? 'Project customized' : 'Standard requirements'}</small>
      </div>
      <StageExecutionFlowEditor
        code={code}
        value={requirements}
        payments={payments}
        editable={editable}
        onChange={onChange}
      />
      <details className="qs-stage-requirements-library">
        <summary>Manage included work, materials, checks & reports</summary>
        <p className="qs-stage-requirements-hint">
          Choose or rename the available items here. Arrange their execution
          order above. Site test and QC evidence is recorded against the
          corresponding check rather than as a second approval.
        </p>
        {fields.map((section) => (
          <Section
            key={section.key}
            field={section.key}
            title={section.title}
            hint={section.hint}
            base={defaults[section.key]}
            requirements={requirements}
            locked={section.key === 'checks' && Boolean(structural)}
            editable={editable}
            onUpdate={(next) =>
              onChange(reconcileStageExecutionFlow(requirements, next))
            }
          />
        ))}
      </details>
      {editable && (
        <div className="qs-stage-requirements-actions">
          {value && (
            <button type="button" onClick={() => onChange(defaults)}>
              Restore standard requirements for this stage
            </button>
          )}
          {relatedCount > 1 && onApplyRelated && (
            <button type="button" onClick={() => onApplyRelated(requirements)}>
              Apply these requirements to all {relatedCount}{' '}
              {(code.split('/')[0] ?? '').replaceAll('_', ' ')} floors
            </button>
          )}
        </div>
      )}
      <p className="qs-stage-requirements-foot">
        Changes to work, materials, checks and reports are saved with the
        payment schedule. These project requirements become construction work,
        material planning and QC guidance after the accepted quotation is
        converted. Changes to scope or cost require a quotation revision.
        Mandatory structural approvals cannot be removed.
      </p>
    </div>
  );
}
