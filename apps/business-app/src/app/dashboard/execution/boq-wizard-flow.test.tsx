import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  BOQ_WIZARD_STEPS,
  BoqFloorProjectSetup,
  BoqWizardProgress,
  wizardStep,
} from './boq-wizard-flow';

describe('14 BOQ design screens over one saved document', () => {
  it('has exactly thirteen follow-on screens after Create New BOQ', () => {
    expect(BOQ_WIZARD_STEPS.map((step) => step.number)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
    expect(wizardStep(4).categories).toEqual(['excavation', 'soil', 'pcc']);
    expect(wizardStep(5).categories).toEqual(['footings']);
    expect(wizardStep(6).categories).toEqual(['columns', 'plinth']);
    expect(wizardStep(7).categories).toEqual(['beams', 'slab', 'staircase']);
    expect(wizardStep(9).categories).toEqual(['doors']);
    expect(wizardStep(14).scope).toBe('final');
  });

  it('renders the same navigable sequence and a selected stage', () => {
    const html = renderToStaticMarkup(createElement(BoqWizardProgress, {
      active: 5, onChange: () => {},
    }));
    expect(html).toContain('BOQ entry screens');
    expect(html).toContain('Footings');
    expect(html).toContain('Final BOQ');
    expect(html).toContain('aria-current="step"');
  });

  it('uses the quoted built-up area and flags assumed floor heights', () => {
    const html = renderToStaticMarkup(createElement(BoqFloorProjectSetup, {
      floors: [
        {
          name: 'Ground Floor', areaSqft: 1000,
          lengthFeet: 50, widthFeet: 20, heightFeet: 10, heightAssumed: true,
        },
        {
          name: 'First Floor', areaSqft: 950,
          lengthFeet: 50, widthFeet: 19, heightFeet: 11, heightAssumed: false,
        },
      ],
      onChange: () => {},
      canEdit: true,
    }));
    expect(html).toContain('Ground Floor');
    expect(html).toContain('First Floor');
    expect(html).toContain('1,950 sq ft');
    expect(html).toContain('Assumed — verify');
    expect(html).toContain('Entered');
  });
});
