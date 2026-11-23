/**
 * Payment stage percentages travel as decimal strings. Floor-wise amounts
 * (e.g. ₹1,72,824.80 of ₹1,08,01,550) are rarely whole percentages, so the
 * editor sends 8 decimals and the terms marker stores 8 decimals. The route
 * must accept exactly what the editor sends.
 */
export const PAYMENT_PERCENT_DECIMALS = 8;

export const PAYMENT_PERCENT_PATTERN = /^\d+(?:\.\d{1,8})?$/;

export const formatPaymentPercent = (percent: number) =>
  percent.toFixed(PAYMENT_PERCENT_DECIMALS);
