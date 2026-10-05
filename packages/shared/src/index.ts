import { z } from 'zod';
import { isPublicKey, operationalLog } from './runtime';

export const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .refine(isPublicKey, 'Use a publishable or anon key'),
});

/** Validate lazily in an adapter, not at module load or during static builds. */
export function parsePublicEnvironment(
  environment: Record<string, string | undefined>,
) {
  return publicEnvironmentSchema.parse(environment);
}

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';
export interface SafeError {
  readonly code: ErrorCode;
  readonly requestId: string;
}

/** Allowlisted metadata only. Never attach request bodies, tokens or customer content. */
export interface LogEvent {
  readonly level: 'info' | 'warn' | 'error';
  readonly event: string;
  readonly requestId: string;
  readonly organizationId?: string;
  readonly errorCode?: ErrorCode;
}
export type LogSink = (event: LogEvent) => void;

export class DomainError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
    this.name = 'DomainError';
  }
}

export const idSchema = z.uuid();
export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});
export const signupSchema = loginSchema.extend({
  password: z.string().min(12).max(128),
  fullName: z.string().trim().min(1).max(200),
});
export const organizationInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
    country: z.string().regex(/^[A-Z]{2}$/),
    timezone: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Invalid timezone'),
    industryId: z.uuid().optional(),
  })
  .strict();
export const entitlementInputSchema = z
  .object({
    moduleKey: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(80),
    enabled: z.boolean(),
    source: z.enum(['addon', 'promotion', 'manual']),
    validFrom: z.iso.datetime({ offset: true }).optional(),
    validUntil: z.iso.datetime({ offset: true }).optional(),
    configuration: z.record(z.string(), z.json()).optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.validUntil ||
      Date.parse(value.validUntil) >
        Date.parse(value.validFrom ?? new Date().toISOString()),
    'Invalid interval',
  );
export const organizationUpdateSchema = z
  .object({
    organizationId: z.uuid(),
    status: z.enum(['active', 'trial', 'suspended', 'archived']),
    planId: z.uuid().nullable(),
  })
  .strict();

export const branchInputSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(200),
    code: z.string().min(1).max(50),
    status: z.enum(['active', 'inactive']).default('active'),
    timezone: z.string().min(1).max(100).optional(),
  })
  .strict();
export const membershipInputSchema = z
  .object({ userId: z.uuid(), branchId: z.uuid().optional() })
  .strict();
export const membershipStatusSchema = z
  .object({
    membershipId: z.uuid(),
    status: z.enum(['active', 'suspended', 'revoked']),
  })
  .strict();
export const roleAssignmentSchema = z
  .object({
    membershipId: z.uuid(),
    roleId: z.uuid(),
    branchId: z.uuid().optional(),
    remove: z.boolean().default(false),
  })
  .strict();
export const roleInputSchema = z
  .object({
    id: z.uuid().optional(),
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(64),
    name: z.string().min(1).max(100),
    permissions: z.array(z.string().min(1).max(100)).max(200),
  })
  .strict();
export const platformRoleInputSchema = z
  .object({
    userId: z.uuid(),
    roleId: z.uuid(),
    remove: z.boolean().default(false),
  })
  .strict();

export function safeFailure(error: unknown): {
  message: string;
  requestId: string;
} {
  const requestId = crypto.randomUUID();
  const code =
    error instanceof DomainError
      ? error.code
      : error instanceof z.ZodError
        ? 'VALIDATION_FAILED'
        : 'INTERNAL_ERROR';
  const messages: Record<ErrorCode, string> = {
    UNAUTHENTICATED: 'Sign in to continue.',
    FORBIDDEN: 'You do not have access to this resource.',
    VALIDATION_FAILED: 'Check the supplied values and try again.',
    NOT_FOUND: 'Resource unavailable.',
    CONFLICT: 'This operation conflicts with an existing record.',
    INTERNAL_ERROR: 'The operation could not be completed. Please try again.',
  };
  operationalLog({
    level: code === 'INTERNAL_ERROR' ? 'error' : 'warn',
    service: 'application',
    event: 'request.failed',
    requestId,
    errorCode: code,
  });
  return { message: messages[code], requestId };
}
