type SteelOutput = {
  name: string;
  quantity: number;
  unit: string;
  material?: string;
  weightKg?: number;
  rods?: number;
  diameter?: number;
  source?: string;
};

export const MEASURED_BINDING_SOURCE = 'Binding wire from measured steel';

/** Rebuild the derived allowance on the member, never bill it twice. */
export function withMeasuredBindingWire<T extends SteelOutput>(
  outputs: T[],
  kgPerTonne: number,
  stockFeet: number,
): (T | SteelOutput)[] {
  const retained = outputs.filter(
    (output) =>
      !(
        output.material === 'binding_wire' &&
        output.source?.startsWith(MEASURED_BINDING_SOURCE)
      ),
  );
  if (retained.some((output) => output.material === 'binding_wire'))
    return retained;
  const steelKg = retained.reduce((sum, output) => {
    if (output.material !== 'steel' || !(output.quantity > 0)) return sum;
    if (output.unit === 'kg') return sum + output.quantity;
    if (output.unit !== 'rod') return sum;
    const kgPerRod =
      output.weightKg && output.rods
        ? output.weightKg / output.rods
        : output.diameter
          ? (stockFeet * 0.3048 * output.diameter ** 2) / 162
          : 0;
    return sum + output.quantity * kgPerRod;
  }, 0);
  if (!(steelKg > 0 && kgPerTonne > 0)) return retained;
  return [
    ...retained,
    {
      name: 'Binding wire',
      material: 'binding_wire',
      quantity: Math.round((steelKg * kgPerTonne) / 100) / 10,
      unit: 'kg',
      source: MEASURED_BINDING_SOURCE + ' · ' + kgPerTonne + ' kg/tonne',
    },
  ];
}
