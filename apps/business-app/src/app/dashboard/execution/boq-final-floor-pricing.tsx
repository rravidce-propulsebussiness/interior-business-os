import { Fragment } from 'react';

export type FloorPricingItem = {
  stage: string;
  amount: number;
  isLabour: boolean;
};

/** A priced BOQ output. Details reuse the calculated takeoff; no second entry. */
export type FloorPricingLine = {
  id: string;
  stage: string;
  work: string;
  name: string;
  quantity: number;
  unit: string;
  rate: number;
};

export type FloorPricingStage = {
  stage: string;
  areaSqft: number | null;
  materialCost: number;
  labourCost: number;
  totalCost: number;
  costPerSqft: number | null;
};

const cents = (amount: number) => Math.round(amount * 100) / 100;
const safeCost = (amount: number) => (Number.isFinite(amount) ? amount : 0);

/**
 * Display-only grouping of the same material and labour costs used by the BOQ
 * total. Composite labour is allocated from evaluateLabour.byStage; it is
 * never counted as another material or charged twice.
 */
export function buildFloorPricing(
  items: readonly FloorPricingItem[],
  allocatedLabour: Readonly<Record<string, number>>,
  floors: readonly { name: string; areaSqft: number }[],
  stageOrder: readonly string[],
): FloorPricingStage[] {
  const byStage = new Map<string, { materials: number; labour: number }>();
  const add = (stage: string, amount: number, isLabour: boolean) => {
    const previous = byStage.get(stage) ?? { materials: 0, labour: 0 };
    if (isLabour) previous.labour += safeCost(amount);
    else previous.materials += safeCost(amount);
    byStage.set(stage, previous);
  };
  for (const item of items)
    add(item.stage || 'Other', item.amount, item.isLabour);
  for (const [stage, amount] of Object.entries(allocatedLabour))
    add(stage || 'General', amount, true);

  const areaByFloor = new Map(
    floors.map((floor) => [floor.name, floor.areaSqft]),
  );
  const ordered = [
    ...new Set([
      ...stageOrder,
      ...floors.map((floor) => floor.name),
      ...byStage.keys(),
    ]),
  ];

  return ordered
    .filter((stage) => byStage.has(stage) || areaByFloor.has(stage))
    .map((stage) => {
      const cost = byStage.get(stage) ?? { materials: 0, labour: 0 };
      const area = areaByFloor.get(stage);
      const materialCost = cents(cost.materials);
      const labourCost = cents(cost.labour);
      const totalCost = cents(materialCost + labourCost);
      return {
        stage,
        areaSqft: area && area > 0 ? area : null,
        materialCost,
        labourCost,
        totalCost,
        costPerSqft: area && area > 0 ? totalCost / area : null,
      };
    });
}

const money = (amount: number) =>
  '₹' +
  amount.toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  });
const quantity = (amount: number) =>
  amount.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function BoqFinalFloorPricing({
  rows,
  materialCost,
  labourCost,
  totalCost,
  areaSqft,
  canViewCost,
  lines = [],
  labourAllocations = {},
}: {
  rows: FloorPricingStage[];
  materialCost: number;
  labourCost: number;
  totalCost: number;
  areaSqft: number;
  canViewCost: boolean;
  lines?: readonly FloorPricingLine[];
  /** Labour not represented as material outputs is shown only once here. */
  labourAllocations?: Readonly<Record<string, number>>;
}) {
  return (
    <section
      className="boq-final-floor-pricing"
      aria-labelledby="boq-final-floor-heading"
    >
      <h3 id="boq-final-floor-heading">Floor-wise BOQ pricing</h3>
      <p>
        One detailed BOQ with floor totals. Expand any stage to view its
        calculated materials, quantities, rates and labour allocation.
      </p>
      <div className="boq-final-floor-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Stage / floor</th>
              <th scope="col">Built-up</th>
              {canViewCost && (
                <>
                  <th scope="col">Materials</th>
                  <th scope="col">Labour</th>
                  <th scope="col">Total cost</th>
                  <th scope="col">Cost / sq ft</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const itemized = lines.filter((line) => line.stage === row.stage);
              const allocatedLabour = labourAllocations[row.stage] ?? 0;
              return (
                <Fragment key={row.stage}>
                  <tr className="boq-final-main-row">
                    <th scope="row">{row.stage}</th>
                    <td data-label="Built-up">
                      {row.areaSqft ? quantity(row.areaSqft) + ' sq ft' : '—'}
                    </td>
                    {canViewCost && (
                      <>
                        <td data-label="Materials">{money(row.materialCost)}</td>
                        <td data-label="Labour">{money(row.labourCost)}</td>
                        <td data-label="Total cost">
                          <strong>{money(row.totalCost)}</strong>
                        </td>
                        <td data-label="Cost / sq ft">
                          {row.costPerSqft !== null
                            ? money(row.costPerSqft)
                            : '—'}
                        </td>
                      </>
                    )}
                  </tr>
                  <tr className="boq-final-details-row">
                    <td colSpan={canViewCost ? 6 : 2}>
                      <details className="boq-floor-cost">
                        <summary>
                          View detailed quantities{canViewCost ? ' and rates' : ''}
                        </summary>
                        <div className="boq-final-line-list">
                          {itemized.map((item) => (
                            <div className="boq-final-line" key={item.id}>
                              <span className="boq-final-line-name">
                                <strong>{item.name}</strong>
                                <small>{item.work}</small>
                              </span>
                              <span>
                                {quantity(item.quantity)} {item.unit}
                              </span>
                              {canViewCost && (
                                <>
                                  <span>{money(item.rate)} / {item.unit}</span>
                                  <strong>
                                    {money(item.quantity * item.rate)}
                                  </strong>
                                </>
                              )}
                            </div>
                          ))}
                          {canViewCost && allocatedLabour > 0 && (
                            <div className="boq-final-line boq-final-labour-line">
                              <span className="boq-final-line-name">
                                <strong>Allocated labour</strong>
                                <small>
                                  Package, item-wise or separate labour
                                </small>
                              </span>
                              <span>1 lot</span>
                              <span>{money(allocatedLabour)}</span>
                              <strong>{money(allocatedLabour)}</strong>
                            </div>
                          )}
                          {!itemized.length && allocatedLabour <= 0 && (
                            <p>No detailed measured items on this stage.</p>
                          )}
                        </div>
                      </details>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total project</th>
              <td data-label="Built-up">
                {areaSqft > 0 ? quantity(areaSqft) + ' sq ft' : '—'}
              </td>
              {canViewCost && (
                <>
                  <td data-label="Materials">{money(materialCost)}</td>
                  <td data-label="Labour">{money(labourCost)}</td>
                  <td data-label="Total cost">
                    <strong>{money(totalCost)}</strong>
                  </td>
                  <td data-label="Cost / sq ft">
                    {areaSqft > 0 ? money(totalCost / areaSqft) : '—'}
                  </td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="boq-final-floor-detail-hint">
        Floor totals and the detailed measurements are part of this single BOQ;
        no second estimate is created.
      </p>
    </section>
  );
}
