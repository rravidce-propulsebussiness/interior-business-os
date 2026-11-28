'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  CUTLIST_ITEMS,
  cutlistPanels,
  type CutlistItemKey,
  type CutlistPanel,
} from './interior-cutlist';

const STORAGE_KEY = 'business-os-interior-cutlist-v1';

export function InteriorCutlistWorkspace({
  canCreate,
}: {
  canCreate: boolean;
}) {
  const [projectName, setProjectName] = useState('Interior project');
  const [itemKey, setItemKey] = useState<CutlistItemKey>('wardrobe');
  const [width, setWidth] = useState(1200);
  const [height, setHeight] = useState(2100);
  const [depth, setDepth] = useState(600);
  const [cabinetCount, setCabinetCount] = useState(1);
  const [panels, setPanels] = useState<CutlistPanel[]>([]);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const item = useMemo(
    () =>
      CUTLIST_ITEMS.find((entry) => entry.key === itemKey) ?? CUTLIST_ITEMS[0]!,
    [itemKey],
  );

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as {
        projectName?: string;
        panels?: CutlistPanel[];
      } | null;
      if (saved?.projectName) {
        setProjectName(saved.projectName);
      }
      if (Array.isArray(saved?.panels)) {
        setPanels(saved.panels);
      }
    } catch {
      // A corrupt browser draft should not block the cutlist.
    } finally {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Allow saving only after the browser draft has been read.
      setDraftLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projectName, panels }));
  }, [draftLoaded, projectName, panels]);

  const chooseItem = (key: CutlistItemKey) => {
    const next = CUTLIST_ITEMS.find((entry) => entry.key === key)!;
    setItemKey(key);
    setWidth(next.defaults.width);
    setHeight(next.defaults.height);
    setDepth(next.defaults.depth);
  };
  const addItem = () => {
    if (!canCreate || width <= 0 || height <= 0 || depth <= 0) return;
    setPanels((current) => [
      ...current,
      ...cutlistPanels(item, { width, height, depth }, cabinetCount),
    ]);
  };
  const totalPanels = panels.reduce((sum, row) => sum + row.quantity, 0);
  const exportCsv = () => {
    const rows = [
      [
        'Code',
        'Item',
        'Panel',
        'Length (mm)',
        'Width (mm)',
        'Qty',
        'Material',
        'Edge',
      ],
      ...panels.map((row) => [
        row.code,
        row.item,
        row.panel,
        String(row.length),
        String(row.width),
        String(row.quantity),
        row.material,
        row.edge,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','),
      )
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${projectName.trim() || 'interior-cutlist'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="erp-page interior-cutlist-page">
      <header className="interior-cutlist-hero">
        <div>
          <p className="boq-register-eyebrow">
            BOQ &amp; Estimating / Interior
          </p>
          <h1>Interior Cutlist</h1>
          <p>
            Prepare cabinet panel schedules from the same Business OS workspace.
          </p>
        </div>
        <div className="interior-cutlist-actions">
          <Link className="erp-button" href="/dashboard/execution/boq">
            ← BOQ &amp; Estimating
          </Link>
          <button
            className="erp-button"
            type="button"
            onClick={exportCsv}
            disabled={!panels.length}
          >
            Export CSV
          </button>
        </div>
      </header>
      <section className="interior-cutlist-layout">
        <div className="interior-cutlist-card">
          <div className="interior-cutlist-card-heading">
            <span>01</span>
            <div>
              <h2>Cabinet details</h2>
              <p>Choose a unit and enter finished dimensions in millimetres.</p>
            </div>
          </div>
          <label className="boq-stage-field">
            <span>Project / customer</span>
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
            />
          </label>
          <label className="boq-stage-field">
            <span>Interior unit</span>
            <select
              value={itemKey}
              onChange={(event) =>
                chooseItem(event.target.value as CutlistItemKey)
              }
            >
              {CUTLIST_ITEMS.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <div className="interior-cutlist-fields">
            <label className="boq-stage-field">
              <span>Width (mm)</span>
              <input
                type="number"
                min="1"
                value={width}
                onChange={(event) => setWidth(Number(event.target.value))}
              />
            </label>
            <label className="boq-stage-field">
              <span>Height (mm)</span>
              <input
                type="number"
                min="1"
                value={height}
                onChange={(event) => setHeight(Number(event.target.value))}
              />
            </label>
            <label className="boq-stage-field">
              <span>Depth (mm)</span>
              <input
                type="number"
                min="1"
                value={depth}
                onChange={(event) => setDepth(Number(event.target.value))}
              />
            </label>
            <label className="boq-stage-field">
              <span>Cabinet quantity</span>
              <input
                type="number"
                min="1"
                value={cabinetCount}
                onChange={(event) =>
                  setCabinetCount(Number(event.target.value))
                }
              />
            </label>
          </div>
          <button
            className="boq-guided-primary"
            type="button"
            onClick={addItem}
            disabled={!canCreate}
          >
            ＋ Add to cutlist
          </button>
        </div>
        <aside className="interior-cutlist-card interior-cutlist-summary">
          <span className="interior-cutlist-summary-number">{totalPanels}</span>
          <strong>Panels in cutlist</strong>
          <small>{panels.length} cabinet entries · saved in this browser</small>
        </aside>
      </section>
      <section className="interior-cutlist-card interior-cutlist-table-card">
        <div className="interior-cutlist-card-heading">
          <span>02</span>
          <div>
            <h2>Panel schedule</h2>
            <p>
              Review the generated cutting list before sending it to production.
            </p>
          </div>
        </div>
        {panels.length ? (
          <div className="boq-volume-scroll">
            <table className="boq-volume-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Item / panel</th>
                  <th>Length</th>
                  <th>Width</th>
                  <th>Qty</th>
                  <th>Material</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {panels.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.code}</strong>
                    </td>
                    <td>
                      {row.item}
                      <small>{row.panel}</small>
                    </td>
                    <td>{row.length} mm</td>
                    <td>{row.width} mm</td>
                    <td>{row.quantity}</td>
                    <td>
                      {row.material}
                      <small>{row.edge}</small>
                    </td>
                    <td>
                      <button
                        className="boq-stage-outline"
                        type="button"
                        onClick={() =>
                          setPanels((current) =>
                            current.filter((entry) => entry.id !== row.id),
                          )
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="boq-volume-empty">
            No panels added yet. Start with a wardrobe, kitchen base or TV unit.
          </div>
        )}
        {panels.length > 0 && (
          <button
            className="boq-stage-outline"
            type="button"
            onClick={() => setPanels([])}
          >
            Clear cutlist
          </button>
        )}
      </section>
    </main>
  );
}
