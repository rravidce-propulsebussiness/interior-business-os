import { z } from 'zod';

/**
 * Server-side persistence contract for the single structural drawing.
 * Keep new schedule arrays here: the default z.object() behavior strips keys
 * not explicitly declared, which would silently erase measured quantities.
 */
export const structuralDesignSchema = z.object({
  footings: z.array(z.record(z.string(), z.unknown())).max(40).optional(),
  legacyFootings: z.boolean().optional(),
  columns: z.array(z.record(z.string(), z.unknown())).max(20),
  beams: z.array(z.record(z.string(), z.unknown())).max(20),
  plinthBeams: z.array(z.record(z.string(), z.unknown())).max(40).optional(),
  slabPanels: z.array(z.record(z.string(), z.unknown())).max(100).optional(),
  staircases: z.array(z.record(z.string(), z.unknown())).max(60).optional(),
  plinthRunFeet: z.number().finite().nonnegative(),
  settings: z.record(z.string().max(40), z.number().finite()).optional(),
});
