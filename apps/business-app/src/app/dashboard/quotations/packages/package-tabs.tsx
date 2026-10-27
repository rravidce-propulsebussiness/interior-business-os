'use client';

import { useState, type ReactNode } from 'react';

export function QuotationPackageTabs({
  construction,
  other,
  constructionCount,
  otherCount,
}: {
  construction: ReactNode;
  other: ReactNode;
  constructionCount: number;
  otherCount: number;
}) {
  const [tab, setTab] = useState<'construction' | 'other'>('construction');
  return (
    <div>
      <div
        className="mb-5 flex flex-wrap gap-2 border-b border-slate-200 pb-3"
        role="tablist"
        aria-label="Package industry"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'construction'}
          onClick={() => setTab('construction')}
          className={
            'rounded-xl px-5 py-3 text-sm font-bold ' +
            (tab === 'construction'
              ? 'bg-orange-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50')
          }
        >
          Construction ({constructionCount})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'other'}
          onClick={() => setTab('other')}
          className={
            'rounded-xl px-5 py-3 text-sm font-bold ' +
            (tab === 'other'
              ? 'bg-orange-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50')
          }
        >
          Interior &amp; other industries ({otherCount})
        </button>
      </div>
      <div role="tabpanel">{tab === 'construction' ? construction : other}</div>
    </div>
  );
}
