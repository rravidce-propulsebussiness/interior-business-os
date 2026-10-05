import {
  createComponent,
  emptyBrochure,
  type BrochureDocument,
  type Component,
} from './model';
export const templateCatalog = [
  {
    id: 'luxury',
    name: 'Luxury Interior Studio',
    type: 'Company Profile',
    accent: '#9b7449',
    background: '#faf8f2',
    sections: [
      'Cover',
      'About Studio',
      'Services',
      'Design Process',
      'Residential Projects',
      'Project Detail',
      'Materials & Finishes',
      'Why Choose Us',
      'Testimonials',
      'Contact / Consultation',
    ],
  },
  {
    id: 'minimal',
    name: 'Modern Minimal',
    type: 'Design Studio Profile',
    accent: '#53645b',
    background: '#ffffff',
    sections: ['Cover', 'About', 'Services', 'Projects', 'Contact'],
  },
  {
    id: 'residential',
    name: 'Residential Portfolio',
    type: 'Project Portfolio',
    accent: '#977664',
    background: '#faf5f0',
    sections: [
      'Cover',
      'Our Approach',
      'Residential Projects',
      'Project Detail',
      'Materials',
      'Contact',
    ],
  },
  {
    id: 'kitchen',
    name: 'Premium Modular Kitchen',
    type: 'Modular Kitchen',
    accent: '#735842',
    background: '#faf8f2',
    sections: [
      'Cover',
      'Kitchen Services',
      'Design Process',
      'Materials & Finishes',
      'Service Packages',
      'Contact',
    ],
  },
  {
    id: 'construction',
    name: 'Construction Company Profile',
    type: 'Company Profile',
    accent: '#31566f',
    background: '#f7f9fa',
    sections: [
      'Cover',
      'Company',
      'Capabilities',
      'Completed Projects',
      'Equipment & Materials',
      'Team',
      'Contact',
    ],
  },
  {
    id: 'architecture',
    name: 'Architecture Portfolio',
    type: 'Project Portfolio',
    accent: '#635d72',
    background: '#f9f8fa',
    sections: [
      'Cover',
      'Practice',
      'Selected Projects',
      'Process',
      'Team',
      'Contact',
    ],
  },
  {
    id: 'corporate',
    name: 'Corporate Profile',
    type: 'Company Profile',
    accent: '#31556a',
    background: '#ffffff',
    sections: ['Cover', 'About', 'Services', 'Our Approach', 'Team', 'Contact'],
  },
] as const;
export function starterBrochure(
  templateId: string,
  title = 'Business profile',
  imageId?: string,
): BrochureDocument {
  const template = templateCatalog.find((t) => t.id === templateId);
  if (!template) throw new Error('Unknown starter');
  const d = emptyBrochure(title);
  d.type = template.type;
  d.theme.accent = template.accent;
  d.theme.background = template.background;
  const node = (
    type: Component['type'],
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    size = 12,
  ): Component => ({
    ...createComponent(type, id),
    x,
    y,
    width: w,
    height: h,
    text,
    style: {
      ...createComponent(type, id).style,
      size,
      font: type === 'heading' ? 'Georgia' : 'Arial',
    },
  });
  d.pages = template.sections.map((name, i) => {
    const components: Component[] = [
      node(
        'text',
        `eyebrow${i}`,
        16,
        14,
        175,
        8,
        i === 0
          ? 'YOUR STUDIO / YOUR STORY'
          : `${String(i + 1).padStart(2, '0')} / ${name.toUpperCase()}`,
        9,
      ),
      node(
        'heading',
        `title${i}`,
        16,
        32,
        177,
        42,
        i === 0 ? 'Spaces made for living.' : name,
        32,
      ),
    ];
    if (i === 0) {
      components.push({
        ...node('heading', 'business', 16, 246, 177, 16, 'Business Name', 19),
        binding: 'business',
      });
      components.push(
        node(
          'text',
          'coverSubtitle',
          16,
          267,
          177,
          12,
          'A considered approach to design and detail.',
          11,
        ),
      );
    } else {
      components.push(
        node(
          'text',
          `intro${i}`,
          16,
          81,
          177,
          36,
          name === 'Testimonials'
            ? 'Add client-approved words here. Publish only with permission.'
            : `Introduce ${name.toLowerCase()} in your own words. Replace this editable content with approved business information.`,
          13,
        ),
      );
    }
    if (imageId && i < 7 && !name.includes('Contact')) {
      components.push({
        ...node(
          'image',
          `image${i}`,
          16,
          i === 0 ? 88 : 130,
          177,
          i === 0 ? 145 : 112,
          '',
          12,
        ),
        asset: imageId,
        alt: 'Interior concept image; replace with an approved project photo',
      });
    } else if (i !== 9 && !name.includes('Contact')) {
      components.push({
        ...node('shape', `panel${i}`, 16, 133, 177, 105, ''),
        style: {
          ...createComponent('shape', 'x').style,
          background: template.accent,
          opacity: 0.12,
        },
      });
      components.push(
        node(
          'text',
          `placeholder${i}`,
          25,
          168,
          157,
          25,
          'Your images, materials or approved project story',
          14,
        ),
      );
    }
    if (name.includes('Contact'))
      components.push({
        ...node(
          'contact',
          `contact${i}`,
          16,
          137,
          177,
          80,
          'Public contact information',
          15,
        ),
        binding: 'contact',
      });
    return {
      id: `page${i + 1}`,
      name,
      background: template.background,
      showHeader: false,
      showFooter: true,
      components,
    };
  });
  d.footer = 'Business profile';
  return d;
}
