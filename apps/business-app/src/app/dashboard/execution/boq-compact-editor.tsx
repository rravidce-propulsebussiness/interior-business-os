'use client';

import { createContext, useContext, type ReactNode } from 'react';

type Unit = 'ft' | 'm';
const UnitContext = createContext<Unit>('ft');
export function BoqEditorUnits({ unit, children }: { unit: Unit; children: ReactNode }) {
  return <UnitContext.Provider value={unit}>{children}</UnitContext.Provider>;
}
export function useBoqEditorUnit() { return useContext(UnitContext); }

export function editorUnit(unit: string | undefined, selected: Unit) {
  const source = unit ?? '';
  // Retain engineering bar diameters and inch-based reinforcement spacing.
  if (selected === 'm') {
    if (source === 'ft' || source === 'rft') return { unit: 'm', factor: 0.3048 };
    if (source === 'sqft' || source === 'sq ft') return { unit: 'm²', factor: 0.09290304 };
  }
  if (selected === 'ft') {
    if (source === 'm³' || source === 'm3') return { unit: 'CFT', factor: 1 / 0.028316846592 };
    if (source === 'm²' || source === 'm2') return { unit: 'sqft', factor: 1 / 0.09290304 };
  }
  return { unit: source, factor: 1 };
}

export function BoqRemove({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="boq-volume-remove" aria-label={label} title={label} onClick={onClick}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>
  </button>;
}

export function BoqAdvanced({ label, children }: { label: string; children: ReactNode }) {
  return <details className="boq-compact-advanced"><summary>{label}</summary><div>{children}</div></details>;
}
