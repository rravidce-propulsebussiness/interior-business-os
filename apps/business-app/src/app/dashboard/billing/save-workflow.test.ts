import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  saveCustomerDocument: vi.fn(),
  saveStageDocument: vi.fn(),
  saveWonLeadDocument: vi.fn(),
  saveDocument: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error('REDIRECT:' + path);
  },
}));
vi.mock('@business-os/auth/server', () => ({
  activeOrganization: async () => ({ organizationId: 'org-one' }),
  serverServices: async () => ({
    authorization: { requirePermission: mocks.requirePermission },
    client: {},
  }),
}));
vi.mock('@business-os/database/gst', () => ({
  createGstRepository: () => mocks,
}));
vi.mock('@business-os/database/gst-templates', () => ({
  createGstTemplatesRepository: () => mocks,
}));
vi.mock('./supplier-bill-storage', () => ({
  saveSupplierBillAttachment: vi.fn(),
}));
import { saveGstDocument } from './actions';

const invoiceId = '00000000-0000-4000-8000-000000000001';
const customerId = '00000000-0000-4000-8000-000000000002';
function form() {
  const value = new FormData();
  Object.entries({
    kind: 'sales_invoice',
    documentType: 'tax_invoice',
    date: '2026-10-21',
    dueDate: '2026-10-28',
    partyName: 'Test Client',
    partyState: '36',
    placeOfSupply: '36',
    customerId,
    linesJson: JSON.stringify([
      {
        description: 'Cabinet work',
        hsnSac: '9954',
        unit: 'each',
        quantity: 2,
        unitPrice: 1000,
        discount: 0,
        gstRate: 18,
      },
    ]),
  }).forEach(([key, val]) => value.set(key, val));
  return value;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.saveCustomerDocument.mockResolvedValue(invoiceId);
});
describe('GST invoice save server action', () => {
  it('saves a tenant-linked draft and redirects only after persistence', async () => {
    await expect(saveGstDocument(form())).rejects.toThrow(
      'REDIRECT:/dashboard/billing/' + invoiceId + '?saved=1',
    );
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      'org-one',
      'invoice.create',
    );
    expect(mocks.saveCustomerDocument).toHaveBeenCalledWith(
      'org-one',
      expect.objectContaining({
        kind: 'sales_invoice',
        lines: expect.any(Array),
      }),
      customerId,
    );
    const payload = mocks.saveCustomerDocument.mock.calls[0]![1];
    expect(payload).not.toHaveProperty('total');
    expect(payload).not.toHaveProperty('number');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/finance');
  });
  it('sends the saved ID and version and checks edit permission', async () => {
    const value = form();
    value.set('id', invoiceId);
    value.set('version', '3');
    await expect(saveGstDocument(value)).rejects.toThrow('REDIRECT:');
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      'org-one',
      'invoice.manage',
    );
    expect(mocks.saveCustomerDocument).toHaveBeenCalledWith(
      'org-one',
      expect.objectContaining({ id: invoiceId, version: 3 }),
      customerId,
    );
  });
  it('returns a validation error without redirecting or losing the form', async () => {
    const value = form();
    value.set('partyName', '');
    const result = await saveGstDocument(value);
    expect(result.message).not.toBe('');
    expect(mocks.saveCustomerDocument).not.toHaveBeenCalled();
    expect(value.get('linesJson')).toContain('Cabinet work');
  });
  it('rejects client-supplied calculated tax fields', async () => {
    const value = form();
    const lines = JSON.parse(String(value.get('linesJson')));
    lines[0].total = 1;
    value.set('linesJson', JSON.stringify(lines));
    expect((await saveGstDocument(value)).message).not.toBe('');
    expect(mocks.saveCustomerDocument).not.toHaveBeenCalled();
  });
  it('does not write or redirect after denied edit permission', async () => {
    mocks.requirePermission.mockRejectedValue(new Error('denied'));
    const value = form();
    value.set('id', invoiceId);
    value.set('version', '3');
    expect((await saveGstDocument(value)).message).not.toBe('');
    expect(mocks.saveCustomerDocument).not.toHaveBeenCalled();
  });
  it('rejects mixed customer and stage associations', async () => {
    const value = form();
    value.set('leadId', invoiceId);
    expect((await saveGstDocument(value)).message).not.toBe('');
    expect(mocks.saveCustomerDocument).not.toHaveBeenCalled();
    expect(mocks.saveStageDocument).not.toHaveBeenCalled();
  });
  it('returns persistence failures instead of claiming success', async () => {
    mocks.saveCustomerDocument.mockRejectedValue(
      new Error('database unavailable'),
    );
    expect((await saveGstDocument(form())).message).not.toBe('');
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
