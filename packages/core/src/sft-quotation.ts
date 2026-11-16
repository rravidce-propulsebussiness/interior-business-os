import { z } from 'zod';

/** Length and width are measured in feet; monetary rates are INR per SFT. */
const positive = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,3})(\.[0-9]{1,2})?$/)
  .refine((value) => Number(value) > 0, 'Enter a positive dimension');
const rate = z.string().regex(/^(0|[1-9][0-9]{0,5})(\.[0-9]{1,2})?$/);
const workKind = z.enum(['floor', 'additional']);
const workUnit = z.enum([
  'sqft',
  'wall_sqft',
  'running_ft',
  'cubic_ft',
  'piece',
  'lumpsum',
]);
const inputRow = z
  .object({
    name: z.string().trim().min(2).max(90),
    kind: workKind.optional(),
    // Upper construction floors follow the floor below until customized.
    // Old V1/V2 quotation snapshots remain valid without this field.
    inheritFromPrevious: z.boolean().optional(),
    lengthFeet: positive,
    widthFeet: positive,
    // Optional for backward-compatible older estimates; height is only billed
    // for wall-area or volume measurements, never silently for floor SFT.
    heightFeet: z.union([z.literal(''), positive]).optional(),
    quantity: z.union([z.literal(''), positive]).optional(),
    unit: workUnit.optional(),
    ratePerSqft: rate,
  })
  .strict();

export const sftSectionSchema = z
  .object({
    title: z.string().trim().min(2).max(90),
    description: z.string().trim().max(1100),
    brand: z.string().trim().max(120).optional(),
    grade: z.string().trim().max(120).optional(),
    allowancePerSqft: z.string().trim().max(40).optional(),
  })
  .strict();

export const sftEstimateInputSchema = z
  .object({
    rows: z
      .array(inputRow)
      .min(1)
      .max(18)
      .refine(
        (rows) => rows.some((row) => (row.kind ?? 'floor') === 'floor'),
        'At least one floor is required',
      ),
    materialIds: z
      .array(z.uuid())
      .max(20)
      .refine((x) => new Set(x).size === x.length),
    packageId: z.uuid().nullable().optional(),
    sections: z.array(sftSectionSchema).max(18).optional(),
  })
  .strict();

export const sftMaterialSchema = z
  .object({
    category: z.string().min(1).max(50),
    name: z.string().min(1).max(120),
    specification: z.string().max(250),
  })
  .strict();

export const sftPackageSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().min(1).max(120),
    code: z.string().min(1).max(30),
    description: z.string().max(600),
    ratePerSqft: rate,
    themeColor: z
      .string()
      .regex(/^#[A-Fa-f0-9]{6}$/)
      .optional(),
  })
  .strict();

const detailSchema = z
  .object({
    rows: z
      .array(
        inputRow
          .extend({
            areaSqft: z.string(),
            amount: z.string(),
          })
          .strict(),
      )
      .min(1)
      .max(18),
    totalAreaSqft: z.string(),
    additionalAreaSqft: z.string().optional(),
    total: z.string(),
    materials: z.array(sftMaterialSchema).max(20),
    package: sftPackageSchema.optional(),
    sections: z.array(sftSectionSchema).max(18).optional(),
  })
  .strict();

export type SftEstimateDetails = z.infer<typeof detailSchema>;
/**
 * Quotation snapshots contain calculated areaSqft and amount for display/PDF.
 * Those fields are forbidden by the strict save-input schema. Convert saved
 * snapshots back into editable source rows before passing them to React.
 * Preserves ALL user-entered dimensions, floor linkage and custom rates.
 */
export function editableSftRows(
  saved: Pick<SftEstimateDetails, 'rows'>,
): z.infer<typeof inputRow>[] {
  return saved.rows.map((row) => ({
    name: row.name,
    ...(row.kind ? { kind: row.kind } : {}),
    lengthFeet: row.lengthFeet,
    widthFeet: row.widthFeet,
    ...(row.heightFeet !== undefined ? { heightFeet: row.heightFeet } : {}),
    ...(row.quantity !== undefined ? { quantity: row.quantity } : {}),
    ...(row.unit ? { unit: row.unit } : {}),
    ratePerSqft: row.ratePerSqft,
    ...(row.inheritFromPrevious !== undefined
      ? { inheritFromPrevious: row.inheritFromPrevious }
      : {}),
  }));
}

export const SFT_ESTIMATE_PREFIX = 'SFT_ESTIMATE_V1:';
export const SFT_ESTIMATE_PREFIX_V2 = 'SFT_ESTIMATE_V2:';

const hundredths = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt((fraction + '00').slice(0, 2));
};
const decimal = (value: bigint) => {
  const integer = value / 100n;
  const fractional = (value % 100n).toString().padStart(2, '0');
  return integer + '.' + fractional;
};

/** Package metadata must be resolved from the company database on save. */
export function calculateSftEstimate(
  raw: unknown,
  materialOptions: unknown = [],
  packageSnapshot?: unknown,
): SftEstimateDetails {
  const input = sftEstimateInputSchema.parse(raw);
  const materials = z.array(sftMaterialSchema).max(20).parse(materialOptions);
  const selectedPackage = packageSnapshot
    ? sftPackageSchema.parse(packageSnapshot)
    : undefined;
  if (materials.length !== input.materialIds.length)
    throw new Error('Unavailable material selections');

  let builtUpArea = 0n;
  let additionalArea = 0n;
  let totalAmount = 0n;
  const rows = input.rows.map((row) => {
    const length = hundredths(row.lengthFeet);
    const width = hundredths(row.widthFeet);
    const unit = row.unit ?? 'sqft';
    const height = row.heightFeet ? hundredths(row.heightFeet) : 0n;
    const quantity = row.quantity ? hundredths(row.quantity) : 100n;
    // Area/quantity stored with two-decimal precision, including non-SFT
    // optional works. The PDF renderer displays the correct measurement unit.
    const area =
      unit === 'piece'
        ? quantity
        : unit === 'lumpsum'
          ? 100n
          : unit === 'running_ft'
            ? length
            : unit === 'wall_sqft'
              ? (length * height + 50n) / 100n
              : unit === 'cubic_ft'
                ? (length * width * height + 5000n) / 10000n
                : (length * width + 50n) / 100n;
    if (area <= 0n || area > 100000000n)
      throw new Error('Invalid calculated measurement');
    if ((row.kind ?? 'floor') === 'floor' && unit !== 'sqft')
      throw new Error('Floor construction area must use SFT');
    const amount = (area * hundredths(row.ratePerSqft) + 50n) / 100n;
    if ((row.kind ?? 'floor') === 'additional') {
      if (unit === 'sqft' || unit === 'wall_sqft') additionalArea += area;
    } else builtUpArea += area;
    totalAmount += amount;
    if (totalAmount > 99999999999999n)
      throw new Error('Estimate amount too large');
    return { ...row, areaSqft: decimal(area), amount: decimal(amount) };
  });
  if (totalAmount <= 0n)
    throw new Error('Enter at least one positive construction rate');
  return detailSchema.parse({
    rows,
    totalAreaSqft: decimal(builtUpArea),
    additionalAreaSqft: decimal(additionalArea),
    total: decimal(totalAmount),
    materials,
    ...(selectedPackage ? { package: selectedPackage } : {}),
    ...(input.sections ? { sections: input.sections } : {}),
  });
}

export function encodeSftEstimate(details: SftEstimateDetails): string {
  const result =
    SFT_ESTIMATE_PREFIX_V2 + JSON.stringify(detailSchema.parse(details));
  if (result.length > 14000)
    throw new Error('Reduce floor rows or specification text');
  return result;
}

export function parseSftEstimate(
  description: string,
): SftEstimateDetails | null {
  const prefix = description.startsWith(SFT_ESTIMATE_PREFIX_V2)
    ? SFT_ESTIMATE_PREFIX_V2
    : description.startsWith(SFT_ESTIMATE_PREFIX)
      ? SFT_ESTIMATE_PREFIX
      : null;
  if (!prefix) return null;
  try {
    if (description.length > 14000) return null;
    const value: unknown = JSON.parse(description.slice(prefix.length));
    return detailSchema.parse(value);
  } catch {
    return null;
  }
}
