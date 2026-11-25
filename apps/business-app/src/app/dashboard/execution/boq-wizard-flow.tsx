'use client';

import type { BoqFloor } from '@business-os/core/construction-boq';
import { NumberField } from './boq-number-field';

export type BoqWizardStep = {
  number: number;
  title: string;
  short: string;
  description: string;
  categories: readonly string[];
  scope:
    | 'setup'
    | 'concrete'
    | 'foundation'
    | 'floors'
    | 'rates'
    | 'labour'
    | 'final';
};

/**
 * The fourteen design screens share one saved BOQ and its generated quantity
 * lines. Screens are navigation groups, never a second source of measurements.
 * Step 1 (project + final quotation) is BoqCreateStep.
 */
export const BOQ_WIZARD_STEPS: readonly BoqWizardStep[] = [
  {
    number: 2,
    title: 'Floor & Project Setup',
    short: 'Floor setup',
    description:
      'Review each floor, dimensions, built-up area and floor height from the quotation.',
    categories: [],
    scope: 'setup',
  },
  {
    number: 3,
    title: 'Structural Concrete Costing',
    short: 'RMC / Site Mix',
    description:
      'Select one concrete supply method for structural RCC across the project.',
    categories: [],
    scope: 'concrete',
  },
  {
    number: 4,
    title: 'Foundation',
    short: 'Foundation',
    description: '',
    categories: ['excavation', 'soil', 'pcc', 'footings', 'columns', 'plinth'],
    scope: 'foundation',
  },
  {
    number: 7,
    title: 'Columns, Beams, Slab & Staircase',
    short: 'RCC Structure',
    description:
      'Measure column types, beams, slab reinforcement and staircases by floor.',
    categories: ['columns', 'beams', 'slab', 'staircase'],
    scope: 'floors',
  },
  {
    number: 8,
    title: 'Brickwork & Compound Wall',
    short: 'Brickwork',
    description:
      'Measure 9-inch and 4/4.5-inch walls; deduct openings from the same floor.',
    categories: ['brickwork', 'compound'],
    scope: 'floors',
  },
  {
    number: 9,
    title: 'Doors & Windows',
    short: 'Doors & Windows',
    description:
      'Enter actual opening sizes; these also update the brickwork deductions.',
    categories: ['doors'],
    scope: 'floors',
  },
  {
    number: 10,
    title: 'Cement Shelves, Plaster & Painting',
    short: 'Finishing Works',
    description:
      'Measure cement shelving from its width and height; window sunshades calculate automatically under Doors & Windows.',
    categories: ['shelves', 'plaster', 'painting'],
    scope: 'floors',
  },
  {
    number: 11,
    title: 'Tiles, Granite, Electrical, Plumbing & Terrace',
    short: 'Tiles & Services',
    description:
      'Measure finishing, electrical and plumbing for each floor; terrace has its own scope.',
    categories: [
      'penthouse',
      'tiles',
      'electrical',
      'plumbing',
      'parapet',
      'waterproofing',
    ],
    scope: 'floors',
  },
  {
    number: 12,
    title: 'Material Rate Card',
    short: 'Material Rates',
    description:
      'Configure actual purchase rates once in the shared BOQ rate library.',
    categories: [],
    scope: 'rates',
  },
  {
    number: 13,
    title: 'Labour Costing',
    short: 'Labour',
    description:
      'Select composite, item-wise or daily labour without charging any work twice.',
    categories: [],
    scope: 'labour',
  },
  {
    number: 14,
    title: 'Final Detailed BOQ & Floor-wise Pricing',
    short: 'Final BOQ',
    description:
      'One itemized project BOQ with expandable floor-wise material and labour costs.',
    categories: [],
    scope: 'final',
  },
];

export const wizardStep = (number: number) =>
  BOQ_WIZARD_STEPS.find((step) => step.number === number) ??
  BOQ_WIZARD_STEPS[0]!;

export const nextBoqStep = (current: number): number => {
  const index = BOQ_WIZARD_STEPS.findIndex((step) => step.number === current);
  return BOQ_WIZARD_STEPS[
    Math.min(index < 0 ? 0 : index + 1, BOQ_WIZARD_STEPS.length - 1)
  ]!.number;
};

export const previousBoqStep = (current: number): number => {
  const index = BOQ_WIZARD_STEPS.findIndex((step) => step.number === current);
  return BOQ_WIZARD_STEPS[Math.max(0, index - 1)]!.number;
};

export function BoqWizardProgress({
  active,
  reviewed = [],
  onChange,
}: {
  active: number;
  reviewed?: readonly number[];
  onChange: (step: number) => void;
}) {
  return (
    <nav className="boq-guided-step-scroll" aria-label="BOQ entry screens">
      {BOQ_WIZARD_STEPS.map((step, index) => (
        <button
          key={step.number}
          type="button"
          className={
            active === step.number
              ? 'selected'
              : reviewed.includes(step.number)
                ? 'reviewed'
                : ''
          }
          aria-current={active === step.number ? 'step' : undefined}
          onClick={() => onChange(step.number)}
        >
          <span>
            {reviewed.includes(step.number) && active !== step.number
              ? '✓ '
              : ''}
            {index + 1}
          </span>
          <strong>{step.short}</strong>
        </button>
      ))}
    </nav>
  );
}

export function BoqFloorProjectSetup({
  floors,
  onChange,
  canEdit,
}: {
  floors: readonly BoqFloor[];
  onChange: (floors: BoqFloor[]) => void;
  canEdit: boolean;
}) {
  const change = (
    index: number,
    property: 'lengthFeet' | 'widthFeet' | 'heightFeet',
    value: number,
  ) => {
    if (!Number.isFinite(value) || value < 0) return;
    onChange(
      floors.map((floor, i) =>
        i === index
          ? {
              ...floor,
              [property]: value,
              ...(property === 'heightFeet' ? { heightAssumed: false } : {}),
            }
          : floor,
      ),
    );
  };
  const total = floors.reduce((sum, floor) => sum + (floor.areaSqft || 0), 0);
  return (
    <section className="boq-guided-panel" aria-label="Floor and project setup">
      <div className="boq-guided-panel-head">
        <div>
          <h3>Floor and Project Setup</h3>
        </div>
        <span className="boq-guided-pill">{floors.length} floors</span>
      </div>
      <div className="boq-guided-floor-scroll">
        <table className="boq-guided-floor-table">
          <thead>
            <tr>
              <th>Floor</th>
              <th>Length (ft)</th>
              <th>Width (ft)</th>
              <th>Height (ft)</th>
              <th>Built-up (sq ft)</th>
              <th>Height source</th>
            </tr>
          </thead>
          <tbody>
            {floors.map((floor, index) => (
              <tr key={floor.name}>
                <th scope="row">{floor.name}</th>
                {(['lengthFeet', 'widthFeet', 'heightFeet'] as const).map(
                  (key) => (
                    <td key={key}>
                      {/* Drawing sizes such as 60'6" are read as feet; a
                          number box would silently turn them into 606. */}
                      {canEdit ? (
                        <NumberField
                          feet
                          label={floor.name + ' ' + key}
                          value={floor[key]}
                          onChange={(value) => change(index, key, value)}
                        />
                      ) : (
                        <span>{floor[key]}</span>
                      )}
                    </td>
                  ),
                )}
                <td>
                  <strong>
                    {floor.areaSqft.toLocaleString('en-IN', {
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                </td>
                <td>
                  {floor.heightAssumed ? (
                    <span className="boq-guided-assumed">Assumed — verify</span>
                  ) : (
                    <span className="boq-guided-measured">Entered</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Total built-up</th>
              <td colSpan={3}></td>
              <td>
                {total.toLocaleString('en-IN', { maximumFractionDigits: 2 })} sq
                ft
              </td>
              <td>Quotation basis</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {floors.some((floor) => floor.heightAssumed) && (
        <p className="boq-guided-warning" role="status">
          Some floor heights were not entered in the quotation. Confirm their
          heights here from the drawing before finalizing the BOQ. Existing
          assumed values are preserved until edited.
        </p>
      )}
    </section>
  );
}
