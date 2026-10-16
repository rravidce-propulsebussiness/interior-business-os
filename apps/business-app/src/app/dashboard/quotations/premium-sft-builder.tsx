'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { calculateSftEstimate, type SftEstimateDetails } from '@business-os/core/sft-quotation';
import type { ConstructionRate } from '@business-os/database/construction-rates';
import type { ConstructionPackage } from '@business-os/database/construction-packages';
import { saveFloorwiseSftEstimate } from './construction-actions';

type WorkRow = {
  kind: 'floor' | 'additional';
  name: string;
  lengthFeet: string;
  widthFeet: string;
  ratePerSqft: string;
};
type SpecSection = {
  title: string;
  description: string;
  brand?: string | undefined;
  grade?: string | undefined;
  allowancePerSqft?: string | undefined;
};
type BrandKey = 'Steel' | 'Cement' | 'Tiles' | 'Paint';
const brandKeys: BrandKey[] = ['Steel', 'Cement', 'Tiles', 'Paint'];
const floorNames = [
  'Ground Floor', 'First Floor', 'Second Floor', 'Third Floor',
  'Fourth Floor', 'Fifth Floor', 'Sixth Floor', 'Seventh Floor',
];
const shelvesName = 'Shelves & Sajjas';
const money = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(value);
const decimalArea = (value: number) =>
  Number.isFinite(value) && value > 0 ? String(Number(value.toFixed(2))) : '';
const floorRow = (name: string, ratePerSqft: string): WorkRow => ({
  kind: 'floor', name, lengthFeet: '', widthFeet: '1', ratePerSqft,
});
const matchesBrand = (category: string, key: BrandKey) => {
  const normalized = category.toLowerCase();
  if (key === 'Steel') return /steel|tmt|reinforcement/.test(normalized);
  if (key === 'Cement') return /cement/.test(normalized);
  if (key === 'Tiles') return /tile|flooring/.test(normalized);
  return /paint|emulsion/.test(normalized);
};
const overrideTitle = (key: BrandKey) => key + ' — quotation brand override';
const storedBrand = (
  key: BrandKey, sections: SpecSection[], materials: SftEstimateDetails['materials'],
) => {
  const override = sections.find((s) => s.title === overrideTitle(key));
  if (override?.brand) return override.brand;
  const material = materials.find((m) => matchesBrand(m.category, key));
  if (material) return material.name;
  const section = sections.find((s) => matchesBrand(s.title, key) && s.brand?.trim());
  return section?.brand ?? '';
};

export function PremiumSftBuilder({
  rates, packages, initialSchedule, revisionId, version, selectedPackageId,
}: {
  rates: ConstructionRate[];
  packages: ConstructionPackage[];
  initialSchedule: SftEstimateDetails | null;
  revisionId: string;
  version: number;
  selectedPackageId?: string | undefined;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const activePackages = packages.filter((item) => item.status === 'active');
  const activeRates = rates.filter((item) => item.status === 'active');
  const savedPackage = activePackages.find((item) =>
    item.id === initialSchedule?.package?.id ||
    item.code === initialSchedule?.package?.code);
  const selectedPackage = activePackages.find((item) => item.id === selectedPackageId) ??
    savedPackage;
  const replacePackage = Boolean(selectedPackage && savedPackage?.id !== selectedPackage.id);
  const packageId = selectedPackage?.id ?? '';
  const packageRate = selectedPackage?.ratePerSqft ?? '';

  const [rows, setRows] = useState<WorkRow[]>(() => {
    if (!initialSchedule?.rows.length) return [floorRow(floorNames[0]!, packageRate)];
    return initialSchedule.rows.map((item) => ({
      kind: item.kind ?? 'floor',
      name: item.name,
      lengthFeet: item.lengthFeet,
      widthFeet: item.widthFeet,
      ratePerSqft: replacePackage && (item.kind ?? 'floor') === 'floor'
        ? packageRate : item.ratePerSqft,
    }));
  });
  const [sections, setSections] = useState<SpecSection[]>(() => {
    if (selectedPackage && (replacePackage || !initialSchedule?.sections?.length)) {
      return [
        { title: 'Package scope & inclusions', description: selectedPackage.description },
        ...selectedPackage.specSections.map((item) => ({
          title: item.title, description: item.description,
          brand: item.brand, grade: item.grade, allowancePerSqft: item.allowancePerSqft,
        })),
      ].slice(0, 18);
    }
    return initialSchedule?.sections?.map((s) => ({ ...s })) ?? [];
  });
  const [materialIds, setMaterialIds] = useState<string[]>(() =>
    (replacePackage ? [] : initialSchedule?.materials ?? []).flatMap((material) => {
      const found = activeRates.find((rate) =>
        rate.category === material.category &&
        rate.name === material.name &&
        rate.specification === material.specification);
      return found ? [found.id] : [];
    }));
  const [brandEditorOpen, setBrandEditorOpen] = useState(false);
  const [brandChanges, setBrandChanges] = useState<Partial<Record<BrandKey, string>>>({});
  const [brandError, setBrandError] = useState('');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);

  const floors = rows.filter((item) => item.kind === 'floor');
  const shelf = rows.find((item) => item.kind === 'additional' && item.name === shelvesName);
  const otherWorks = rows.filter((item) =>
    item.kind === 'additional' && item.name !== shelvesName);
  const usedMaterials = activeRates.filter((rate) => materialIds.includes(rate.id))
    .map((item) => ({
      category: item.category, name: item.name, specification: item.specification,
    }));
  const archived = (replacePackage ? [] : initialSchedule?.materials ?? []).filter(
    (item) => !activeRates.some((rate) =>
      rate.category === item.category && rate.name === item.name &&
      rate.specification === item.specification));
  const quote = (() => {
    try {
      return calculateSftEstimate(
        { rows, materialIds, packageId: packageId || null, sections }, usedMaterials,
      );
    } catch {
      return null;
    }
  })();
  const canSave = Boolean(quote) && !pending &&
    archived.length === 0 &&
    (activePackages.length === 0 || Boolean(selectedPackage));
  const totalArea = floors.reduce((sum, item) =>
    sum + Number(item.lengthFeet || 0) * Number(item.widthFeet || 0), 0);
  const packageCost = floors.reduce((sum, item) =>
    sum + Number(item.lengthFeet || 0) * Number(item.widthFeet || 0) *
      Number(item.ratePerSqft || 0), 0);
  const additionalCost = rows.filter((item) => item.kind === 'additional')
    .reduce((sum, item) => sum +
      Number(item.lengthFeet || 0) * Number(item.widthFeet || 0) *
      Number(item.ratePerSqft || 0), 0);
  const liveTotal = quote ? Number(quote.total) : packageCost + additionalCost;

  const setFloorCount = (count: number) => {
    const chosen = Math.max(1, Math.min(8, count));
    const nextFloors = Array.from({ length: chosen }, (_, index) =>
      floors[index] ?? floorRow(floorNames[index]!, packageRate));
    setRows([...nextFloors, ...rows.filter((item) => item.kind === 'additional')]);
    setSaved(false);
    setMessage('');
  };
  const changeArea = (index: number, value: string) => {
    // The SFT engine measures length × width. Use width=1 for a directly
    // entered built-up area, without changing the persisted schema.
    setRows((old) => old.map((row, i) => {
      if (i !== index) return row;
      return { ...row, lengthFeet: value, widthFeet: '1' };
    }));
    setSaved(false);
  };
  const toggleShelves = (enabled: boolean) => {
    setRows((old) => enabled
      ? [...old, {
          kind: 'additional', name: shelvesName, lengthFeet: '',
          widthFeet: '', ratePerSqft: '',
        }]
      : old.filter((row) => !(row.kind === 'additional' && row.name === shelvesName)));
    setSaved(false);
  };
  const updateWork = (name: string, key: keyof WorkRow, value: string) => {
    setRows((old) => old.map((row) => row.kind === 'additional' && row.name === name
      ? { ...row, [key]: value } : row));
    setSaved(false);
  };
  const applyBrands = () => {
    const changes = Object.entries(brandChanges) as [BrandKey, string][];
    const valid = changes.filter(([, value]) => value.trim().length > 0);
    let nextSections = sections.map((s) => ({ ...s }));
    for (const [key, entered] of valid) {
      const brand = entered.trim();
      const priorIndex = nextSections.findIndex((s) => s.title === overrideTitle(key));
      if (priorIndex >= 0) {
        nextSections[priorIndex] = { ...nextSections[priorIndex]!, brand };
      } else if (nextSections.length < 18) {
        nextSections.push({
          title: overrideTitle(key),
          description: 'Selected exclusively for this customer quotation.',
          brand,
        });
      } else {
        // Keep the company package scope intact even for legacy 18-section
        // brochures. Append an explicit, identifiable quote-only override.
        const index = nextSections.findIndex((s) => matchesBrand(s.title, key));
        if (index < 0) {
          setBrandError('Too many specification sections. Remove one before adding ' + key + '.');
          return;
        }
        const section = nextSections[index]!;
        const marker = 'Quote-only ' + key + ' brand: ';
        const filtered = section.description.split('\n')
          .filter((line) => !line.startsWith(marker)).join('\n');
        nextSections[index] = {
          ...section,
          description: (filtered ? filtered + '\n' : '') + marker + brand,
        };
      }
    }
    setSections(nextSections);
    if (valid.length) {
      setMaterialIds((ids) => ids.filter((id) => {
        const rate = activeRates.find((r) => r.id === id);
        return !rate || !valid.some(([key]) => matchesBrand(rate.category, key));
      }));
    }
    setBrandEditorOpen(false);
    setBrandChanges({});
    setBrandError('');
    setSaved(false);
    setMessage('');
  };
  const save = () => {
    if (!canSave) return;
    startTransition(async () => {
      const result = await saveFloorwiseSftEstimate(revisionId, version, {
        rows,
        materialIds,
        packageId: packageId || null,
        sections: sections.filter((section) => Boolean(
          section.description.trim() || section.brand?.trim() ||
          section.grade?.trim() || section.allowancePerSqft?.trim())),
      });
      setMessage(result.message);
      setSaved(Boolean(result.id));
      if (result.id) router.refresh();
    });
  };

  return (
    <div className="qs-compact-builder">
      <section className="qs-build-panel">
        <div className="qs-build-title"><span className="qs-build-number">02</span>
          <div><h3>Number of floors</h3><p>Choose G, G+1, G+2 or more. Enter built-up area for each floor.</p></div>
        </div>
        <div className="qs-build-floor-options" role="group" aria-label="Number of floors">
          {[1, 2, 3, 4].map((count) => (
            <button type="button" key={count}
              className={'qs-build-floor-option' + (floors.length === count ? ' selected' : '')}
              aria-pressed={floors.length === count}
              onClick={() => setFloorCount(count)}>
              {count === 1 ? 'G only' : 'G+' + (count - 1)}
            </button>
          ))}
          {floors.length > 4 && <button type="button" className="qs-build-floor-option selected"
            aria-pressed="true" onClick={() => setFloorCount(floors.length)}>
            G+{floors.length - 1}</button>}
        </div>
        <div className="qs-build-floor-list">
          {floors.map((floor, index) => {
            const rowIndex = rows.indexOf(floor);
            return <div className="qs-build-floor" key={index}>
              <span className="qs-build-floor-badge">{String(index + 1).padStart(2, '0')}</span>
              <strong>{floor.name}</strong>
              <label><span className="sr-only">{floor.name} built-up area</span>
                <input aria-label={floor.name + ' built-up area'} type="number"
                  min="0.01" max="9999.99" step="0.01" inputMode="decimal"
                  placeholder="Area" value={decimalArea(
                    Number(floor.lengthFeet || 0) * Number(floor.widthFeet || 0))}
                  onChange={(event) => changeArea(rowIndex, event.target.value)}/>
                <small>SFT</small>
              </label>
            </div>;
          })}
        </div>
        <button type="button" className="qs-build-add-floor" disabled={floors.length >= 8 || rows.length >= 18}
          onClick={() => setFloorCount(floors.length + 1)}>+ Add another floor</button>
        <div className="qs-build-extra">
          <label className="qs-build-switch-label">
            <input type="checkbox" checked={Boolean(shelf)}
              onChange={(event) => toggleShelves(event.target.checked)}/>
            <span>Shelves &amp; Sajjas</span>
            <small>Optional work</small>
          </label>
          {shelf && <div className="qs-build-extra-fields">
            <label>Length (ft)<input aria-label="Shelves length in feet" type="number"
              inputMode="decimal" min="0.01" max="9999.99" step="0.01"
              value={shelf.lengthFeet} onChange={(e) => updateWork(shelvesName, 'lengthFeet', e.target.value)} /></label>
            <label>Width (ft)<input aria-label="Shelves width in feet" type="number"
              inputMode="decimal" min="0.01" max="9999.99" step="0.01"
              value={shelf.widthFeet} onChange={(e) => updateWork(shelvesName, 'widthFeet', e.target.value)} /></label>
            <label>₹ / SFT<input aria-label="Shelves rate per square foot" type="number"
              inputMode="decimal" min="0" max="999999.99" step="0.01"
              value={shelf.ratePerSqft} onChange={(e) => updateWork(shelvesName, 'ratePerSqft', e.target.value)} /></label>
          </div>}
          {otherWorks.map((work) => <div className="qs-build-other-work" key={work.name}>
            <strong>{work.name}</strong>
            <div className="qs-build-extra-fields">
              <label>Length (ft)<input aria-label={work.name + ' length in feet'}
                type="number" min="0.01" max="9999.99" step="0.01" value={work.lengthFeet}
                onChange={(e) => updateWork(work.name, 'lengthFeet', e.target.value)}/></label>
              <label>Width (ft)<input aria-label={work.name + ' width in feet'}
                type="number" min="0.01" max="9999.99" step="0.01" value={work.widthFeet}
                onChange={(e) => updateWork(work.name, 'widthFeet', e.target.value)}/></label>
              <label>₹ / SFT<input aria-label={work.name + ' rate'}
                type="number" min="0" max="999999.99" step="0.01" value={work.ratePerSqft}
                onChange={(e) => updateWork(work.name, 'ratePerSqft', e.target.value)}/></label>
            </div>
          </div>)}
        </div>
      </section>
      <section className="qs-build-panel">
        <div className="qs-build-title"><span className="qs-build-number">03</span>
          <div><h3>Material brands</h3><p>Use the package brands, or edit only what this quotation needs.</p></div>
        </div>
        <div className="qs-build-brand-head">
          <span>Included package specifications</span>
          <button type="button" className="qs-build-edit-brands"
            onClick={() => setBrandEditorOpen(true)}>✎ Edit brands</button>
        </div>
        <div className="qs-build-brand-grid">
          {brandKeys.map((key) => <div className="qs-build-brand" key={key}>
            <small>{key}</small><strong>{storedBrand(key, sections, initialSchedule?.materials ?? []) || 'As per package'}</strong>
          </div>)}
        </div>
        <p className="qs-build-note">Changes are saved only in this quotation's specification snapshot. Company packages remain unchanged.</p>
        {archived.length > 0 && <p className="qs-build-warning" role="alert">A previously selected material is no longer active. Contact the pricing administrator before resaving.</p>}
      </section>
      <div className="qs-build-total">
        <div className="qs-build-total-stats">
          <span>{floors.length} floor{floors.length === 1 ? '' : 's'}</span>
          <span>{decimalArea(totalArea) || '0'} SFT</span>
          {shelf && <span>+ Shelves</span>}
        </div>
        <div className="qs-build-total-bottom">
          <div><small>Quotation estimate</small>
            <strong>{liveTotal > 0 ? money(liveTotal) : 'Enter floor area'}</strong></div>
          <button type="button" data-studio-save="quote" className="qs-build-save"
            disabled={!canSave} onClick={save}>{pending ? 'Saving…' : 'Save quotation →'}</button>
        </div>
        {message && <p className="qs-build-result" role="status">{message}</p>}
        {saved && <p className="qs-build-success">Saved. Use Preview &amp; Share above to share this quotation.</p>}
      </div>
      {brandEditorOpen && <div className="qs-build-brand-overlay" role="presentation"
        onClick={(event) => { if (event.target === event.currentTarget) setBrandEditorOpen(false); }}>
        <section className="qs-build-brand-sheet" role="dialog" aria-modal="true" aria-label="Edit brands for this quotation">
          <div className="qs-build-sheet-handle" aria-hidden="true"/>
          <div className="qs-build-sheet-head"><div><h3>Edit material brands</h3>
            <p>Only this quotation changes—not the company's package.</p></div>
            <button type="button" aria-label="Close brand editor"
              onClick={() => setBrandEditorOpen(false)}>✕</button></div>
          {brandKeys.map((key) => {
            const options = [...new Set(activeRates.filter((rate) =>
              matchesBrand(rate.category, key)).map((rate) => rate.name))];
            const current = storedBrand(key, sections, initialSchedule?.materials ?? []);
            return <label className="qs-build-brand-field" key={key}>{key}
              <input type="text" maxLength={120} list={'qs-brand-options-' + key}
                value={brandChanges[key] ?? current}
                placeholder="Brand as per package"
                onChange={(event) => { setBrandChanges((old) => ({ ...old, [key]: event.target.value })); setBrandError(''); }}/>
              <datalist id={'qs-brand-options-' + key}>
                {options.map((brand) => <option key={brand} value={brand}/>)}
              </datalist>
            </label>;
          })}
          {brandError && <p role="alert" className="qs-build-warning">{brandError}</p>}
          <div className="qs-build-sheet-actions">
            <button type="button" onClick={() => { setBrandEditorOpen(false); setBrandChanges({}); }}>Cancel</button>
            <button type="button" onClick={applyBrands}>Apply to this quote</button>
          </div>
          <p className="qs-build-sheet-note">Tap Save quotation afterward to persist these changes.</p>
        </section>
      </div>}
    </div>
  );
}
