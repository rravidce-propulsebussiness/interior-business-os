import { describe, expect, it } from 'vitest';
import {
  areaSqft,
  buildQuoteMessage,
  confirmationParameters,
  detailsSummary,
  mapMetaLead,
  templateValue,
  whatsappId,
} from './meta-lead-fields';

const lead = {
  id: '300000000000001',
  campaign_name: 'Diwali interiors',
  ad_name: 'Kitchen reel',
  platform: 'ig',
  field_data: [
    { name: 'full_name', values: ['Asha Rao'] },
    { name: 'phone_number', values: ['+919000000001'] },
    { name: 'email', values: ['asha@example.test'] },
    { name: 'city', values: ['Hyderabad'] },
    { name: 'what_service_do_you_need?', values: ['Full home interiors'] },
    { name: 'built_up_area_in_sqft', values: ['1,800'] },
    { name: 'budget', values: ['15 lakh'] },
  ],
};

describe('mapMetaLead', () => {
  it('maps standard and custom questions onto CRM lead fields', () => {
    const mapped = mapMetaLead(lead);
    expect(mapped).toMatchObject({
      name: 'Asha Rao',
      phone: '+919000000001',
      email: 'asha@example.test',
      location: 'Hyderabad',
      service_type: 'Full home interiors',
      project_size: '1,800',
      wa_id: '919000000001',
      platform: 'ig',
    });
    expect(mapped.notes).toContain('Budget: 15 lakh');
    expect(mapped.notes).toContain('Campaign: Diwali interiors');
    expect(mapped.details.map((d) => d.label)).toEqual([
      'City',
      'What service do you need?',
      'Built up area in sqft',
      'Budget',
    ]);
  });

  it('joins first and last name and tolerates missing or malformed fields', () => {
    const mapped = mapMetaLead({
      field_data: [
        { name: 'first_name', values: ['Kiran'] },
        { name: 'last_name', values: ['Kumar'] },
        { name: 'mobile_number', values: '9000000004' },
        null,
        { name: 'empty', values: [] },
      ],
    });
    expect(mapped.name).toBe('Kiran Kumar');
    expect(mapped.phone).toBe('9000000004');
    expect(mapped.wa_id).toBe('919000000004');
    expect(mapped.details).toEqual([]);
    expect(mapMetaLead({}).phone).toBe('');
  });

  it('does not mistake a company name or an area size for the person or place', () => {
    const mapped = mapMetaLead({
      field_data: [
        { name: 'company_name', values: ['Acme'] },
        { name: 'full_name', values: ['Ravi'] },
        { name: 'phone_number', values: ['+919000000005'] },
        { name: 'area', values: ['Kondapur'] },
        { name: 'flat_size', values: ['3 BHK'] },
      ],
    });
    expect(mapped.name).toBe('Ravi');
    expect(mapped.location).toBe('Kondapur');
    expect(mapped.project_size).toBe('3 BHK');
  });
});

describe('whatsappId', () => {
  it('normalises local, zero-prefixed and international numbers', () => {
    expect(whatsappId('90000 00001')).toBe('919000000001');
    expect(whatsappId('09000000001')).toBe('919000000001');
    expect(whatsappId('+971 50 123 4567')).toBe('971501234567');
    expect(whatsappId('00971501234567')).toBe('971501234567');
    expect(whatsappId('9000000001', '971')).toBe('9719000000001');
  });
  it('rejects numbers that cannot be messaged', () => {
    expect(whatsappId('12345')).toBe('');
    expect(whatsappId('abc')).toBe('');
    expect(whatsappId('')).toBe('');
  });
});

describe('confirmation template values', () => {
  it('never sends new lines, tabs or blanks to Meta', () => {
    expect(templateValue('a\n\tb    c')).toBe('a b c');
    expect(templateValue('   ')).toBe('-');
  });
  it('summarises details within the limit and falls back when there are none', () => {
    expect(
      detailsSummary([
        { label: 'City', value: 'Hyderabad' },
        { label: 'Budget', value: '15 lakh' },
      ]),
    ).toBe('City: Hyderabad; Budget: 15 lakh');
    expect(detailsSummary([])).toBe('your enquiry');
    const long = Array.from({ length: 40 }, (_, i) => ({
      label: `Question ${i}`,
      value: 'x'.repeat(40),
    }));
    expect(detailsSummary(long).length).toBeLessThanOrEqual(600);
  });
  it('fills only as many placeholders as the template has', () => {
    const input = {
      name: 'Asha',
      details: [{ label: 'City', value: 'Hyderabad' }],
      companyName: 'SG Homes',
    };
    expect(confirmationParameters(input, 3)).toEqual([
      'Asha',
      'City: Hyderabad',
      'SG Homes',
    ]);
    expect(confirmationParameters(input, 1)).toEqual(['Asha']);
    expect(confirmationParameters(input, 0)).toEqual([]);
    expect(confirmationParameters({ ...input, name: '' }, 1)).toEqual([
      'there',
    ]);
  });
});

describe('quotation message', () => {
  const packages = [
    { name: 'Standard', rate_per_sqft: 1650 },
    { name: 'Premium', rate_per_sqft: 2100 },
  ];
  it('reads an area only when the answer is clearly square feet', () => {
    expect(areaSqft('1,800 sqft')).toBe(1800);
    expect(areaSqft('3 BHK')).toBeNull();
    expect(areaSqft('12')).toBeNull();
    expect(areaSqft('')).toBeNull();
  });
  it('lists packages with an estimate when the area is known', () => {
    const message = buildQuoteMessage({
      template: 'Hi {{name}} from {{company}}:\n{{packages}}',
      name: 'Asha',
      companyName: 'SG Homes',
      projectSize: '1800',
      packages,
    });
    expect(message).toContain('Hi Asha from SG Homes:');
    expect(message).toContain(
      '• Standard: ₹1,650 per sq ft (about ₹29,70,000 for 1,800 sq ft)',
    );
  });
  it('lists rates only when the area is unknown and uses the default wording', () => {
    const message = buildQuoteMessage({
      template: '',
      name: '',
      companyName: '',
      projectSize: '3 BHK',
      packages,
    });
    expect(message).toContain('Thank you there!');
    expect(message).toContain('• Premium: ₹2,100 per sq ft');
    expect(message).not.toContain('about');
  });
  it('still sends a sensible message when the company has no packages', () => {
    expect(
      buildQuoteMessage({
        template: '{{packages}}',
        name: 'A',
        companyName: 'B',
        projectSize: '',
        packages: [],
      }),
    ).toBe('Our team will share your package options shortly.');
  });
});
