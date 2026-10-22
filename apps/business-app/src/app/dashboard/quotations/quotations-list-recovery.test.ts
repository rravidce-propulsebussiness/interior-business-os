import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const page=readFileSync(new URL('./page.tsx',import.meta.url),'utf8');

describe('Quotations list gracefully handles optional metadata errors',()=>{
 it('keeps core tenant-scoped authenticated search mandatory',()=>{
  expect(page).toContain("commercialServices('quotation.view', 'quotation', true)");
  expect(page).toContain("s.commercial.search(s.org, 'quotations'");
  expect(page).toContain("commercialSearchResultSchema.safeParse(result)");
  expect(page).toContain("throw new Error('Quotation search returned invalid data')");
 });
 it('does not crash if the Final-selection metadata RPC fails',()=>{
  expect(page).toContain("Final selection lookup unavailable");
  expect(page).toContain("Manually pinned Final lookup unavailable");
  expect(page).toContain("Final eligibility lookup unavailable");
  expect(page).toContain("const finalStatusAvailable = !finalChoiceError");
  expect(page).toContain("finalStatusAvailable && revision");
  expect(page).not.toContain("throw new Error('Could not load final quotation selections')");
  expect(page).not.toContain("throw new Error('Could not read manual final quotations')");
  expect(page).not.toContain("throw new Error('Could not read final quotation permissions')");
 });
 it('never presents unknown sharing or final state as confirmed',()=>{
  expect(page).toContain("Sharing unavailable");
  expect(page).toContain("sharingAvailable ? quotes.filter");
  expect(page).toContain("Some sharing or Final-selection details are unavailable");
  expect(page).toContain("finalStatusAvailable && revision?.quotation_id");
 });
});
