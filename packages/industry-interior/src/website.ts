import {
  createNode,
  emptyWebsite,
  validateDocument,
  type WebsiteNode,
} from '@business-os/website-builder';

/** Editable example content, never a claim about a customer's completed work. */
export function interiorWebsite(assetId: string, width = 1536, height = 1024) {
  const doc = emptyWebsite('Aara Interior Studio');
  let sequence = 0;
  const node = (
    type: WebsiteNode['type'],
    props: WebsiteNode['props'] = {},
    children: WebsiteNode[] = [],
  ) => ({ ...createNode(type, `aara${++sequence}`), props, children });
  const text = (value: string) => node('text', { text: value });
  const heading = (value: string, level = 2) =>
    node('heading', { text: value, level });
  const section = (...children: WebsiteNode[]) => node('section', {}, children);
  const button = (label: string, href: string) =>
    node('button', { label, href });
  const image = () =>
    node('image', {
      asset: 'livingRoom',
      alt: 'Interior concept: warm ivory seating, walnut joinery and soft daylight',
    });
  const page = (
    id: string,
    title: string,
    path: string,
    nodes: WebsiteNode[],
  ) => ({
    id,
    title,
    path,
    visibility: 'public' as const,
    seo: {
      title: `${title} — Aara Interior Studio`,
      description:
        'Thoughtful interiors, shaped around everyday living. An editable studio demonstration.',
      noindex: true,
    },
    nodes,
  });
  doc.settings.description = 'Thoughtful interiors. Beautifully lived in.';
  doc.settings.noindex = true;
  doc.assets = [
    {
      id: 'livingRoom',
      assetId,
      width,
      height,
      alt: 'AI-generated interior concept, not a completed client project',
    },
  ];
  doc.navigation = [
    ['Studio', '/about'],
    ['Services', '/services'],
    ['Spaces', '/portfolio'],
    ['Our process', '/process'],
    ['Let’s talk', '/contact'],
  ].map(([label, href]) => ({ label: label!, href: href!, children: [] }));
  doc.footerNavigation = [
    ['Questions', '/faq'],
    ['Client stories', '/testimonials'],
    ['Contact', '/contact'],
  ].map(([label, href]) => ({ label: label!, href: href!, children: [] }));
  doc.content = [
    [
      'services',
      'A home that feels like you',
      'Complete residential interiors, from the first conversation to the final detail.',
    ],
    [
      'services',
      'Made for everyday rituals',
      'Kitchens, wardrobes and joinery planned around how you use your space.',
    ],
    [
      'services',
      'Spaces that work beautifully',
      'Considered commercial interiors for teams, customers and daily routines.',
    ],
    [
      'faqs',
      'Where does the design process begin?',
      'We begin with a conversation about your space, priorities and preferred timeline.',
    ],
    [
      'faqs',
      'Can we work with existing furniture?',
      'Your existing pieces can become the starting point for a thoughtful new arrangement.',
    ],
    [
      'faqs',
      'When will I receive an estimate?',
      'After the initial brief and scope are agreed, your studio can prepare a project-specific estimate.',
    ],
  ].map(([kind, title, value], i) => ({
    id: `content${i}`,
    kind: kind as 'services' | 'faqs',
    title: title!,
    text: value!,
    published: true,
  }));
  doc.forms = [
    {
      id: 'consultation',
      name: 'Design consultation',
      enabled: true,
      confirmation: 'Thank you. The studio has received your enquiry.',
      fields: [
        {
          key: 'name',
          label: 'Your name',
          type: 'text',
          required: true,
          mapping: 'name',
          options: [],
        },
        {
          key: 'phone',
          label: 'Phone number',
          type: 'phone',
          required: true,
          mapping: 'phone',
          options: [],
        },
        {
          key: 'email',
          label: 'Email address',
          type: 'email',
          required: false,
          mapping: 'email',
          options: [],
        },
        {
          key: 'location',
          label: 'Project location',
          type: 'location',
          required: false,
          mapping: 'location',
          options: [],
        },
        {
          key: 'message',
          label: 'Tell us about your space',
          type: 'textarea',
          required: false,
          mapping: 'requirement',
          options: [],
        },
        {
          key: 'consent',
          label: 'I agree to be contacted about this enquiry.',
          type: 'consent',
          required: true,
          mapping: 'consent',
          options: [],
        },
      ],
    },
  ];
  doc.pages = [
    page('home', 'Thoughtful interiors', '/', [
      section(
        text('AARA / INTERIOR STUDIO'),
        heading('Thoughtful spaces.\nBeautifully lived in.', 1),
        text('Natural materials, quiet details and room for the way you live.'),
        button('Explore our approach', '/about'),
      ),
      image(),
      section(
        text('A CONSIDERED APPROACH'),
        heading('Good design begins with listening.'),
        text(
          'We bring clarity to the choices that shape a home — from its first plan to the smallest finishing detail.',
        ),
        button('Meet the studio', '/about'),
      ),
      section(
        heading('Designed around you'),
        node('services', { binding: 'services' }),
      ),
      section(
        heading('Your next chapter starts here.'),
        button('Start a conversation', '/contact'),
      ),
    ]),
    page('about', 'The studio', '/about', [
      section(
        heading('Spaces with a sense of belonging.', 1),
        text(
          'Aara is an editable example studio. Replace this introduction with your own story, experience and design philosophy.',
        ),
      ),
      image(),
      section(
        heading('Honest materials. Thoughtful details.'),
        text(
          'Our approach begins with the people who use a space. Every decision should make everyday life feel a little easier.',
        ),
      ),
    ]),
    page('services', 'Services', '/services', [
      section(
        heading('From possibility to place.', 1),
        text('Choose the support that fits your project.'),
        node('services', { binding: 'services' }),
        button('Discuss your brief', '/contact'),
      ),
    ]),
    page('portfolio', 'Spaces', '/portfolio', [
      section(
        heading('An exploration in warmth.', 1),
        text('Concept study / Living room'),
        image(),
        text(
          'AI-generated design concept for this demonstration. Replace it with approved photographs and descriptions of your own work.',
        ),
      ),
    ]),
    page('process', 'Our process', '/process', [
      section(
        heading('A clear path from idea to home.', 1),
        ...[
          '01 — Discover: share your priorities, site and brief.',
          '02 — Design: explore layouts, materials and a direction.',
          '03 — Detail: agree the scope, specifications and estimate.',
          '04 — Deliver: coordinate execution and finishing details.',
          '05 — Settle in: review, hand over and enjoy your space.',
        ].map(text),
        button('Let’s begin', '/contact'),
      ),
    ]),
    page('testimonials', 'Client stories', '/testimonials', [
      section(
        heading('Every home has a story.', 1),
        text(
          'Add approved client testimonials here. This demo does not invent reviews or ratings.',
        ),
        node('testimonials', { binding: 'testimonials' }),
      ),
    ]),
    page('faq', 'Questions', '/faq', [
      section(heading('Before we begin.', 1), node('faq', { binding: 'faqs' })),
    ]),
    page('contact', 'Let’s talk', '/contact', [
      section(
        heading('Tell us what you have in mind.', 1),
        text('A new home, a fresh perspective or a space ready for change.'),
        node('lead_form', { form: 'consultation' }),
      ),
    ]),
  ];
  return validateDocument(doc, true);
}
