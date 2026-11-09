export type SheetContact = { phone: string; name: string };

/** Split one CSV line, honouring double-quoted cells. */
function splitCsvLine(line: string) {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',' || char === ';' || char === '\t') {
      cells.push(cell.trim());
      cell = '';
    } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

/**
 * WhatsApp number in international digits. Ten-digit Indian mobiles get the
 * 91 country code; anything that is not 8–15 digits is rejected.
 */
export function normalisePhone(raw: string, defaultCountry = '91') {
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (/^0\d{10}$/.test(digits)) digits = defaultCountry + digits.slice(1);
  else if (/^[6-9]\d{9}$/.test(digits)) digits = defaultCountry + digits;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/**
 * Read contacts from a CSV exported from Excel or Google Sheets. A header row
 * with "phone"/"mobile"/"number"/"whatsapp" and "name" columns is used when
 * present; otherwise the first column with a valid number is the phone and
 * the next text cell is the name. Duplicates are merged.
 */
export function parseContactSheet(text: string) {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const contacts: SheetContact[] = [];
  const invalid: string[] = [];
  if (!lines.length) return { contacts, invalid };
  const header = splitCsvLine(lines[0]!).map((cell) => cell.toLowerCase());
  const phoneIndex = header.findIndex((cell) =>
    /phone|mobile|number|whatsapp|contact/.test(cell),
  );
  const nameIndex = header.findIndex((cell) => /name/.test(cell));
  const hasHeader = phoneIndex >= 0 && !normalisePhone(lines[0]!);
  const seen = new Set<string>();
  for (const line of hasHeader ? lines.slice(1) : lines) {
    const cells = splitCsvLine(line);
    let phone: string | null = null;
    let name = '';
    if (hasHeader) {
      phone = normalisePhone(cells[phoneIndex] ?? '');
      name = nameIndex >= 0 ? (cells[nameIndex] ?? '') : '';
    } else {
      const at = cells.findIndex((cell) => normalisePhone(cell));
      phone = at >= 0 ? normalisePhone(cells[at]!) : null;
      name = cells.find((cell, i) => i !== at && /[a-z]/i.test(cell)) ?? '';
    }
    if (!phone) {
      invalid.push(line.slice(0, 60));
      continue;
    }
    if (seen.has(phone)) continue;
    seen.add(phone);
    contacts.push({ phone, name: name.slice(0, 120) });
  }
  return { contacts, invalid };
}
