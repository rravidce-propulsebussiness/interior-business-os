import { createNode, emptyWebsite, validateDocument, type WebsiteDocument, type WebsiteNode } from './model';

/** Original construction/interior business template. Inspired by the information
 * architecture of a multi-page service website, not copied branded content. */
export function businessShowcaseTemplate(name: string): WebsiteDocument {
  const doc = emptyWebsite(name);
  doc.theme = {
    ...doc.theme,
    primary: '#E86728', secondary: '#F9E5D3', accent: '#CB7C45',
    background: '#FFF9F3', surface: '#FFFFFF', text: '#292F2B',
    muted: '#72766E', border: '#EDE0D4', headingFont: 'sans-serif',
    bodyFont: 'sans-serif', radius: 14, containerWidth: 1240,
    spacing: 12, shadow: 'soft', buttonStyle: 'rounded',
  };
  doc.settings.description = 'Quality construction and interior services, thoughtfully delivered.';
  doc.navigation = [
    {label:'Home',href:'/',children:[]},
    {label:'About',href:'/about',children:[]},
    {label:'Services',href:'/services',children:[]},
    {label:'Projects',href:'/projects',children:[]},
    {label:'Packages',href:'/packages',children:[]},
    {label:'Contact',href:'/contact',children:[]},
  ];
  doc.footerNavigation = [
    {label:'About us',href:'/about',children:[]},
    {label:'Our services',href:'/services',children:[]},
    {label:'Projects',href:'/projects',children:[]},
    {label:'Contact',href:'/contact',children:[]},
  ];
  function block(type: WebsiteNode['type'], id: string, title = '', text = '', subtitle = '') {
    const n = createNode(type, id);
    if(title) n.props.title = title;
    if(text) n.props.text = text;
    if(subtitle) n.props.subtitle = subtitle;
    return n;
  }
  const hero = block('hero','showcaseHero',
    'Your vision. Our expertise.',
    'From the first conversation to the finished space, create with clarity, craftsmanship and care.',
    'CONSTRUCTION · INTERIORS · PROJECTS');
  hero.style = { background: '#26322C', color: '#FFFFFF', padding: 88, minHeight: 480 };
  const heroCta = block('button','showcaseHeroCta');
  heroCta.props = {text:'Discuss your project',href:'/contact'};
  heroCta.style = { background:'#E86728', color:'#FFFFFF', radius:32 };
  hero.children = [heroCta];

  const intro = block('section','showcaseIntro',
    'Your next project starts with confidence.',
    'Plan thoughtfully, choose suitable materials, and work with a team that understands your expectations.',
    'BUILD BETTER. LIVE BETTER.');
  intro.style = { background:'#FFF9F3',padding:62 };

  const trust = block('section','showcaseTrust',
    'Why work with us?',
    'Clear project discussions, thoughtful planning, accountable supervision and transparent communication.',
    'OUR APPROACH');
  trust.style = { background:'#F9E5D3',padding:62 };

  const services = block('services','showcaseServices','Explore our services');
  services.style = { padding:54 };
  const projects = block('portfolio','showcaseProjects','Spaces we are proud of');
  projects.style = { padding:54 };

  const contactCta = block('cta','showcaseContactCta',
    'Ready to bring your ideas to life?',
    'Tell us about your site, requirements and vision. We will help you plan the next step.',
    'LET’S TALK');
  contactCta.style = { background:'#26322C',color:'#FFFFFF',padding:64 };
  const contactButton = block('button','showcaseContactButton');
  contactButton.props = {text:'Contact our team',href:'/contact'};
  contactCta.children = [contactButton];

  function section(id: string, title: string, text: string, eyebrow: string) {
    const n = block('section',id,title,text,eyebrow);
    n.style = {padding:68};
    return n;
  }
  // Three ready-made package cards with clear inclusions and no invented rates.
  function packageGrid(prefix:string):WebsiteNode {
    const grid=createNode('grid',prefix+'Grid');
    grid.style={padding:24,gap:24};
    const tiers=[
      {name:'Standard',tag:'ESSENTIAL CONSTRUCTION',desc:'A dependable base scope with defined materials, foundation, structural framework, brickwork and standard finishes.'},
      {name:'Premium',tag:'UPGRADED FINISHES',desc:'Additional material selection, upgraded door and window choices, surface finishes and attentive interior details.'},
      {name:'Elite',tag:'BESPOKE DESIGN',desc:'Personalized planning, refined finishes, tailored space details and a broader selection of premium options.'},
    ];
    grid.children=tiers.map((tier,index)=>{
      const card=block('card',prefix+'Card'+index,tier.name,tier.desc,tier.tag);
      card.style={background:index===1?'#F9E5D3':'#FFFFFF',padding:34,radius:16,shadow:'soft'};
      const button=createNode('button',prefix+'Button'+index);
      button.props={text:'Request package details',href:'/contact'};
      card.children=[button];
      return card;
    });
    return grid;
  }
  const pages = [
    {id:'home',path:'/',title:'Home',nodes:[hero,intro,services,trust,projects,
      section('showcaseHomePackageIntro','Plans for every kind of project',
        'Choose a starting scope. Every proposal is tailored to your site and requirements.','OUR PACKAGES'),
      packageGrid('showcaseHomePackages'),contactCta]},
    {id:'showcaseAboutPage',path:'/about',title:'About',nodes:[
      section('showcaseAboutHero','A team focused on better spaces.',
        'Introduce your company, your values, your experience and what makes your approach different.','ABOUT OUR BUSINESS'),
      section('showcaseAboutStory','What guides our work',
        'We believe good projects start with thoughtful discussions, transparent scope, detailed planning and consistent updates throughout execution.','OUR APPROACH'),
      section('showcaseAboutValues','How we work',
        'Understand requirements → plan the design → confirm specifications → coordinate work → review quality → hand over thoughtfully.','OUR PROCESS'),
      contactCtaCopy('showcaseAboutContact','Plan a project with us'),
    ]},
    {id:'showcaseServicesPage',path:'/services',title:'Services',nodes:[
      section('showcaseServiceHero','Services shaped around your needs',
        'Construction, interior design, renovation and associated project services.','WHAT WE DO'),
      block('services','showcaseServiceGrid','Our services'),
      contactCtaCopy('showcaseServicesContact','Request a consultation'),
    ]},
    {id:'showcaseProjectsPage',path:'/projects',title:'Projects',nodes:[
      section('showcaseProjectHero','Explore our work',
        'Showcase completed projects with real photographs, locations, scope and finishes.','OUR PORTFOLIO'),
      block('portfolio','showcaseProjectGrid','Recent projects'),
    ]},
    {id:'showcasePackagesPage',path:'/packages',title:'Packages',nodes:[
      section('showcasePackageHero','Choose the scope that fits your project',
        'Explain your packages and inclusions clearly. Actual specifications and quotations should be confirmed for each project.','PLANS & PACKAGES'),
      packageGrid('showcasePackages'),
      section('showcasePackageNote','Every project is different',
        'Package names describe indicative scope, not fixed prices or promises. Final specifications, quantities, timelines and payment milestones are agreed in your quotation.','HOW WE QUOTE'),
      contactCtaCopy('showcasePackageContact','Request a tailored quotation'),
    ]},
    {id:'showcaseContactPage',path:'/contact',title:'Contact',nodes:[
      section('showcaseContactHero','Let’s talk about your project',
        'Share your location, project type, approximate size and preferred timeline.','CONTACT US'),
      section('showcaseContactInfo','Start with a conversation.',
        'Tell us your project location, type, size, preferred style and approximate timeline. Add your business phone, email, and office address through Header & Footer settings.','GET IN TOUCH'),
      section('showcaseContactProcess','What happens next?',
        'We review your requirements, discuss the scope, and prepare a plan or proposal suited to your project.','NEXT STEPS'),
    ]},
  ];
  function content(id:string,kind:WebsiteDocument['content'][number]['kind'],title:string,text:string) {
    return {id,kind,title,text,published:true};
  }
  doc.content = [
    content('showcaseServiceConstruction','services','Home construction',
      'Homes and residential spaces planned with clear specifications and workmanship standards.'),
    content('showcaseServiceInteriors','services','Interior design',
      'Functional interiors, beautiful finishes and thoughtful space planning.'),
    content('showcaseServiceRenovation','services','Renovation & upgrades',
      'Refresh existing spaces with a structured scope and execution plan.'),
    content('showcaseServicePlanning','services','Architectural planning',
      'Thoughtful layouts and space planning to make every square foot more purposeful.'),
    content('showcaseServiceExecution','services','Project execution',
      'Site coordination and milestone-based oversight from groundwork through finishing.'),
    content('showcaseServiceConsultation','services','Design consultation',
      'Explore material choices, finishes, budgets and a practical project roadmap.'),
    content('showcaseConceptResidence','projects','Contemporary residence — concept',
      'Illustrative portfolio layout. Replace with your own completed home and its actual project photographs.'),
    content('showcaseConceptInteriors','projects','Warm living spaces — concept',
      'Illustrative interiors example. Replace with a real project description, scope and images.'),
    content('showcaseConceptRenovation','projects','Home transformation — concept',
      'Illustrative renovation example. Replace with genuine before-and-after photographs.'),
  ];
  doc.pages = pages.map(page=>({
    ...page, visibility:'public' as const,
    seo:{title: (page.title === 'Home' ? name : page.title+' | '+name).slice(0,160),
      description: doc.settings.description, noindex:false},
  }));
  doc.css = `
.website-nav{justify-content:space-between;gap:20px}
.website-nav a:hover{color:var(--primary)}
.website-section h1,.website-section h2{max-width:900px}
.website-section p{max-width:760px}
.website-section .button{margin-top:22px}
.website-grid{margin-top:24px}
.website-card{box-shadow:0 14px 40px #2b20150b;transition:transform .2s}
.website-card:hover{transform:translateY(-3px)}
.website-card h3{font-weight:750;margin:5px 0 10px}
.website-card p{font-size:15px;color:var(--muted);line-height:1.7}
.website-grid>.website-card{min-height:220px}
.website-grid .button{display:inline-flex;font-size:13px}
.website-nav .website-logo{font-weight:800}
.website-section .website-eyebrow{font-weight:700}
.website-section h1{font-size:clamp(42px,5.5vw,78px);line-height:1.07}
.website-section h2{font-size:clamp(29px,3.8vw,47px)}
.website-grid>div{min-width:0}
header.website-section{background:#ffffff}
footer.website-section{background:#26322C;color:#ffffff}
footer.website-section a{color:#fff}
@media(max-width:600px){.website-section{padding:38px 20px!important}}
`;
  return validateDocument(doc);
}

function contactCtaCopy(id: string, title: string): WebsiteNode {
  const node = createNode('cta',id);
  node.props = {title,text:'Have a project in mind? Get in touch to discuss your requirements.'};
  node.style = {padding:62,background:'#F9E5D3'};
  const button = createNode('button',id+'Button');
  button.props = {text:'Contact us',href:'/contact'};
  node.children = [button];
  return node;
}
