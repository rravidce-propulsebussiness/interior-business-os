import { describe, expect, it } from 'vitest';
import {
  calculate,
  measure,
  resolveAnswers,
  validateDependencies,
} from './engine';
import { Decimal } from './decimal';
import type { Catalog, PreviewInput } from './schema';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const common = (n: number) => ({
  id: id(n),
  organization_id: id(1),
  version: 1,
  status: 'active' as const,
});
function fixture(): { catalog: Catalog; input: PreviewInput } {
  const catalog: Catalog = {
    categories: [],
    items: [
      {
        ...common(2),
        name: 'Wardrobe',
        key: 'wardrobe',
        description: 'Finished work',
        category_id: null,
        industry_id: null,
        unit_key: 'sq_ft',
        method_key: 'width_height',
        quantity_rounding: { mode: 'none', step: '0.01' },
        amount_rounding: { mode: 'nearest', step: '0.01' },
        sort_order: 0,
      },
    ],
    attributes: [],
    options: [],
    books: [],
    rates: [
      {
        ...common(3),
        item_id: id(2),
        price_book_id: null,
        currency: 'INR',
        base_rate: '1550',
        minimum_rate: '1350',
        valid_from: '2026-01-01T00:00:00Z',
        valid_until: null,
      },
    ],
    costs: [{ ...common(4), rate_id: id(3), estimated_cost_rate: '1700' }],
    modifiers: [],
    units: [{ key: 'sq_ft', label: 'Square foot', dimension: 'area' }],
    methods: [
      {
        key: 'width_height',
        label: 'Width × Height',
        dimension: 'area',
        fields: ['width', 'height'],
      },
    ],
    branches: [],
  };
  const input: PreviewInput = {
    organization_id: id(1),
    item_id: id(2),
    price_book_id: null,
    branch_id: null,
    currency: 'INR',
    at: '2026-09-29T00:00:00Z',
    measurements: { width: '8', height: '7' },
    answers: {},
  };
  return { catalog, input };
}
function question(catalog: Catalog, key: string, n: number, values: string[]) {
  const a = {
    ...common(n),
    item_id: id(2),
    key,
    label: key,
    input_type: 'select' as const,
    required: true,
    visible_sales: true,
    visible_customer: true,
    affects_pricing: true,
    default_options: [],
    conditions: [],
    help_text: '',
    sort_order: n,
  };
  catalog.attributes.push(a);
  values.forEach((key, index) =>
    catalog.options.push({
      ...common(n + index + 1),
      item_id: id(2),
      attribute_id: a.id,
      key,
      label: key,
      description: '',
      sort_order: index,
    }),
  );
  return a;
}
function modifier(
  catalog: Catalog,
  n: number,
  kind: 'per_unit' | 'fixed' | 'percentage',
  value: string,
  option_id: string | null = null,
) {
  catalog.modifiers.push({
    ...common(n),
    item_id: id(2),
    option_id,
    price_book_id: null,
    label: 'Adjustment ' + n,
    kind,
    value,
    sort_order: n,
  });
}
describe('safe measurements', () => {
  it.each([
    ['width_height', 'area', { width: '8', height: '7' }, '56'],
    ['length', 'length', { length: '3.25' }, '3.25'],
    ['area', 'area', { length: '2.1', width: '3.2' }, '6.72'],
    ['volume', 'volume', { length: '2.5', width: '3', height: '0.2' }, '1.5'],
    ['count', 'count', { quantity: '4' }, '4'],
    ['lump_sum', 'scalar', {}, '1'],
    ['manual', 'custom', { quantity: '0.000001' }, '0.000001'],
    ['percentage', 'percentage', { percentage: '12.5' }, '0.125'],
  ] as const)('%s is exact', (method, dimension, input, expected) =>
    expect(measure(method, dimension, input).toString()).toBe(expected),
  );
  it.each(['-1', '0', 'NaN', 'Infinity', '1e3', '0.1234567', '1000000000000'])(
    'rejects invalid measurement %s',
    (value) =>
      expect(() => measure('length', 'length', { length: value })).toThrow(),
  );
  it('rejects missing, extra, fractional count, incompatible units and code', () => {
    for (const call of [
      () => measure('width_height', 'area', { width: '2' }),
      () => measure('length', 'length', { length: '1', width: '3' }),
      () => measure('count', 'count', { quantity: '1.5' }),
      () => measure('volume', 'area', { length: '2', width: '2', height: '2' }),
      () => measure('eval', 'scalar', {}),
    ])
      expect(call).toThrow();
  });
});
describe('finished-work calculations', () => {
  it('base rate and optional internal cost', () => {
    const { catalog, input } = fixture(),
      r = calculate(catalog, input);
    expect(r.finalCalculatedAmount).toBe('86800');
    expect(r.internal?.estimatedCost).toBe('95200');
    catalog.costs = [];
    expect(calculate(catalog, input)).not.toHaveProperty('internal');
  });
  it('prices the full example and shorter preview using configurable selections', () => {
    const { catalog, input } = fixture();
    for (const [i, value] of ['180', '100', '500', '150', '70'].entries()) {
      const a = question(catalog, 'choice_' + i, 10 + i * 10, [
        'standard',
        'premium',
      ]);
      input.answers[a.key] = 'premium';
      modifier(catalog, 100 + i, 'per_unit', value, id(12 + i * 10));
    }
    const r = calculate(catalog, input);
    expect(r.adjustedUnitRate).toBe('2550');
    expect(r.finalCalculatedAmount).toBe('142800');
    expect(r.internal?.grossContribution).toBe('47600');
    catalog.modifiers = catalog.modifiers.filter(
      (m) => !['100', '70'].includes(m.value),
    );
    expect(calculate(catalog, input).finalCalculatedAmount).toBe('133280');
  });
  it('applies per-unit, fixed, then additive percentages independent of row order', () => {
    const { catalog, input } = fixture();
    catalog.rates[0]!.base_rate = '100';
    modifier(catalog, 20, 'percentage', '10');
    modifier(catalog, 21, 'fixed', '40');
    modifier(catalog, 22, 'per_unit', '10');
    modifier(catalog, 23, 'percentage', '5');
    const result = calculate(catalog, input);
    expect(result.percentageBase).toBe('6200');
    expect(result.finalCalculatedAmount).toBe('7130');
    catalog.modifiers.reverse();
    expect(calculate(catalog, input)).toEqual(result);
  });
  it.each([
    ['nearest', '0.25', '56.25'],
    ['up', '1', '57'],
    ['down', '0.1', '56.1'],
    ['none', '1', '56.13'],
  ] as const)('quantity rounding %s', (mode, step, expected) => {
    const { catalog, input } = fixture();
    catalog.items[0]!.method_key = 'manual';
    catalog.methods.push({
      key: 'manual',
      label: 'Manual',
      dimension: 'custom',
      fields: ['quantity'],
    });
    input.measurements = { quantity: '56.13' };
    catalog.items[0]!.quantity_rounding = { mode, step };
    expect(calculate(catalog, input).calculatedQuantity).toBe(expected);
  });
  it('rounds amount to increment with exact half-up ties', () => {
    const { catalog, input } = fixture();
    catalog.rates[0]!.base_rate = '1.005';
    input.measurements = { width: '1', height: '1' };
    expect(calculate(catalog, input).finalCalculatedAmount).toBe('1.01');
    catalog.items[0]!.amount_rounding = { mode: 'up', step: '10' };
    expect(calculate(catalog, input).finalCalculatedAmount).toBe('10');
    catalog.items[0]!.amount_rounding = { mode: 'none', step: '1' };
    expect(calculate(catalog, input).finalCalculatedAmount).toBe('1.005');
  });
  it('returns minimum metadata without silently clamping', () => {
    const { catalog, input } = fixture();
    catalog.rates[0]!.minimum_rate = '2000';
    const r = calculate(catalog, input);
    expect(r.belowMinimum).toBe(true);
    expect(r.finalCalculatedAmount).toBe('86800');
  });
  it('handles discounts but rejects negative totals and percentage bounds', () => {
    const { catalog, input } = fixture();
    modifier(catalog, 20, 'percentage', '-10');
    expect(calculate(catalog, input).finalCalculatedAmount).toBe('78120');
    catalog.modifiers[0]!.value = '-101';
    expect(() => calculate(catalog, input)).toThrow();
    catalog.modifiers[0]!.kind = 'per_unit';
    catalog.modifiers[0]!.value = '-2000';
    expect(() => calculate(catalog, input)).toThrow();
  });
  it('rejects foreign organizations, unknown/inactive items and options', () => {
    const { catalog, input } = fixture();
    catalog.items[0]!.organization_id = id(999);
    expect(() => calculate(catalog, input)).toThrow(/Foreign/);
    catalog.items[0]!.organization_id = id(1);
    catalog.items[0]!.status = 'inactive';
    expect(() => calculate(catalog, input)).toThrow();
  });
  it('keeps serialized snapshots detached from master edits', () => {
    const { catalog, input } = fixture();
    const r = calculate(catalog, input),
      snapshot = JSON.stringify(r);
    catalog.rates[0]!.base_rate = '1650';
    catalog.items[0]!.name = 'New label';
    input.measurements.width = '9';
    expect(JSON.stringify(r)).toBe(snapshot);
    expect(JSON.parse(snapshot).itemName).toBe('Wardrobe');
    expect(calculate(catalog, input).finalCalculatedAmount).not.toBe(
      r.finalCalculatedAmount,
    );
  });
  it('uses exactly the same engine for construction volume and specifications', () => {
    const { catalog, input } = fixture();
    catalog.items[0]!.name = 'RCC Work';
    catalog.items[0]!.method_key = 'volume';
    catalog.items[0]!.unit_key = 'cubic_m';
    catalog.units = [
      { key: 'cubic_m', label: 'Cubic metre', dimension: 'volume' },
    ];
    catalog.methods = [
      {
        key: 'volume',
        label: 'Volume',
        dimension: 'volume',
        fields: ['length', 'width', 'height'],
      },
    ];
    catalog.rates[0]!.base_rate = '6000';
    question(catalog, 'concrete_grade', 10, ['m20', 'm25']);
    question(catalog, 'shuttering', 20, ['included', 'excluded']);
    modifier(catalog, 30, 'per_unit', '500', id(12));
    input.answers = { concrete_grade: 'm25', shuttering: 'included' };
    input.measurements = { length: '5', width: '2', height: '0.2' };
    expect(calculate(catalog, input).finalCalculatedAmount).toBe('13000');
  });
  it('exact decimal utility never introduces floating-point artifacts', () => {
    expect(Decimal.from('0.1').add(Decimal.from('0.2')).toString()).toBe('0.3');
    expect(Decimal.from('-0.1').mul(Decimal.from('3')).toString()).toBe('-0.3');
  });
});
describe('price books and history', () => {
  function books() {
    const f = fixture(),
      { catalog } = f;
    catalog.branches = [
      { id: id(9), organization_id: id(1), name: 'Branch', status: 'active' },
    ];
    catalog.books = [
      {
        ...common(5),
        name: 'Standard',
        key: 'standard',
        currency: 'INR',
        branch_id: null,
        is_default: true,
        valid_from: '2026-01-01T00:00:00Z',
        valid_until: null,
      },
      {
        ...common(6),
        name: 'Branch',
        key: 'branch',
        currency: 'INR',
        branch_id: id(9),
        is_default: true,
        valid_from: '2026-01-01T00:00:00Z',
        valid_until: null,
      },
    ];
    catalog.rates.push(
      {
        ...catalog.rates[0]!,
        ...common(7),
        price_book_id: id(5),
        base_rate: '1600',
      },
      {
        ...catalog.rates[0]!,
        ...common(8),
        price_book_id: id(6),
        base_rate: '1700',
      },
    );
    return f;
  }
  it('explicit > branch > organization > item default', () => {
    const { catalog, input } = books();
    expect(calculate(catalog, input).baseRate).toBe('1600');
    input.branch_id = id(9);
    expect(calculate(catalog, input).baseRate).toBe('1700');
    input.price_book_id = id(5);
    expect(calculate(catalog, input).baseRate).toBe('1600');
    catalog.rates = catalog.rates.filter((r) => r.price_book_id === null);
    expect(calculate(catalog, input).baseRate).toBe('1550');
  });
  it('rejects invalid explicit books and branch mismatch instead of fallback', () => {
    const { catalog, input } = books();
    input.price_book_id = id(6);
    expect(() => calculate(catalog, input)).toThrow();
    input.price_book_id = id(999);
    expect(() => calculate(catalog, input)).toThrow();
    input.price_book_id = null;
    input.branch_id = id(999);
    expect(() => calculate(catalog, input)).toThrow();
  });
  it('uses half-open effective windows at the exact boundary', () => {
    const { catalog, input } = fixture();
    catalog.rates[0]!.valid_until = '2026-10-01T00:00:00Z';
    catalog.rates.push({
      ...catalog.rates[0]!,
      ...common(5),
      valid_from: '2026-10-01T00:00:00Z',
      valid_until: null,
      base_rate: '1650',
    });
    expect(calculate(catalog, input).baseRate).toBe('1550');
    input.at = '2026-10-01T00:00:00Z';
    expect(calculate(catalog, input).baseRate).toBe('1650');
    input.at = '2026-09-30T23:59:59.999Z';
    expect(calculate(catalog, input).baseRate).toBe('1550');
  });
  it('ignores inactive rates; rejects ambiguous rates/defaults and wrong currency', () => {
    const { catalog, input } = books();
    catalog.rates[1]!.status = 'inactive';
    expect(calculate(catalog, input).baseRate).toBe('1550');
    catalog.rates.push({ ...catalog.rates[0]!, ...common(30) });
    expect(() => calculate(catalog, input)).toThrow(/Ambiguous/);
    catalog.rates.pop();
    catalog.books.push({ ...catalog.books[0]!, ...common(31) });
    expect(() => calculate(catalog, input)).toThrow(/Ambiguous/);
    input.currency = 'USD';
    expect(() => calculate(catalog, input)).toThrow();
  });
});
describe('dependent questions', () => {
  it.each([
    ['equals', true],
    ['not_equals', false],
    ['in', true],
    ['not_in', false],
  ] as const)('evaluates %s against selected options', (operator, visible) => {
    const { catalog } = dependent();
    catalog.attributes[1]!.conditions[0]!.operator = operator;
    expect(
      resolveAnswers(
        catalog.attributes,
        catalog.options,
        { finish: 'pu' },
        false,
      ).visible.includes('pu_type'),
    ).toBe(visible);
  });
  it('uses active defaults and excludes hidden-to-sales questions from pricing', () => {
    const { catalog, input } = dependent();
    catalog.attributes[0]!.default_options = ['pu'];
    catalog.attributes[1]!.default_options = ['gloss'];
    expect(calculate(catalog, input).finalCalculatedAmount).toBe('114800');
    catalog.attributes[1]!.visible_sales = false;
    expect(calculate(catalog, input).finalCalculatedAmount).toBe('86800');
  });
  it('handles valid keys that coincide with Object prototype names', () => {
    const { catalog, input } = fixture();
    question(catalog, 'constructor', 10, ['chosen']);
    expect(() => calculate(catalog, input)).toThrow(/Required/);
    input.answers = { constructor: 'chosen' };
    expect(calculate(catalog, input).specifications[0]!.value).toBe('chosen');
  });
  function dependent() {
    const f = fixture();
    question(f.catalog, 'finish', 10, ['laminate', 'pu']);
    question(f.catalog, 'pu_type', 20, ['matte', 'gloss']);
    f.catalog.attributes[1]!.conditions = [
      { attribute_key: 'finish', operator: 'equals', values: ['pu'] },
    ];
    modifier(f.catalog, 30, 'per_unit', '500', id(22));
    return f;
  }
  it('shows required dependent questions and removes stale hidden selection from price and snapshot', () => {
    const { catalog, input } = dependent();
    input.answers = { finish: 'laminate', pu_type: 'gloss' };
    let r = calculate(catalog, input);
    expect(r.finalCalculatedAmount).toBe('86800');
    expect(r.specifications).toHaveLength(1);
    input.answers.finish = 'pu';
    r = calculate(catalog, input);
    expect(r.finalCalculatedAmount).toBe('114800');
    delete input.answers.pu_type;
    expect(() => calculate(catalog, input)).toThrow(/Required/);
  });
  it.each(['equals', 'not_equals', 'in', 'not_in'] as const)(
    'condition %s requires an answered parent',
    (operator) => {
      const { catalog } = dependent();
      catalog.attributes[0]!.required = false;
      catalog.attributes[1]!.conditions[0]!.operator = operator;
      expect(
        resolveAnswers(catalog.attributes, catalog.options, {}, false).visible,
      ).not.toContain('pu_type');
    },
  );
  it('rejects cycles and foreign options', () => {
    const { catalog } = dependent();
    catalog.attributes[0]!.conditions = [
      { attribute_key: 'pu_type', operator: 'equals', values: ['matte'] },
    ];
    expect(() =>
      validateDependencies(catalog.attributes, catalog.options),
    ).toThrow(/Circular/);
    catalog.attributes[0]!.conditions = [];
    catalog.attributes[1]!.conditions[0]!.values = ['foreign'];
    expect(() =>
      validateDependencies(catalog.attributes, catalog.options),
    ).toThrow(/option/);
  });
  it('rejects duplicate/inactive selections; supports multi-select and typed fields', () => {
    const { catalog, input } = dependent();
    input.answers = { finish: 'missing' };
    expect(() => calculate(catalog, input)).toThrow();
    catalog.attributes[0]!.input_type = 'multi_select';
    input.answers = { finish: ['laminate', 'laminate'] };
    expect(() => calculate(catalog, input)).toThrow();
    input.answers = { finish: ['laminate'] };
    expect(calculate(catalog, input).specifications[0]!.value).toEqual([
      'laminate',
    ]);
    catalog.options[0]!.status = 'inactive';
    expect(() => calculate(catalog, input)).toThrow();
  });
  it('supports boolean, number and text without executable formulas', () => {
    const { catalog, input } = fixture();
    question(catalog, 'note', 10, []);
    catalog.attributes[0]!.input_type = 'text';
    input.answers = { note: 'width * height is text' };
    expect(calculate(catalog, input).finalCalculatedAmount).toBe('86800');
    catalog.attributes[0]!.input_type = 'boolean';
    input.answers = { note: false };
    expect(calculate(catalog, input).specifications[0]!.value).toBe(false);
    catalog.attributes[0]!.input_type = 'number';
    input.answers = { note: '2.25' };
    expect(calculate(catalog, input).specifications[0]!.value).toBe('2.25');
  });
});
