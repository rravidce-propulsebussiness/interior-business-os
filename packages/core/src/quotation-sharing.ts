import { z } from 'zod';
import { customerDocumentSchema } from './quotation-document';
export const shareTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const customerResponseSchema = z
  .object({
    action: z.enum(['approved', 'changes_requested', 'declined']),
    name: z.string().trim().min(1).max(200),
    comment: z.string().trim().max(3000),
    acknowledged: z.literal(true),
  })
  .strict()
  .refine(
    (x) => x.action !== 'changes_requested' || x.comment.length > 0,
    'Describe the requested changes.',
  );
export const publicQuotationSchema = z.object({
  document: customerDocumentSchema,
  issued_at: z.string(),
  expired: z.boolean(),
  pdf_enabled: z.boolean(),
  can_respond: z.boolean(),
  response: z
    .object({
      action: z.enum(['approved', 'changes_requested', 'declined']),
      name: z.string(),
      comment: z.string(),
      responded_at: z.string(),
    })
    .nullable(),
});
export const shareCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create'),
      revision_id: z.uuid(),
      expires_at: z.iso.datetime({ offset: true }).nullable(),
      pdf_enabled: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal('revoke'), id: z.uuid() }).strict(),
  z
    .object({
      action: z.literal('rotate'),
      id: z.uuid(),
      expires_at: z.iso.datetime({ offset: true }).nullable(),
      pdf_enabled: z.boolean(),
    })
    .strict(),
]);
