'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { passProjectStageChecks } from './[id]/site/stage-checklist-actions';

type Check = {
  index: number;
  title: string;
  status: string;
  photoId: string;
  notes: string;
};
type Photo = { id: string; filename: string };
type Result = { saved: boolean; message: string };
export function BulkStageChecks({
  projectId,
  stageId,
  checks,
  photos,
  workCompleted,
  workTotal,
  stageStatus,
  canEdit,
}: {
  projectId: string;
  stageId: string;
  checks: Check[];
  photos: Photo[];
  workCompleted: number;
  workTotal: number;
  stageStatus: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const outstanding = checks.filter(
    (check) => check.status !== 'passed' && check.status !== 'completed',
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [sharedPhoto, setSharedPhoto] = useState('');
  const [attachFile, setAttachFile] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [finish, setFinish] = useState(true);
  const chosen = outstanding.filter((c) => selected.includes(c.index));
  const finishEligible =
    stageStatus === 'in_progress' &&
    workCompleted === workTotal &&
    workTotal > 0 &&
    chosen.length === outstanding.length &&
    chosen.length > 0;
  const [result, submit, pending] = useActionState(
    async (_previous: Result, data: FormData) => {
      const output = await passProjectStageChecks(projectId, stageId, data);
      if (output.saved) {
        setSelected([]);
        setSharedPhoto('');
        setConfirmed(false);
        router.refresh();
      }
      return output;
    },
    { saved: false, message: '' },
  );
  if (!canEdit || !outstanding.length) return null;
  const allSelected = outstanding.every((item) =>
    selected.includes(item.index),
  );
  return (
    <details className="pv2-bulk-checks">
      <summary>
        ✓ Select multiple checks · Pass together{' '}
        <span>{outstanding.length} pending</span>
      </summary>
      <form className="pv2-bulk-form" action={submit}>
        <p className="pv2-hint">
          Select only inspections you have actually verified. Each selected
          check needs a relevant photo. This does not certify the construction
          stage.
        </p>
        <button
          type="button"
          className="pv2-bulk-toggle"
          onClick={() =>
            setSelected(allSelected ? [] : outstanding.map((x) => x.index))
          }
        >
          {allSelected ? 'Clear selection' : 'Select all pending checks'}
        </button>
        <div className="pv2-bulk-list">
          {outstanding.map((c) => (
            <label
              key={c.index}
              className={
                'pv2-bulk-row ' +
                (selected.includes(c.index) ? 'is-selected' : '')
              }
            >
              <input
                type="checkbox"
                checked={selected.includes(c.index)}
                onChange={(e) =>
                  setSelected((prev) =>
                    e.target.checked
                      ? [...prev, c.index]
                      : prev.filter((i) => i !== c.index),
                  )
                }
              />
              <span>
                <strong>{c.title}</strong>
                <small>
                  {c.status === 'recheck'
                    ? 'Recheck required'
                    : c.status === 'failed'
                      ? 'Failed · inspect again'
                      : 'Pending'}
                </small>
                {c.photoId && <small>Existing evidence attached</small>}
              </span>
            </label>
          ))}
        </div>
        {!!chosen.length && (
          <>
            <label className="pv2-bulk-label">
              Use one photo documenting all selected checks (optional)
              <select
                value={sharedPhoto}
                onChange={(e) => {
                  setSharedPhoto(e.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="">Keep each check's existing evidence</option>
                {photos.map((photo) => (
                  <option key={photo.id} value={photo.id}>
                    {photo.filename}
                  </option>
                ))}
              </select>
            </label>
            <label className="pv2-bulk-attach">
              <input
                type="checkbox"
                checked={attachFile}
                onChange={(e) => {
                  setAttachFile(e.target.checked);
                  setConfirmed(false);
                }}
              />{' '}
              Upload a new shared inspection photo
            </label>
            {attachFile && (
              <label className="pv2-bulk-label">
                Inspection photo
                <input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                />
              </label>
            )}
            {(!!sharedPhoto || attachFile) && chosen.length > 1 && (
              <label className="pv2-bulk-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  I verified that this photo clearly documents every selected
                  check.
                </span>
              </label>
            )}
            <label className="pv2-bulk-label">
              Notes (optional)
              <textarea
                name="batch_note"
                rows={2}
                maxLength={2000}
                placeholder="Inspection observations applying to selected checks"
              />
            </label>
            <input
              type="hidden"
              name="items"
              value={JSON.stringify(
                chosen.map((c) => ({
                  index: c.index,
                  title: c.title,
                  photo_id: c.photoId || null,
                  note: c.notes,
                })),
              )}
            />
            <input type="hidden" name="shared_photo_id" value={sharedPhoto} />
            <input
              type="hidden"
              name="confirm_shared"
              value={confirmed ? 'true' : 'false'}
            />
            {finishEligible && (
              <label className="pv2-bulk-confirm">
                <input
                  type="checkbox"
                  checked={finish}
                  onChange={(e) => setFinish(e.target.checked)}
                />
                <span>
                  Also finish site field work and request formal QC. This
                  unlocks the next eligible stage without marking QC approved.
                </span>
              </label>
            )}
            <input
              type="hidden"
              name="finish"
              value={finishEligible && finish ? 'true' : 'false'}
            />
            <button
              className="pv2-button pv2-primary"
              type="submit"
              disabled={
                pending ||
                !selected.length ||
                (chosen.length > 1 &&
                  (!!sharedPhoto || attachFile) &&
                  !confirmed) ||
                (!sharedPhoto && !attachFile && chosen.some((c) => !c.photoId))
              }
            >
              {pending
                ? 'Saving selected checks…'
                : finishEligible && finish
                  ? 'Pass ' + chosen.length + ' & request QC'
                  : 'Pass ' + chosen.length + ' selected checks'}
            </button>
            {!sharedPhoto && !attachFile && chosen.some((c) => !c.photoId) && (
              <p className="pv2-hint">
                Some selected checks have no photo yet. Choose a relevant
                existing photo or upload one.
              </p>
            )}
          </>
        )}
        {result.message && (
          <p
            role="status"
            className={'pv2-form-feedback ' + (result.saved ? 'good' : 'bad')}
          >
            {result.message}
          </p>
        )}
      </form>
    </details>
  );
}
