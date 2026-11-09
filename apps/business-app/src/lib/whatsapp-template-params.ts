/** Number of {{n}} placeholders a template body needs (highest index). */
export function templatePlaceholderCount(bodyText?: string) {
  if (!bodyText) return 0;
  return Math.max(
    0,
    ...[...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map((match) =>
      Number(match[1]),
    ),
  );
}

/**
 * Fill broadcast values for one recipient: {{name}} becomes the contact's
 * name (or "there"), and empty results fall back to "-" because Meta rejects
 * empty template parameters.
 */
export function personaliseParameters(values: string[], name: string) {
  const display = name.trim() || 'there';
  return values.map((value) => {
    const filled = value.replace(/\{\{\s*name\s*\}\}/gi, display).trim();
    return (filled || '-').slice(0, 1024);
  });
}
