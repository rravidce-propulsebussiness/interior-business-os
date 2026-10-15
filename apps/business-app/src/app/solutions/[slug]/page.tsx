import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

const solutions = {
  "crm": {
    "title": "CRM & Lead Management",
    "description": "Manage construction and interior enquiries, follow-ups, quotations and customer conversions in one workspace."
  },
  "quotations": {
    "title": "Construction & Interior Quotation Software",
    "description": "Create customized estimates and professional quotations for construction and interior projects."
  },
  "construction-project-management": {
    "title": "Construction Project Management Software",
    "description": "Track construction stages, site photos, quality checks, labor plans, material requirements and project progress."
  },
  "interior-project-management": {
    "title": "Interior Project Management Software",
    "description": "Coordinate designs, client approvals, material procurement and interior execution stages."
  },
  "billing": {
    "title": "Billing & Invoicing Software",
    "description": "Manage business invoices, payment schedules and project billing workflows."
  },
  "procurement": {
    "title": "Construction Material Procurement Software",
    "description": "Plan site material requirements, purchase requests and supplier coordination."
  },
  "client-portal": {
    "title": "Construction Client Portal",
    "description": "Share project updates, design approvals, progress photos and project documents with clients."
  },
  "website-builder": {
    "title": "Business Website Builder",
    "description": "Create a branded business website alongside your operational workspace."
  }
} as const;
type Slug = keyof typeof solutions;
const entries = Object.entries(solutions) as [Slug, (typeof solutions)[Slug]][];
export function generateStaticParams() { return entries.map(([slug]) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!(slug in solutions)) return { title: 'Not found', robots: { index: false } };
  const item = solutions[slug as Slug];
  return { title: `${item.title} | ProPulse Business OS`, description: item.description, alternates: { canonical: `https://sghomesinterior.in/solutions/${slug}` }, robots: { index: true, follow: true } };
}
export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(slug in solutions)) notFound();
  const item = solutions[slug as Slug];
  return <main style={{maxWidth:960,margin:'0 auto',padding:'48px 24px',fontFamily:'system-ui, sans-serif',lineHeight:1.6}}>
    <nav aria-label="Primary"><Link href="/">ProPulse Business OS</Link> · <Link href="/register">Get started</Link> · <Link href="/login">Login</Link></nav>
    <section style={{padding:'72px 0'}}><p>BUSINESS MANAGEMENT SOFTWARE</p><h1 style={{fontSize:'clamp(2rem,5vw,3.5rem)',lineHeight:1.15}}>{item.title}</h1><p style={{fontSize:'1.2rem',maxWidth:720}}>{item.description}</p><p>Built for construction, interiors and growing service businesses. Access your organization's enabled tools in one secure workspace.</p><Link href="/register">Create your account →</Link></section>
    <section><h2>Explore more solutions</h2><ul>{entries.filter(([key])=>key!==slug).map(([key,value])=><li key={key}><Link href={`/solutions/${key}`}>{value.title}</Link></li>)}</ul></section>
    <footer style={{marginTop:64,borderTop:'1px solid #ddd',paddingTop:24}}><Link href="/">Home</Link> · <Link href="/login">Login</Link></footer>
  </main>;
}
