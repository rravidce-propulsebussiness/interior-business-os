import { describe, expect, it } from 'vitest';
import { suggestedStageMaterials,suggestedActivityMaterials } from './stage-material-options';

describe('Work-specific material suggestions',()=>{
 const foundation=suggestedStageMaterials('FOUNDATION');
 it('suggests PCC ingredients when the PCC work card opens',()=>{
  const result=suggestedActivityMaterials('PCC preparation, concrete placement, curing and inspection',foundation);
  expect(result).toContain('PCC cement');
  expect(result).toContain('Coarse aggregate');
  expect(result).not.toContain('TMT steel 20 mm');
 });
 it('suggests reinforcement products without treating all foundation materials as required',()=>{
  const result=suggestedActivityMaterials('Bar bending schedule, cutting, tying and reinforcement fixing',foundation);
  expect(result).toContain('TMT steel 12 mm');
  expect(result).toContain('Binding wire');
  expect(result).not.toContain('PCC cement');
 });
 it('offers marking products for layout work and avoids pretending unfamiliar activities have a BOQ',()=>{
  const result=suggestedActivityMaterials('Footing layout and dimensions verification',foundation);
  expect(result).toContain('Marking lime / chalk powder');
  expect(suggestedActivityMaterials('Mandatory pre-concrete structural inspection',foundation)).toEqual([]);
 });
 it('does not repeat materials or exceed twelve suggestions',()=>{
  const result=suggestedActivityMaterials('PCC and steel shuttering',foundation);
  expect(result.length).toBeLessThanOrEqual(12);
  expect(new Set(result).size).toBe(result.length);
 });
});
