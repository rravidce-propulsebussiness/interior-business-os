import {
  formatMoney,
  stringValue,
  type WorkspaceData,
} from './project-v2-data';
import {
  procurementVsBoq,
  type MaterialOrderInput,
} from './project-material-budget';

const amount = (value: unknown) => {
  const text = stringValue(value);
  const parsed = text === '' ? NaN : Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

/** BOQ material budget against what was ordered, by marketplace or outside. */
export function ProjectMaterialBudgetPanel({ d }: { d: WorkspaceData }) {
  const orders: MaterialOrderInput[] = (d.site?.materials ?? []).map((m) => ({
    item: stringValue(m.item),
    status: stringValue(m.status),
    source: stringValue(m.source),
    orderAmount: amount(m.order_amount),
    marketplaceTotal: amount(m.marketplace_total),
    marketplaceStatus: stringValue(m.marketplace_status),
  }));
  const rows = procurementVsBoq(d.materialBudget, orders);
  if (!rows.length) return null;
  const total = rows.reduce(
    (sum, row) => ({
      boq: sum.boq + row.boqAmount,
      marketplace: sum.marketplace + row.marketplace,
      outside: sum.outside + row.outside,
      unpriced: sum.unpriced + row.unpriced,
    }),
    { boq: 0, marketplace: 0, outside: 0, unpriced: 0 },
  );
  const ordered = total.marketplace + total.outside;
  return (
    <section
      className="pv2-panel pv2-material-budget"
      aria-labelledby="pv2-material-budget-heading"
    >
      <h2 id="pv2-material-budget-heading">Material spend vs BOQ</h2>
      <div className="pv2-material-budget-stats">
        <div>
          <small>BOQ materials</small>
          <strong>{d.materialBudget ? formatMoney(total.boq) : '—'}</strong>
        </div>
        <div>
          <small>Marketplace</small>
          <strong>{formatMoney(total.marketplace)}</strong>
        </div>
        <div>
          <small>Outside suppliers</small>
          <strong>{formatMoney(total.outside)}</strong>
        </div>
        <div>
          <small>Balance</small>
          <strong
            className={d.materialBudget && ordered > total.boq ? 'over' : ''}
          >
            {d.materialBudget ? formatMoney(total.boq - ordered) : '—'}
          </strong>
        </div>
      </div>
      {total.unpriced > 0 && (
        <p role="status" className="pv2-material-budget-note">
          {total.unpriced} ordered{' '}
          {total.unpriced === 1 ? 'request has' : 'requests have'} no order
          amount yet.
        </p>
      )}
      <div className="pv2-material-budget-table">
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th>BOQ qty</th>
              <th>BOQ</th>
              <th>Marketplace</th>
              <th>Outside</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.head}>
                <td>{row.head}</td>
                <td>
                  {row.boqQuantity
                    ? row.boqQuantity.toLocaleString('en-IN', {
                        maximumFractionDigits: 1,
                      }) +
                      ' ' +
                      (row.unit ?? '')
                    : '—'}
                </td>
                <td>{row.boqAmount ? formatMoney(row.boqAmount) : '—'}</td>
                <td>{row.marketplace ? formatMoney(row.marketplace) : '—'}</td>
                <td>{row.outside ? formatMoney(row.outside) : '—'}</td>
                <td className={row.boqAmount && row.balance < 0 ? 'over' : ''}>
                  {row.boqAmount ? formatMoney(row.balance) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
