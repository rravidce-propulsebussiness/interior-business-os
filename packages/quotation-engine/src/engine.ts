import { Decimal as D } from './decimal';
import { catalogSchema, previewSchema, decimal } from './schema';
import type { Catalog, Attribute, Answers, PreviewInput } from './schema';
const zero = D.from('0');
function fail(message: string): never {
  throw new Error(message);
}
const ordered = <T extends { sort_order: number; id: string }>(rows: T[]) =>
  [...rows].sort(
    (a, b) =>
      a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
function one<T>(rows: T[], label: string): T | undefined {
  if (rows.length > 1) fail('Ambiguous ' + label);
  return rows[0];
}
const inWindow = (
  row: { status: string; valid_from: string; valid_until: string | null },
  at: string,
) =>
  row.status === 'active' &&
  Date.parse(row.valid_from) <= Date.parse(at) &&
  (!row.valid_until || Date.parse(at) < Date.parse(row.valid_until));

export function validateDependencies(
  attributes: Attribute[],
  options: Catalog['options'],
) {
  const map = new Map(attributes.map((a) => [a.key, a]));
  if (map.size !== attributes.length) fail('Duplicate attribute key');
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(a: Attribute) {
    if (visiting.has(a.key)) fail('Circular dependency');
    if (visited.has(a.key)) return;
    visiting.add(a.key);
    for (const c of a.conditions) {
      const parent = map.get(c.attribute_key);
      if (!parent || !['select', 'multi_select'].includes(parent.input_type))
        fail('Invalid dependency parent');
      if (
        (c.operator === 'equals' || c.operator === 'not_equals') &&
        c.values.length !== 1
      )
        fail('Equality needs one option');
      if (
        c.values.some(
          (v) =>
            !options.some((o) => o.attribute_id === parent.id && o.key === v),
        )
      )
        fail('Invalid dependency option');
      visit(parent);
    }
    const defaults = options.filter(
      (o) =>
        o.attribute_id === a.id &&
        a.default_options.includes(o.key) &&
        o.status === 'active',
    );
    if (
      defaults.length !== a.default_options.length ||
      (a.input_type !== 'multi_select' && a.default_options.length > 1) ||
      (!['select', 'multi_select'].includes(a.input_type) &&
        a.default_options.length)
    )
      fail('Invalid default option');
    visiting.delete(a.key);
    visited.add(a.key);
  }
  attributes.forEach(visit);
}
/** Visibility and answer normalization shared by previews and forms. */
export function resolveAnswers(
  attributes: Attribute[],
  options: Catalog['options'],
  supplied: Answers,
  enforceRequired = true,
) {
  validateDependencies(attributes, options);
  const map = new Map(attributes.map((a) => [a.key, a])),
    answers: Answers = Object.create(null) as Answers,
    visible = new Set<string>(),
    done = new Set<string>();
  for (const key of Object.keys(supplied))
    if (!map.has(key)) fail('Unknown attribute');
  function resolve(a: Attribute) {
    if (done.has(a.key)) return;
    for (const c of a.conditions) resolve(map.get(c.attribute_key)!);
    done.add(a.key);
    if (
      a.status !== 'active' ||
      !a.visible_sales ||
      !a.conditions.every((c) => {
        if (
          !visible.has(c.attribute_key) ||
          answers[c.attribute_key] === undefined
        )
          return false;
        const answer = answers[c.attribute_key],
          values = Array.isArray(answer) ? answer : [String(answer)];
        const matches = values.some((v) => c.values.includes(v));
        return c.operator === 'not_equals' || c.operator === 'not_in'
          ? !matches
          : matches;
      })
    )
      return;
    visible.add(a.key);
    let value = Object.hasOwn(supplied, a.key) ? supplied[a.key] : undefined;
    if (value === undefined && a.default_options.length)
      value =
        a.input_type === 'multi_select'
          ? [...a.default_options]
          : a.default_options[0];
    if (
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && !value.length)
    ) {
      if (enforceRequired && a.required) fail('Required answer: ' + a.label);
      return;
    }
    if (a.input_type === 'select' || a.input_type === 'multi_select') {
      if (
        a.input_type === 'select'
          ? typeof value !== 'string'
          : !Array.isArray(value)
      )
        fail('Invalid selection');
      const values = Array.isArray(value) ? value : [String(value)];
      if (
        new Set(values).size !== values.length ||
        values.some(
          (v) =>
            !options.some(
              (o) =>
                o.attribute_id === a.id && o.key === v && o.status === 'active',
            ),
        )
      )
        fail('Invalid option');
      value = Array.isArray(value) ? [...value].sort() : value;
    } else if (a.input_type === 'boolean') {
      if (typeof value !== 'boolean') fail('Invalid boolean');
    } else if (typeof value !== 'string') fail('Invalid answer');
    else if (a.input_type === 'number') decimal.parse(value);
    answers[a.key] = value;
  }
  ordered(attributes).forEach(resolve);
  return { answers, visible: [...visible] };
}
export function measure(
  method: string,
  dimension: string,
  values: Record<string, string>,
): D {
  const definitions: Record<string, { fields: string[]; dimension: string }> = {
    manual: { fields: ['quantity'], dimension: 'any' },
    width_height: { fields: ['width', 'height'], dimension: 'area' },
    length: { fields: ['length'], dimension: 'length' },
    area: { fields: ['length', 'width'], dimension: 'area' },
    volume: { fields: ['length', 'width', 'height'], dimension: 'volume' },
    count: { fields: ['quantity'], dimension: 'count' },
    lump_sum: { fields: [], dimension: 'scalar' },
    percentage: { fields: ['percentage'], dimension: 'percentage' },
  };
  const definition = definitions[method];
  if (
    !definition ||
    (definition.dimension !== 'any' && definition.dimension !== dimension)
  )
    fail('Incompatible measurement unit');
  if (Object.keys(values).some((k) => !definition.fields.includes(k)))
    fail('Unexpected measurement');
  let result = D.from('1');
  for (const field of definition.fields) {
    const v = D.from(decimal.parse(values[field]));
    if (v.compare(zero) <= 0 || (method === 'count' && v.n % v.d !== 0n))
      fail('Positive measurement required');
    result = result.mul(v);
  }
  return method === 'percentage' ? result.mul(D.from('0.01')) : result;
}
function rounded(
  value: D,
  rule: { mode: 'none' | 'nearest' | 'up' | 'down'; step: string },
) {
  return rule.mode === 'none'
    ? value
    : value.round(D.from(rule.step), rule.mode);
}

export function calculate(rawCatalog: Catalog, rawInput: PreviewInput) {
  const catalog = catalogSchema.parse(rawCatalog),
    input = previewSchema.parse(rawInput);
  for (const rows of [
    catalog.categories,
    catalog.items,
    catalog.attributes,
    catalog.options,
    catalog.books,
    catalog.rates,
    catalog.costs,
    catalog.modifiers,
    catalog.branches,
  ])
    if (rows.some((r) => r.organization_id !== input.organization_id))
      fail('Foreign organization configuration');
  const item =
    catalog.items.find(
      (i) => i.id === input.item_id && i.status === 'active',
    ) ?? fail('Item unavailable');
  const unit =
    catalog.units.find((u) => u.key === item.unit_key) ??
    fail('Unit unavailable');
  if (!catalog.methods.some((m) => m.key === item.method_key))
    fail('Method unavailable');
  if (
    input.branch_id &&
    !catalog.branches.some(
      (b) => b.id === input.branch_id && b.status === 'active',
    )
  )
    fail('Branch unavailable');
  const available = catalog.books.filter(
    (b) =>
      inWindow(b, input.at) &&
      b.currency === input.currency &&
      (!b.branch_id || b.branch_id === input.branch_id),
  );
  const book = input.price_book_id
    ? (available.find((b) => b.id === input.price_book_id) ??
      fail('Selected price book unavailable'))
    : ((input.branch_id
        ? one(
            available.filter(
              (b) => b.is_default && b.branch_id === input.branch_id,
            ),
            'branch default',
          )
        : undefined) ??
      one(
        available.filter((b) => b.is_default && !b.branch_id),
        'organization default',
      ));
  const rates = catalog.rates.filter(
    (r) =>
      r.item_id === item.id &&
      r.currency === input.currency &&
      inWindow(r, input.at),
  );
  const rate =
    (book
      ? one(
          rates.filter((r) => r.price_book_id === book.id),
          'book rate',
        )
      : undefined) ??
    one(
      rates.filter((r) => r.price_book_id === null),
      'item rate',
    ) ??
    fail('No effective rate');
  const attributes = catalog.attributes.filter((a) => a.item_id === item.id),
    options = catalog.options.filter((o) => o.item_id === item.id);
  if (options.some((o) => !attributes.some((a) => a.id === o.attribute_id)))
    fail('Foreign attribute option');
  const { answers, visible } = resolveAnswers(
    attributes,
    options,
    input.answers,
  );
  const selected = options.filter((o) => {
    const a = attributes.find((a) => a.id === o.attribute_id)!;
    const v = answers[a.key];
    return (
      a.affects_pricing && (Array.isArray(v) ? v.includes(o.key) : v === o.key)
    );
  });
  const modifiers = ordered(
    catalog.modifiers.filter(
      (m) =>
        m.item_id === item.id &&
        m.status === 'active' &&
        (!m.price_book_id || m.price_book_id === book?.id) &&
        (!m.option_id || selected.some((o) => o.id === m.option_id)),
    ),
  );
  const rawQuantity = measure(
      item.method_key,
      unit.dimension,
      input.measurements,
    ),
    quantity = rounded(rawQuantity, item.quantity_rounding);
  if (quantity.compare(zero) <= 0) fail('Rounded quantity must be positive');
  const perUnit = modifiers.filter((m) => m.kind === 'per_unit'),
    fixed = modifiers.filter((m) => m.kind === 'fixed'),
    percentages = modifiers.filter((m) => m.kind === 'percentage');
  const sum = (rows: typeof modifiers) =>
    rows.reduce((v, m) => v.add(D.from(m.value)), zero);
  const base = D.from(rate.base_rate),
    adjusted = base.add(sum(perUnit)),
    subtotal = quantity.mul(adjusted),
    fixedTotal = sum(fixed),
    percentageBase = subtotal.add(fixedTotal);
  const percentageAmount = percentageBase
    .mul(sum(percentages))
    .mul(D.from('0.01'));
  const unrounded = percentageBase.add(percentageAmount);
  if ([adjusted, percentageBase, unrounded].some((v) => v.compare(zero) < 0))
    fail('Negative price');
  const total = rounded(unrounded, item.amount_rounding);
  const cost = one(
      catalog.costs.filter(
        (c) => c.rate_id === rate.id && c.status === 'active',
      ),
      'cost',
    ),
    estimatedCost = cost
      ? quantity.mul(D.from(cost.estimated_cost_rate))
      : null;
  return {
    calculationVersion: 'finished-work/1',
    organizationId: input.organization_id,
    itemId: item.id,
    itemName: item.name,
    itemVersion: item.version,
    calculatedAt: input.at,
    branchId: input.branch_id,
    currency: input.currency,
    unit: { key: unit.key, label: unit.label },
    measurementMethod: item.method_key,
    measurementInputs: { ...input.measurements },
    rawQuantity: rawQuantity.toString(),
    calculatedQuantity: quantity.toString(),
    priceBook: book
      ? {
          id: book.id,
          name: book.name,
          version: book.version,
          branchId: book.branch_id,
          currency: book.currency,
          validFrom: book.valid_from,
          validUntil: book.valid_until,
        }
      : null,
    rateRevision: {
      id: rate.id,
      version: rate.version,
      validFrom: rate.valid_from,
      validUntil: rate.valid_until,
    },
    baseRate: base.toString(),
    adjustedUnitRate: adjusted.toString(),
    specifications: ordered(attributes)
      .filter((a) => visible.includes(a.key) && answers[a.key] !== undefined)
      .map((a) => ({
        key: a.key,
        label: a.label,
        visibleCustomer: a.visible_customer,
        value: answers[a.key]!,
        options: options
          .filter(
            (o) =>
              o.attribute_id === a.id &&
              (Array.isArray(answers[a.key])
                ? (answers[a.key] as string[]).includes(o.key)
                : answers[a.key] === o.key),
          )
          .sort((a, b) => (a.key < b.key ? -1 : 1))
          .map((o) => ({ key: o.key, label: o.label })),
      })),
    rateModifiers: perUnit.map((m) => ({
      id: m.id,
      label: m.label,
      value: m.value,
    })),
    finishedWorkSubtotal: subtotal.toString(),
    fixedModifiers: fixed.map((m) => ({
      id: m.id,
      label: m.label,
      value: m.value,
    })),
    percentageModifiers: percentages.map((m) => ({
      id: m.id,
      label: m.label,
      value: m.value,
    })),
    percentageBase: percentageBase.toString(),
    percentageAmount: percentageAmount.toString(),
    minimumSellingRate: rate.minimum_rate,
    belowMinimum:
      rate.minimum_rate !== null &&
      total.compare(quantity.mul(D.from(rate.minimum_rate))) < 0,
    rounding: {
      quantity: quantity.sub(rawQuantity).toString(),
      amount: total.sub(unrounded).toString(),
      quantityRule: { ...item.quantity_rounding },
      amountRule: { ...item.amount_rounding },
    },
    finalCalculatedAmount: total.toString(),
    ...(estimatedCost
      ? {
          internal: {
            estimatedCostRate: cost!.estimated_cost_rate,
            estimatedCost: estimatedCost.toString(),
            grossContribution: total.sub(estimatedCost).toString(),
          },
        }
      : {}),
  };
}
export type Calculation = ReturnType<typeof calculate>;
