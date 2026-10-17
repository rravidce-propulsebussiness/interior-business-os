import 'server-only';
import { savedStagePaymentPlan } from '@business-os/core/quotation-payment-plan';
import type { GstStageInvoiceOption } from '@business-os/database/gst';

export type InvoiceStage = {
  number: number;
  name: string;
  percent: number;
  amount: number;
};
export type InvoiceStageChoice = {
  customerId: string;
  leadId: string;
  leadNumber: string;
  clientName: string;
  clientGstin: string;
  clientAddress: string;
  clientState: string;
  projectName: string;
  projectType: string;
  revisionId: string;
  quoteNumber: string;
  quoteTotal: number;
  stages: InvoiceStage[];
};

function billingAddress(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const parts = value as Record<string, unknown>;
  return ['line1','line2','city','region','postal_code']
    .map((key) => parts[key])
    .filter((item): item is string => typeof item === 'string' && !!item.trim())
    .join(', ');
}

export function invoiceStageChoices(
  options: GstStageInvoiceOption[], defaultState: string,
): InvoiceStageChoice[] {
  return options.flatMap((row) => {
    const stages = savedStagePaymentPlan(row.terms ?? '');
    const amount = Number(row.totals?.final_amount);
    if (!stages?.length || !Number.isFinite(amount) || amount <= 0 ||
        !row.leadId || !row.revisionId) return [];
    const cents = Math.round(amount * 100);
    let allotted = 0;
    const result: InvoiceStage[] = stages.map((stage, i) => {
      const value = i === stages.length - 1
        ? cents - allotted
        : Math.round(cents * stage.percent / 100);
      allotted += value;
      return { number: i + 1, name: stage.name, percent: stage.percent,
        amount: value / 100 };
    });
    if (result.some((stage) => stage.amount <= 0)) return [];
    const tax = String(row.clientGstin ?? '');
    const info = row.billingAddress && typeof row.billingAddress === 'object'
      ? row.billingAddress as Record<string, unknown> : {};
    const state = /^\d{2}/.exec(tax)?.[0] ??
      (typeof info.state_code === 'string' ? info.state_code : defaultState);
    return [{
      customerId: row.customerId,
      leadId: row.leadId, leadNumber: row.leadNumber ?? '',
      clientName: row.clientName || row.leadName || '',
      clientGstin: tax, clientAddress: billingAddress(info),
      clientState: /^\d{2}$/.test(state) ? state : defaultState,
      projectName: row.projectName ?? '', projectType: row.projectType ?? '',
      revisionId: row.revisionId, quoteNumber: row.quoteNumber ?? '',
      quoteTotal: amount, stages: result,
    }];
  });
}
