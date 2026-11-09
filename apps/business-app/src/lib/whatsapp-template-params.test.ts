import { describe, expect, it } from 'vitest';
import {
  personaliseParameters,
  templatePlaceholderCount,
} from './whatsapp-template-params';

describe('broadcast template values', () => {
  it('counts the highest placeholder', () => {
    expect(templatePlaceholderCount('Hi {{1}}, your {{2}} is ready')).toBe(2);
    expect(templatePlaceholderCount('No placeholders')).toBe(0);
    expect(templatePlaceholderCount(undefined)).toBe(0);
  });

  it('fills {{name}} per recipient and never sends empty values', () => {
    expect(personaliseParameters(['{{name}}', '2BHK'], 'Ravi')).toEqual([
      'Ravi',
      '2BHK',
    ]);
    expect(personaliseParameters(['Hi {{ NAME }}', ''], '')).toEqual([
      'Hi there',
      '-',
    ]);
  });
});
