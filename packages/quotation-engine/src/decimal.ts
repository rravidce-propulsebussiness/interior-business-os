/** Exact rational arithmetic; input decimals are bounded by domain schemas. */
export class Decimal {
  constructor(
    readonly n: bigint,
    readonly d = 1n,
  ) {
    if (d <= 0n) throw new Error('Invalid denominator');
  }
  static from(value: string): Decimal {
    if (!/^-?\d+(\.\d+)?$/.test(value)) throw new Error('Invalid decimal');
    const [whole = '0', fraction = ''] = value.split('.');
    return new Decimal(
      BigInt(whole + fraction),
      10n ** BigInt(fraction.length),
    );
  }
  add(b: Decimal) {
    return new Decimal(this.n * b.d + b.n * this.d, this.d * b.d);
  }
  sub(b: Decimal) {
    return this.add(new Decimal(-b.n, b.d));
  }
  mul(b: Decimal) {
    return new Decimal(this.n * b.n, this.d * b.d);
  }
  compare(b: Decimal) {
    const n = this.n * b.d - b.n * this.d;
    return n < 0n ? -1 : n > 0n ? 1 : 0;
  }
  round(step: Decimal, mode: 'nearest' | 'up' | 'down') {
    if (step.n <= 0n || this.n < 0n) throw new Error('Invalid rounding');
    const n = this.n * step.d,
      d = this.d * step.n;
    let units = n / d;
    if (
      (mode === 'up' && n % d !== 0n) ||
      (mode === 'nearest' && 2n * (n % d) >= d)
    )
      units++;
    return new Decimal(units).mul(step);
  }
  toString(): string {
    const sign = this.n < 0n ? '-' : '',
      n = this.n < 0n ? -this.n : this.n;
    let remainder = n % this.d,
      fraction = '';
    while (remainder) {
      if (fraction.length > 100) throw new Error('Non-terminating decimal');
      remainder *= 10n;
      fraction += String(remainder / this.d);
      remainder %= this.d;
    }
    return sign + String(n / this.d) + (fraction ? '.' + fraction : '');
  }
}
