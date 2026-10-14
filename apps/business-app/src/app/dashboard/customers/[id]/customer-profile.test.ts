import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const style = readFileSync(
  new URL('./customer-profile.css', import.meta.url),
  'utf8',
);

describe('Customer Profile uses one navigation and one copy of related actions', () => {
  it('keeps the customer record and its protected company navigation', () => {
    expect(page).toContain("from '../../owner-shell'");
    expect(page).toContain('<OwnerShell');
    expect(page).toContain("currentHref=\"/dashboard/customers\"");
    expect(page).toContain("from('customers')");
    expect(page).toContain('Customer account');
  });

  it('links back to original converted leads without duplicating lead records', () => {
    expect(page).toContain('<OriginLeads customerId={id} />');
    expect(page).toContain('cp-origin-near-header');
    expect(page).not.toContain("from('leads').insert");
  });

  it('does not render an extra fixed bottom navigation or repeated related-records menu', () => {
    expect(page).not.toContain('cp-mobile-nav');
    expect(style).not.toContain('.cp-mobile-nav');
    expect(page).not.toContain('id="records"');
    expect(page).not.toContain('id="payments"');
    expect(page).not.toContain('href="#payments"');
    expect(page).toContain('label="Account statement"');
    expect(page).toContain('href={canSeeStatement ? statementHref : undefined}');
    expect(page).toContain('id="projects"');
    expect(page).toContain('id="quotes"');
    expect(page).toContain('id="activity"');
  });
});
