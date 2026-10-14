export type CustomerContact = { phone: string; email: string };

export function normalizedCustomerPhone(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  return digits;
}

export function contactMatches(
  customer: CustomerContact,
  entered: CustomerContact,
): boolean {
  const phone = normalizedCustomerPhone(entered.phone);
  const email = entered.email.trim().toLowerCase();
  const storedPhone = normalizedCustomerPhone(customer.phone);
  const storedEmail = customer.email.trim().toLowerCase();
  return Boolean(
    (phone && storedPhone && phone === storedPhone) ||
      (email && storedEmail && email === storedEmail),
  );
}
