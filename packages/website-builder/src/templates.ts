import {
  createNode,
  emptyWebsite,
  validateDocument,
  type WebsiteDocument,
} from './model';

/** Templates contain reusable example content, never tenant-owned assets or CRM references. */
export function validateTemplate(input: unknown): WebsiteDocument {
  const doc = validateDocument(input);
  if (
    doc.assets.length ||
    doc.content.some((item) => item.sourceId || item.sourceType)
  )
    throw new Error(
      'Templates cannot reference company media or business records. Add media after creating a company website.',
    );
  if (doc.forms.some((form) => form.enabled))
    throw new Error(
      'Keep template forms disabled. Connect forms inside the company workspace.',
    );
  return doc;
}

export function starterTemplate(
  name: string,
  kind: 'blank' | 'construction' | 'services' | 'custom' = 'blank',
): WebsiteDocument {
  const doc = emptyWebsite(name);
  if (kind === 'blank') return doc;
  doc.theme.primary = '#88352B';
  doc.theme.accent = '#BD5C3F';
  doc.theme.headingFont = 'sans-serif';
  doc.theme.radius = 16;
  if (kind === 'custom') {
    doc.code = [
      {
        id: 'customHome',
        name: 'Custom home page',
        html: '<main><h1>Your company</h1><p>Build your website with your own HTML and CSS.</p></main>',
        css: 'main { padding: 48px; font-family: sans-serif; }',
        javascript: '',
      },
    ];
    const node = createNode('custom', 'customPage');
    node.props = { code: 'customHome' };
    doc.pages[0]!.nodes = [node];
    return validateTemplate(doc);
  }
  const hero = createNode('hero', 'hero');
  hero.props = {
    title:
      kind === 'construction'
        ? 'Built around your vision.'
        : 'Expert service. Personal attention.',
    subtitle: 'Tell customers what makes your business different.',
  };
  hero.style = {
    padding: 64,
    minHeight: 380,
    background: '#242923',
    color: '#FFFFFF',
  };
  const heading = createNode('heading', 'servicesHeading');
  heading.props = { text: 'What we do', level: 2 };
  heading.style = { padding: 24 };
  const text = createNode('text', 'servicesText');
  text.props.text =
    'Replace this example with your services, experience and approach.';
  text.style = { padding: 24 };
  doc.pages[0]!.nodes = [hero, heading, text];
  return validateTemplate(doc);
}
