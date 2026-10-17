'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ConstructionRate } from '@business-os/database/construction-rates';
import type { ConstructionPackage } from '@business-os/database/construction-packages';
import { PremiumSftBuilder } from './premium-sft-builder';
import type { SftEstimateDetails } from '@business-os/core/sft-quotation';
import type { CustomBrandQuote } from '@business-os/core/custom-brand-quote';
import { QuotationPdfControls } from './quotation-pdf-controls';
import {
  previewConstructionPackage,
  saveCustomBrandQuote,
} from './construction-actions';

const money = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    v,
  );
const field =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900';

function CustomizedQuote({
  rates, revisionId, version, quoteNumber, canSharePdf, initialQuote,
}: {
  rates: ConstructionRate[];
  revisionId: string;
  version: number;
  quoteNumber: string;
  canSharePdf: boolean;
  initialQuote: CustomBrandQuote | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [savedVersion, setSavedVersion] = useState(version);
  useEffect(() => {
    setSavedVersion(v => Math.max(v, version));
  }, [version]);
  const [area, setArea] = useState(initialQuote?.areaSqft ?? '');
  const [chosen, setChosen] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialQuote?.selections.map(item => [item.category, item.id]) ??
      rates.filter(rate => rate.status === 'active' && rate.isDefault)
        .map(rate => [rate.category,rate.id])));
  const [dirty, setDirty] = useState(!initialQuote);
  const [message, setMessage] = useState('');
  const [verified, setVerified] = useState<{rate: string; total: string} | null>(null);
  const active = rates.filter(r => r.status === 'active' && Number(r.ratePerSqft) >= 0);
  const categories = [...new Set(active.map(r => r.category))].sort();
  const selected = categories.map(category =>
    active.find(r => r.category === category && r.id === chosen[category])).filter(
      (value): value is ConstructionRate => Boolean(value));
  const ids = selected.map(r => r.id);
  const calculatedRate = selected.reduce((total, r) => total + Number(r.ratePerSqft), 0);
  const estimatedTotal = Number(area) * calculatedRate;
  const valid = /^([1-9]\d{0,5}|0)(\.\d{1,2})?$/.test(area) &&
    Number(area) > 0 && Number(area) <= 1000000;
  // Show calculations as guidance, but save always re-prices using tenant DB rows.
  const eligible = valid && selected.length > 0 && selected.length <= 20 && calculatedRate > 0;
  const resetPreview = () => {setDirty(true);setVerified(null);setMessage('');};

  function submit(save: boolean) {
    if (!eligible || pending) return;
    setMessage('');
    start(async () => {
      try {
        if (!save) {
          const result = await previewConstructionPackage(revisionId, {ids, areaSqft: area});
          setMessage(result.message);
          setVerified(result.total && result.ratePerSqft
            ? {total: result.total, rate: result.ratePerSqft} : null);
        } else {
          const result = await saveCustomBrandQuote(
            revisionId, savedVersion, {ids, areaSqft: area},
          );
          setMessage(result.message);
          if (result.id) {
            setDirty(false);
            setVerified({rate: calculatedRate.toFixed(2), total: result.total ?? ''});
            setSavedVersion(result.version ?? savedVersion + 1);
            router.refresh();
          }
        }
      } catch {
        setMessage('The quotation could not be updated. Reload and try again.');
      }
    });
  }
  return <div className="qs-custom-price-workspace">
    <div className="qs-custom-intro">
      <div><span className="qs-custom-eyebrow">CALCULATED PACKAGE</span>
        <h3>Custom Quote · Choose customer brands</h3>
        <p>Pick one brand per material category. Each cost per SFT comes from
          the company’s saved purchase-unit price × consumption per SFT.</p>
      </div>
      <div className="qs-custom-area">
        <label htmlFor="qs-custom-area">Built-up construction area (SFT)</label>
        <input id="qs-custom-area" type="number" className={field}
          min=".01" max="1000000" step=".01" value={area}
          placeholder="e.g. 3200"
          onChange={event => {setArea(event.target.value);resetPreview();}}/>
      </div>
    </div>
    {categories.length === 0 ? (
      <p className="qs-custom-empty">No material prices configured for this company.
        Open Packages → Custom Quote → Manage Brand &amp; Unit Prices to add material options.</p>
    ) : (
      <div className="qs-custom-brand-grid">
        {categories.map(category => {
          const options = active.filter(rate => rate.category === category);
          const selectedRate = options.find(rate => rate.id === chosen[category]);
          return <div className="qs-custom-brand" key={category}>
            <div className="qs-custom-brand-top">
              <span className="qs-custom-category">{category}</span>
              <span className="qs-custom-price">{selectedRate ? money(Number(selectedRate.ratePerSqft)) + '/SFT' : 'Not included'}</span>
            </div>
            <label>
              <span className="sr-only">Select {category} brand</span>
              <select className={field} value={chosen[category] ?? ''}
                onChange={event => {
                  setChosen(current => ({...current,[category]:event.target.value}));
                  resetPreview();
                }}>
                <option value="">Select brand / exclude</option>
                {options.map(option => <option key={option.id} value={option.id}>
                  {option.name} — {money(Number(option.unitPrice ?? option.ratePerSqft))}/{option.priceUnit ?? 'sqft'}
                </option>)}
              </select>
            </label>
            {selectedRate && <>
              <p className="qs-custom-formula">
                {money(Number(selectedRate.unitPrice ?? selectedRate.ratePerSqft))}
                /{selectedRate.priceUnit ?? 'sqft'} × {selectedRate.consumptionPerSqft ?? '1'}
                {' '}{selectedRate.priceUnit ?? 'sqft'}/SFT =
                <strong> {money(Number(selectedRate.ratePerSqft))}/SFT</strong>
              </p>
              {selectedRate.specification && <p className="qs-custom-spec">{selectedRate.specification}</p>}
            </>}
          </div>;
        })}
      </div>
    )}
    <div className="qs-custom-totals">
      <div>
        <p>{selected.length} material categories selected</p>
        <strong>{money(calculatedRate)} <small>per SFT</small></strong>
        <span>× {Number(area || 0).toLocaleString('en-IN')} SFT</span>
        <h3>{eligible ? money(estimatedTotal) : 'Select area and brands'}</h3>
        <small>Only selected categories are included; add labour, overhead and other
          costs as priced categories if they belong in this quote.</small>
      </div>
      <div className="qs-custom-actions">
        <button type="button" disabled={!eligible || pending}
          onClick={() => submit(false)} className="qs-custom-verify">
          {pending ? 'Calculating…' : 'Verify unit pricing'}
        </button>
        <button data-studio-save="quote" type="button" disabled={!eligible || pending}
          onClick={() => submit(true)} className="qs-custom-save">
          {pending ? 'Saving…' : 'Save quotation →'}
        </button>
      </div>
    </div>
    {verified && <p className="qs-custom-verified" role="status">
      Verified company rate: {money(Number(verified.rate))}/SFT,
      total {money(Number(verified.total))}.
    </p>}
    {message && <p className="qs-custom-message" role="status">{message}</p>}
    <section className="qs-work-card qs-work-preview-card">
      <div className="qs-work-heading">
        <div className="qs-work-heading-icon">▤</div>
        <div><h3>Premium Quotation PDF</h3>
          <p>Saved brand choices and prices are included in the same View, Download and WhatsApp PDF.</p>
        </div>
      </div>
      <QuotationPdfControls revisionId={revisionId} version={savedVersion}
        quoteNumber={quoteNumber} dirty={dirty || pending} canShare={canSharePdf}/>
    </section>
  </div>;
}

export function ConstructionSelector({
  rates,
  packages,
  initialSchedule,
  initialCustomQuote,
  revisionId,
  version,
  initialMode = 'sft',
  initialPackageId,
  quoteNumber,
  canSharePdf = false,
}: {
  rates: ConstructionRate[];
  packages: ConstructionPackage[];
  initialSchedule: SftEstimateDetails | null;
  initialCustomQuote?: CustomBrandQuote | null;
  revisionId: string;
  version: number;
  initialMode?: 'sft' | 'custom';
  initialPackageId?: string;
  quoteNumber?: string;
  canSharePdf?: boolean;
}) {
  const activePackages = packages.filter((pkg) => pkg.status === 'active');
  const previous = activePackages.find((pkg) =>
    pkg.id === initialSchedule?.package?.id ||
    pkg.code === initialSchedule?.package?.code,
  );
  const [selected, setSelected] = useState(
    initialCustomQuote ? 'custom' : previous?.id ??
    (initialMode === 'custom' || initialPackageId === 'custom' ? 'custom'
      : activePackages.find((pkg) => pkg.id === initialPackageId)?.id ??
        (activePackages.length === 0 ? 'custom' : '')),
  );
  const chosen = activePackages.find((pkg) => pkg.id === selected);
  return (
    <div className="qs-build-workspace">
      <section className="qs-build-panel qs-build-package">
        <div className="qs-build-title">
          <span className="qs-build-number">01</span>
          <div><h3>Choose package</h3><p>Select your company package.</p></div>
        </div>
        <div className="qs-build-package-choice">
          <label className="qs-build-package-field">
            <span className="sr-only">Construction package</span>
            <select aria-label="Select construction quotation package"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}>
              <option value="">Select a package</option>
              {activePackages.map((pkg) => <option key={pkg.id} value={pkg.id}>
                {pkg.name}
              </option>)}
              <option value="custom">Custom Quote</option>
            </select>
          </label>
          {chosen && <div className="qs-build-package-rate">
            <strong>{money(Number(chosen.ratePerSqft))}</strong>
            <small>per SFT</small>
          </div>}
        </div>
        {chosen && <p className="qs-build-package-desc">
          {chosen.description || 'Company package specifications included.'}
        </p>}
      </section>
      {selected === 'custom' ? (
        <section className="qs-build-custom-wrap">
          <CustomizedQuote rates={rates} revisionId={revisionId} version={version}
            quoteNumber={quoteNumber || 'Quotation'} canSharePdf={canSharePdf}
            initialQuote={initialCustomQuote ?? null}/>
        </section>
      ) : chosen ? (
        <PremiumSftBuilder key={selected}
          selectedPackageId={chosen.id}
          rates={rates} packages={packages} initialSchedule={initialSchedule}
          revisionId={revisionId} version={version}
          quoteNumber={quoteNumber || 'Quotation'} canSharePdf={canSharePdf} />
      ) : (
        <p className="qs-build-empty">Choose a package above to enter floor areas, optional works and material brands.</p>
      )}
    </div>
  );
}
