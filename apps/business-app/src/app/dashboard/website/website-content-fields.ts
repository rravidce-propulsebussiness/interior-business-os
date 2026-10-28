import type { WebsiteNode } from '@business-os/website-builder';

export type EditableContentKey = 'title' | 'text' | 'subtitle' | 'href' | 'alt' | 'label';
export type WebsiteContentField = {
  key: EditableContentKey;
  label: string;
  multiline: boolean;
  maxLength: number;
  placeholder: string;
};
const field = (key: EditableContentKey, label: string): WebsiteContentField => ({
  key, label,
  multiline: key === 'text' || key === 'subtitle',
  maxLength: { title: 300, text: 12000, subtitle: 1000, href: 2048, alt: 500, label: 200 }[key],
  placeholder: {
    title: 'Enter a heading',
    text: 'Write your text here',
    subtitle: 'Add a short description',
    href: '/contact',
    alt: 'Describe this image for accessibility',
    label: 'Button label',
  }[key],
});

/** Show only content actually rendered for each section type.
 * Previously every node exposed title, body text, subtitle and URL even
 * when the website renderer ignored them. Never change existing document
 * data when switching selections or when hiding advanced controls. */
export function editableContentFields(node: Pick<WebsiteNode, 'type' | 'props'>): WebsiteContentField[] {
  const props = node.props;
  switch (node.type) {
    case 'heading':
      return [field(props.text || !props.title ? 'text' : 'title', 'Heading')];
    case 'text':
      return [field('text', 'Paragraph text')];
    case 'button':
      return [
        field(props.text || !props.label ? 'text' : 'label', 'Button text'),
        field('href', 'Button destination'),
      ];
    case 'image':
      return [field('alt', 'Image description')];
    case 'logo':
      return props.asset ? [field('alt', 'Logo description')] : [field('text', 'Company name')];
    case 'hero':
      return [
        field('title', 'Main headline'),
        field('subtitle', 'Tagline'),
        field('text', 'Description'),
      ];
    case 'section':
    case 'card':
    case 'cta':
    case 'contact':
    case 'footer':
    case 'container':
    case 'columns':
    case 'grid':
      return [
        field('title', 'Heading'),
        field('subtitle', 'Short introduction'),
        field('text', 'Description'),
      ];
    case 'gallery':
    case 'portfolio':
    case 'services':
    case 'testimonials':
    case 'team':
    case 'faq':
    case 'pricing':
    case 'before_after':
    case 'process':
    case 'stats':
    case 'social':
      return [field('title', 'Section heading')];
    default:
      return [];
  }
}
