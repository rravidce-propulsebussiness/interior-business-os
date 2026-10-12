/* Leads workspace sections share one navigation, but independent routes/actions. */
export function LeadsSectionNav({
  active,
}: {
  active: 'all' | 'import' | 'propulse';
}) {
  const sections = [
    { key: 'all', label: 'All Leads', href: '/dashboard/crm/leads' },
    { key: 'import', label: 'Import Sheet', href: '/dashboard/crm/leads/import' },
    { key: 'propulse', label: 'ProPulse Leads', href: '/dashboard/crm/leads/propulse' },
  ] as const;
  return (
    <nav className="mb-6 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Lead sections">
      {sections.map((section) => (
        <a
          key={section.key}
          href={section.href}
          aria-current={active === section.key ? 'page' : undefined}
          className={
            'rounded-lg px-4 py-3 text-sm font-semibold transition-colors ' +
            (active === section.key
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700')
          }
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}
