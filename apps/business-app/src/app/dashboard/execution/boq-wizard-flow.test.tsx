import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  BOQ_WIZARD_STEPS,
  BoqFloorProjectSetup,
  BoqWizardProgress,
  wizardStep,
  nextBoqStep,
  previousBoqStep,
} from './boq-wizard-flow';

describe('14 BOQ design screens over one saved document', () => {
  it('has one navigation row with Foundation consolidated into one stage', () => {
    expect(BOQ_WIZARD_STEPS.map((step) => step.number)).toEqual([
      2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
    expect(wizardStep(4).categories).toEqual([
      'excavation', 'soil', 'pcc', 'footings', 'columns', 'plinth',
    ]);
    expect(wizardStep(8).categories).toContain('compound');
    expect(wizardStep(11).categories).toContain('penthouse');
    expect(wizardStep(11).categories).not.toContain('compound');
    expect(wizardStep(14).scope).toBe('final');
    expect(nextBoqStep(4)).toBe(7);
    expect(previousBoqStep(7)).toBe(4);
  });

  it('renders only one navigable row, not a second milestones row', () => {
    const html = renderToStaticMarkup(
      createElement(BoqWizardProgress, {
        active: 4,
        onChange: () => {},
      }),
    );
    expect(html).toContain('BOQ entry screens');
    expect(html).toContain('Foundation');
    expect(html).toContain('Final BOQ');
    expect(html).toContain('aria-current="step"');
    expect(html).not.toContain('boq-guided-milestones');
    expect((html.match(/<nav /g) ?? []).length).toBe(1);
  });

  it('uses the quoted built-up area and flags assumed floor heights', () => {
    const html = renderToStaticMarkup(
      createElement(BoqFloorProjectSetup, {
        floors: [
          {
            name: 'Ground Floor',
            areaSqft: 1000,
            lengthFeet: 50,
            widthFeet: 20,
            heightFeet: 10,
            heightAssumed: true,
          },
          {
            name: 'First Floor',
            areaSqft: 950,
            lengthFeet: 50,
            widthFeet: 19,
            heightFeet: 11,
            heightAssumed: false,
          },
        ],
        onChange: () => {},
        canEdit: true,
      }),
    );
    expect(html).toContain('Ground Floor');
    expect(html).toContain('First Floor');
    expect(html).toContain('1,950 sq ft');
    expect(html).toContain('Assumed — verify');
    expect(html).toContain('Entered');
  });
});
