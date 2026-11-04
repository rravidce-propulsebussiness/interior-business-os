import { z } from 'zod';

/**
 * Contracts for the Business OS -> ERP server boundary.
 *
 * These schemas validate payload shape only. They do not authenticate a caller,
 * authorize an organization, or prove that a project/BOQ belongs to a tenant.
 * Those checks must happen server-side in both the gateway and ERP service.
 */

export const erpIdSchema = z.uuid();

export const erpDecimalSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,11})(\.\d{1,6})?$/,
    'Expected a non-negative decimal string',
  );

export const erpUnitSchema = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[a-zA-Z][a-zA-Z0-9_./ -]*$/);

export const erpRequestContextSchema = z
  .object({
    issuer: z.string().url(),
    audience: z.literal('openconstructionerp-internal'),
    subjectUserId: erpIdSchema,
    organizationId: erpIdSchema,
    projectId: erpIdSchema,
    permissions: z.array(z.string().min(1).max(100)).max(100),
    requestId: z.uuid(),
    issuedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
  })
  .strict()
  .refine((value) => value.expiresAt > value.issuedAt, {
    message: 'Context expiry must be after issue time',
    path: ['expiresAt'],
  })
  .refine((value) => value.expiresAt - value.issuedAt <= 300, {
    message: 'Context lifetime must not exceed 300 seconds',
    path: ['expiresAt'],
  });

export const erpBoqCreateSchema = z
  .object({
    projectId: erpIdSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).default(''),
    currency: z.string().regex(/^[A-Z]{3}$/).default('INR'),
    baseDate: z.iso.date().nullable().default(null),
  })
  .strict();

export const erpBoqPositionCreateSchema = z
  .object({
    sectionId: erpIdSchema.nullable().default(null),
    code: z.string().trim().max(80).default(''),
    description: z.string().trim().min(1).max(2000),
    quantity: erpDecimalSchema,
    unit: erpUnitSchema,
    unitRate: erpDecimalSchema,
    source: z.enum(['manual', 'drawing_takeoff', 'assembly']).default('manual'),
    sourceReference: z.string().trim().max(200).nullable().default(null),
  })
  .strict();

export const erpBoqPositionSchema = z
  .object({
    id: erpIdSchema,
    boqId: erpIdSchema,
    sectionId: erpIdSchema.nullable(),
    code: z.string(),
    description: z.string(),
    quantity: erpDecimalSchema,
    unit: erpUnitSchema,
    unitRate: erpDecimalSchema,
    lineTotal: erpDecimalSchema,
    version: z.number().int().positive(),
  })
  .strict();

export const erpBoqSchema = z
  .object({
    id: erpIdSchema,
    projectId: erpIdSchema,
    title: z.string(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    status: z.enum(['draft', 'review', 'approved', 'issued', 'archived']),
    version: z.number().int().positive(),
    positions: z.array(erpBoqPositionSchema).max(10000),
  })
  .strict();

export const erpTakeoffImportSchema = z
  .object({
    drawingId: erpIdSchema,
    drawingRevisionId: erpIdSchema.nullable().default(null),
    measurements: z
      .array(
        z
          .object({
            externalReference: z.string().trim().min(1).max(200),
            description: z.string().trim().min(1).max(500),
            quantity: erpDecimalSchema,
            unit: erpUnitSchema,
            confidence: z.number().min(0).max(1).nullable().default(null),
          })
          .strict(),
      )
      .min(1)
      .max(5000),
    idempotencyKey: z.string().trim().min(16).max(128),
    expectedBoqVersion: z.number().int().positive(),
  })
  .strict();

export type ErpRequestContext = z.infer<typeof erpRequestContextSchema>;
export type ErpBoqCreate = z.infer<typeof erpBoqCreateSchema>;
export type ErpBoqPositionCreate = z.infer<typeof erpBoqPositionCreateSchema>;
export type ErpBoq = z.infer<typeof erpBoqSchema>;
export type ErpTakeoffImport = z.infer<typeof erpTakeoffImportSchema>;
