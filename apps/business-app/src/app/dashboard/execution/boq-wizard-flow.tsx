'use client';

import type { BoqFloor } from '@business-os/core/construction-boq';

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
    title: 'Excavation, Soil Filling & PCC Bed',
    short: 'Excavation & PCC',
    description:
      'Enter length, width, depth and count; calculate compacted and concrete volumes once.',
    categories: ['excavation', 'soil', 'pcc'],
    scope: 'foundation',
  },
  {
    number: 5,
    title: 'Footings & Pedestals',
    short: 'Footings',
    description:
      'Enter F1/F2 schedules, mesh reinforcement and optional pedestals from the structural drawing.',
    categories: ['footings'],
    scope: 'foundation',
  },
  {
    number: 6,
    title: 'Columns & Plinth Beam',
    short: 'Columns & Plinth',
    description:
      'Enter C1/C2 bar schedules and plinth beam details in their own cards.',
    categories: ['columns', 'plinth'],
    scope: 'foundation',
  },
  {
    number: 7,
    title: 'Beams, Slab & Staircase',
    short: 'Beams & Slab',
    description:
      'Measure beams, slab reinforcement and staircases for the selected floor.',
    categories: ['beams', 'slab', 'staircase'],
    scope: 'floors',
  },
  {
    number: 8,
    title: 'Brickwork & Wall Measurements',
    short: 'Brickwork',
    description:
      'Measure 9-inch and 4/4.5-inch walls; deduct openings from the same floor.',
    categories: ['brickwork'],
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
    title: 'Sajjas, Shelves, Plaster & Painting',
    short: 'Finishing Works',
    description:
      'Measure small RCC works separately from structural RMC, and enter plastering and painting.',
    categories: ['sajjas', 'shelves', 'plaster', 'painting'],
    scope: 'floors',
  },
  {
    number: 11,
    title: 'Tiles, Granite, Electrical, Plumbing & Terrace',
    short: 'Tiles & Services',
    description:
      'Measure finishing, electrical and plumbing for each floor; terrace has its own scope.',
    categories: [
      'tiles',
      'electrical',
      'plumbing',
      'compound',
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

export function BoqWizardProgress({
  active,
  onChange,
}: {
  active: number;
  onChange: (step: number) => void;
}) {
  return (
    <div className="boq-guided-progress">
      <div className="boq-guided-milestones" aria-label="BOQ progress">
        <span className="done">✓ Project & Quotation</span>
        <span className={active === 2 ? 'current' : active > 2 ? 'done' : ''}>
          2 · Floor Setup
        </span>
        <span className={active === 3 ? 'current' : active > 3 ? 'done' : ''}>
          3 · Concrete Method
        </span>
        <span
          className={
            active >= 4 && active <= 11 ? 'current' : active > 11 ? 'done' : ''
          }
        >
          4 · Measurements
        </span>
        <span className={active === 12 ? 'current' : active > 12 ? 'done' : ''}>
          5 · Rates
        </span>
        <span className={active === 13 ? 'current' : active > 13 ? 'done' : ''}>
          6 · Labour
        </span>
        <span className={active === 14 ? 'current' : ''}>7 · Final BOQ</span>
      </div>
      <nav className="boq-guided-step-scroll" aria-label="BOQ entry screens">
        {BOQ_WIZARD_STEPS.map((step) => (
          <button
            key={step.number}
            type="button"
            className={active === step.number ? 'selected' : ''}
            aria-current={active === step.number ? 'step' : undefined}
            onClick={() => onChange(step.number)}
          >
            <span>{step.number}</span>
            {step.short}
          </button>
        ))}
      </nav>
    </div>
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
    rawValue: string,
  ) => {
    const value = Number(rawValue);
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
          <p>
            Dimensions from the quotation and drawing. Floor heights are
            editable here only once.
          </p>
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
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={!canEdit}
                        aria-label={floor.name + ' ' + key}
                        value={floor[key]}
                        onChange={(event) =>
                          change(index, key, event.target.value)
                        }
                      />
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
      <p className="boq-guided-hint">
        Built-up area remains sourced from the quotation. Structural dimensions
        can differ from the quoted area; changing a length or width updates the
        generated structural takeoff. No second BOQ or price line is created.
      </p>
    </section>
  );
}
