'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

export type SettingCard = {
  id: string;
  title: string;
  description: string;
  icon: string;
  tone: 'orange' | 'rose' | 'purple' | 'blue' | 'green' | 'mint' | 'amber';
  href?: string;
};
export type SettingSection = {
  id: string;
  title: string;
  description: string;
  icon: string;
  cards: SettingCard[];
};

// Icons are decorative SVG paths, not another icon component dependency.
const paths: Record<string, string> = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM17 17l5 5',
  company:
    'M3 21h18M6 21V5l6-3 6 3v16M9 8h1M14 8h1M9 12h1M14 12h1M10 21v-5h4v5',
  branding: 'm4 20 4-1 11-11-3-3L5 16l-1 4ZM14 6l3 3M5 4h5M7.5 1.5v5',
  invoice: 'M5 2h11l4 4v16H5zM16 2v5h4M8 11h8M8 15h8M8 19h6',
  payments: 'M3 7h18v13H3zM3 10h18M16 15h2M5 3h14v4',
  construction: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h6',
  quote: 'M6 2h10l4 4v16H6zM16 2v5h4M9 12h8M9 16h8M9 20h5',
  team: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 6v6M17 9h6',
  client:
    'M20 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  notifications: 'M18 8a6 6 0 0 0-12 0c0 6-3 8-3 9h18c0-1-3-3-3-9ZM9 21h6',
  documents: 'M6 2h9l4 4v16H6zM15 2v5h4M9 11h7M9 15h7M9 19h5',
  storage: 'M3 7h8l2 3h8v10H3zM3 7V4h8l2 3',
  reports: 'M4 20h16M7 16h3v4H7zM14 11h3v9h-3zM6 5h12M6 9h6',
  preferences: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  integrations:
    'm10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 1 1 6 6l-5 5a4 4 0 0 1-6 0',
  custom: 'M4 4h16v16H4zM8 9h8M8 13h5M16 15h2v3h-2z',
  backup:
    'M4 18a5 5 0 0 1 1-10 7 7 0 0 1 14-1 5 5 0 0 1 1 10M8 14l4-4 4 4M12 10v11',
  subscription: 'M3 6h18v13H3zM3 10h18M7 16h4',
  activity: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 3',
  category: 'M12 3v18M3 12h18',
};
function Glyph({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.category} />
    </svg>
  );
}

export function SettingsHome({ sections }: { sections: SettingSection[] }) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase();
  const filtered = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          cards: section.cards.filter(
            (card) =>
              !query ||
              (section.title + ' ' + card.title + ' ' + card.description)
                .toLocaleLowerCase()
                .includes(query),
          ),
        }))
        .filter((section) => section.cards.length > 0),
    [sections, query],
  );
  const total = sections.reduce(
    (sum, section) => sum + section.cards.length,
    0,
  );
  return (
    <div className="ush-home">
      <div className="ush-top">
        <div>
          <h1>Settings</h1>
          <p>Manage your company settings, templates and preferences</p>
        </div>
        <label className="ush-search">
          <Glyph name="search" size={19} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search settings..."
            aria-label="Search settings"
            autoComplete="off"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear settings search"
              onClick={() => setSearch('')}
            >
              ×
            </button>
          )}
        </label>
      </div>
      {filtered.length === 0 ? (
        <div role="status" className="ush-empty">
          No settings match “{search}”. Try searching by category or feature.
        </div>
      ) : (
        filtered.map((section) => (
          <section
            className="ush-section"
            key={section.id}
            aria-labelledby={'ush-' + section.id}
          >
            <div className="ush-section-head">
              <span className="ush-section-mark">
                <Glyph name={section.icon} size={25} />
              </span>
              <div>
                <h2 id={'ush-' + section.id}>{section.title}</h2>
                <p>{section.description}</p>
              </div>
            </div>
            <div className="ush-grid">
              {section.cards.map((card) => {
                const inside = (
                  <>
                    <span className={'ush-icon is-' + card.tone}>
                      <Glyph name={card.icon} />
                    </span>
                    <span className="ush-copy">
                      <strong>{card.title}</strong>
                      <span>{card.description}</span>
                    </span>
                    {card.href ? (
                      <span className="ush-chevron" aria-hidden="true">
                        ›
                      </span>
                    ) : (
                      <span className="ush-unavailable">Planned</span>
                    )}
                  </>
                );
                return card.href ? (
                  <Link className="ush-tile" href={card.href} key={card.id}>
                    {inside}
                  </Link>
                ) : (
                  <div
                    className="ush-tile is-planned"
                    key={card.id}
                    title="No standalone settings screen available yet"
                  >
                    {inside}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
      <p className="ush-footnote">
        {total} settings categories · Existing features open their original
        workspace. Future features are marked Planned.
      </p>
    </div>
  );
}
