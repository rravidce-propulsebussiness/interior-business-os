import { describe, expect, it } from 'vitest';
import {
  erpBoqCreateSchema,
  erpMappingMatchesRequestContext,
  erpBoqPositionCreateSchema,
  erpRequestContextSchema,
  erpTakeoffImportSchema,
} from './boq';

const id = '00000000-0000-4000-8000-000000000001';

describe('ERP boundary contracts', () => {
  it('requires an organization-bound, short-lived server context', () => {
    const parsed = erpRequestContextSchema.safeParse({
      issuer: 'https://business-os.internal',
      audience: 'openconstructionerp-internal',
      subjectUserId: id,
      organizationId: id,
      projectId: id,
      partitionId: id,
      permissions: ['boq.read'],
      requestId: id,
      issuedAt: 100,
      expiresAt: 200,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects expired, inverted, or excessively long server contexts', () => {
    const context = {
      issuer: 'https://business-os.internal',
      audience: 'openconstructionerp-internal',
      subjectUserId: id,
      organizationId: id,
      projectId: id,
      permissions: [],
      requestId: id,
      issuedAt: 200,
      expiresAt: 100,
    };

    expect(erpRequestContextSchema.safeParse(context).success).toBe(false);
    expect(
      erpRequestContextSchema.safeParse({
        ...context,
        expiresAt: 501,
      }).success,
    ).toBe(false);
  });

  it('defaults new BOQs to INR and draft-safe metadata', () => {
    expect(
      erpBoqCreateSchema.parse({ projectId: id, title: 'Ground floor BOQ' }),
    ).toMatchObject({ currency: 'INR', description: '', baseDate: null });
  });

  it('accepts decimal strings and rejects floating-point numbers for BOQ rates', () => {
    expect(
      erpBoqPositionCreateSchema.safeParse({
        description: 'RCC M25',
        quantity: '12.500',
        unit: 'm3',
        unitRate: '8500.00',
      }).success,
    ).toBe(true);

    expect(
      erpBoqPositionCreateSchema.safeParse({
        description: 'RCC M25',
        quantity: 12.5,
        unit: 'm3',
        unitRate: '8500.00',
      }).success,
    ).toBe(false);
  });

  it('requires takeoff idempotency and BOQ version preconditions', () => {
    expect(
      erpTakeoffImportSchema.safeParse({
        drawingId: id,
        measurements: [
          {
            externalReference: 'sheet-1:entity-12',
            description: 'Wall area',
            quantity: '24.50',
            unit: 'm2',
          },
        ],
        idempotencyKey: 'takeoff-import-000001',
        expectedBoqVersion: 3,
      }).success,
    ).toBe(true);
  });

  it('requires a complete server-resolved organization/project mapping', async () => {
    const { erpProjectMappingSchema } = await import('./boq');
    const mapping = {
      organizationId: id,
      businessProjectId: id,
      erpProjectId: id,
      partitionId: id,
      status: 'active',
      mappingVersion: 1,
    };
    expect(erpProjectMappingSchema.safeParse(mapping).success).toBe(true);
    expect(
      erpProjectMappingSchema.safeParse({
        ...mapping,
        partitionId: undefined,
      }).success,
    ).toBe(false);
    expect(
      erpProjectMappingSchema.safeParse({
        ...mapping,
        organizationId: 'not-a-uuid',
      }).success,
    ).toBe(false);
    expect(
      erpProjectMappingSchema.safeParse({
        ...mapping,
        status: 'active',
        clientSupplied: true,
      }).success,
    ).toBe(false);
  });


  it('rejects cross-organization, cross-project, cross-partition and inactive mappings', () => {
    const mapping = {
      organizationId: id,
      businessProjectId: id,
      erpProjectId: '00000000-0000-4000-8000-000000000002',
      partitionId: id,
      status: 'active' as const,
      mappingVersion: 1,
    };
    const context = {
      issuer: 'https://business-os.internal',
      audience: 'openconstructionerp-internal' as const,
      subjectUserId: id,
      organizationId: id,
      projectId: id,
      partitionId: id,
      permissions: ['boq.read'],
      requestId: id,
      issuedAt: 100,
      expiresAt: 200,
    };
    expect(erpMappingMatchesRequestContext(mapping, context)).toBe(true);
    expect(
      erpMappingMatchesRequestContext(mapping, {
        ...context,
        organizationId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toBe(false);
    expect(
      erpMappingMatchesRequestContext(mapping, {
        ...context,
        projectId: '00000000-0000-4000-8000-000000000004',
      }),
    ).toBe(false);
    expect(
      erpMappingMatchesRequestContext(mapping, {
        ...context,
        partitionId: '00000000-0000-4000-8000-000000000005',
      }),
    ).toBe(false);
    expect(
      erpMappingMatchesRequestContext(
        { ...mapping, status: 'suspended' },
        context,
      ),
    ).toBe(false);
  });

});
