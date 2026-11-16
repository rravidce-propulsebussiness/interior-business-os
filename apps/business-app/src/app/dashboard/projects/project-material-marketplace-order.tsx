'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { requestMaterialFromMarketplace } from './[id]/site/stage-checklist-actions';
import type { StageMarketplaceProduct } from './project-v2-data';

const aliases: Record<string, string> = {
  ton: 'tonnes',
  mt: 'tonnes',
  tonne: 'tonnes',
  liter: 'litres',
  litre: 'litres',
  piece: 'nos',
  pieces: 'nos',
  number: 'nos',
  unit: 'nos',
  units: 'nos',
  pcs: 'nos',
  bag: 'bags',
  kilogram: 'kg',
  kilograms: 'kg',
  'square feet': 'sqft',
  'square foot': 'sqft',
  'square meters': 'sqm',
  'square metres': 'sqm',
  'cubic feet': 'cft',
  'cubic foot': 'cft',
  'cubic meters': 'cum',
  'cubic metres': 'cum',
  meter: 'metres',
  meters: 'metres',
  metre: 'metres',
  foot: 'feet',
  yard: 'yards',
};
export function normalizeMarketplaceUnit(unit: string): string {
  const normalized = unit.trim().toLowerCase();
  return aliases[normalized] ?? normalized;
}
type Material = {
  id: string;
  item: string;
  quantity: number;
  unit: string;
  status: string;
  source: string;
  vendorReference: string;
};
export function MaterialMarketplaceOrder({
  projectId,
  material,
  offers,
}: {
  projectId: string;
  material: Material;
  offers: StageMarketplaceProduct[];
}) {
  const router = useRouter();
  const [result, submit, pending] = useActionState(
    async (_old: { saved: boolean; message: string }, form: FormData) => {
      const response = await requestMaterialFromMarketplace(projectId, form);
      if (response.saved) router.refresh();
      return response;
    },
    { saved: false, message: '' },
  );
  const available = offers.filter(
    (p) =>
      normalizeMarketplaceUnit(p.unit) === material.unit &&
      material.quantity >= p.minQuantity &&
      material.quantity <= 1000000,
  );
  const activeMarketplace =
    material.source === 'marketplace' &&
    material.vendorReference.startsWith('Marketplace request ') &&
    !material.vendorReference.startsWith('Marketplace request rejected ');
  if (material.status === 'ordered' || material.status === 'received')
    return (
      <p className="pv2-hint">
        {material.status === 'ordered'
          ? 'Supplier confirmed. Record delivery separately after receiving materials.'
          : 'Delivery marked received.'}
      </p>
    );
  if (activeMarketplace)
    return (
      <p className="pv2-hint">
        Seller request sent. Awaiting supplier acceptance; delivery is not
        confirmed.
      </p>
    );
  if (material.status !== 'approved') return null;
  if (!available.length)
    return (
      <p className="pv2-hint">
        No compatible published marketplace product in the same unit and
        quantity. Review suppliers or record an outside supplier through
        Procurement.
      </p>
    );
  return (
    <details className="pv2-marketplace-purchase">
      <summary>Find supplier in marketplace</summary>
      <form action={submit} className="pv2-form">
        <input type="hidden" name="materialId" value={material.id} />
        <p className="pv2-hint">
          Approved requirement: <strong>{material.item}</strong> ·{' '}
          {material.quantity} {material.unit}. Check brand, grade and
          specifications before choosing a supplier.
        </p>
        <label>
          Supplier product
          <select name="productId" required defaultValue="">
            <option value="" disabled>
              Choose matching listing
            </option>
            {available.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} · {x.seller} · {x.currency} {x.price} / {x.unit}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="pv2-button pv2-primary"
          disabled={pending}
        >
          {pending ? 'Sending…' : 'Send order request to seller'}
        </button>
        <p className="pv2-hint">
          The supplier may accept or reject. This does not issue an invoice,
          collect payment or confirm delivery.
        </p>
        {!!result.message && (
          <p
            role="status"
            className={'pv2-form-feedback ' + (result.saved ? 'good' : 'bad')}
          >
            {result.message}
          </p>
        )}
      </form>
    </details>
  );
}
