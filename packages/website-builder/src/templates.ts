import { businessShowcaseTemplate } from './showcase';
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
  kind: 'blank' | 'construction' | 'services' | 'custom' | 'showcase' = 'blank',
): WebsiteDocument {
  if (kind === 'blank') return emptyWebsite(name);
  if (kind === 'custom') {
    const doc=emptyWebsite(name);
    doc.code=[{
      id:'customHome',name:'Custom home page',
      html:'<main><h1>Your company</h1><p>Build your website with your own HTML and CSS.</p></main>',
      css:'main { padding: 48px; font-family: sans-serif; }',
      javascript:'',
    }];
    const node=createNode('custom','customPage');
    node.props={code:'customHome'};
    doc.pages[0]!.nodes=[node];
    return validateTemplate(doc);
  }
  // Every visual starter is a finished six-page website with editable
  // services, packages, project cards, header menu and footer.
  const doc=businessShowcaseTemplate(name);
  if (kind === 'construction') {
    doc.pages[0]!.nodes[0]!.props.title='Building better spaces, together.';
    doc.pages[0]!.nodes[0]!.props.subtitle='CONSTRUCTION · PLANNING · EXECUTION';
  }
  if (kind === 'services') {
    doc.pages[0]!.nodes[0]!.props.title='Expert service. Personal attention.';
    doc.pages[0]!.nodes[0]!.props.subtitle='TRUSTED BUSINESS SERVICES';
    doc.theme.primary='#8A624E';
    doc.theme.accent='#BE845D';
  }
  return validateTemplate(doc);
}
