'use client';

import Link from 'next/link';
import type { WebsiteDocument } from '@business-os/website-builder';
import './website-media-picker.css';

type Asset = WebsiteDocument['assets'][number];

/** Choose an asset already attached to this website draft.
 * Media uploads and tenant authorization remain in the existing Media panel.
 */
export function WebsiteMediaPicker({
  id, assets, value, onChange, label = 'Image', disabled = false,
  canPreview = false, unsaved = false,
}: {
  id: string;
  assets: WebsiteDocument['assets'];
  value?: string;
  onChange: (next: string | undefined) => void;
  label?: string;
  disabled?: boolean;
  canPreview?: boolean;
  unsaved?: boolean;
}) {
  const chosen = assets.find(asset => asset.id === value);
  const recent = assets.slice(-24).reverse();
  const visible = chosen && !recent.some(asset => asset.id === chosen.id)
    ? [chosen, ...recent] : recent;
  const allowLeaving = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (unsaved && !window.confirm('You have unsaved website changes. Save your draft before opening the media library?'))
      event.preventDefault();
  };
  return <div className="site-media-picker">
    <div className="site-media-picker-heading">
      <strong>{label}</strong>
      {canPreview && <Link onClick={allowLeaving} href={`/dashboard/website/${id}/media`}>
        Upload / manage images
      </Link>}
    </div>
    {!assets.length ? <p className="site-media-help">
      No media is attached to this draft yet.
      {canPreview ? ' Upload an image in the media library, choose “Use in draft”, then return here.' : ' Ask a website media manager to add images.'}
    </p> : <>
      <div className="site-media-grid" role="group" aria-label={`Choose ${label.toLowerCase()}`}>
        <button type="button" aria-pressed={!value} disabled={disabled}
          className={`site-media-tile site-media-none${!value ? ' selected' : ''}`}
          onClick={() => onChange(undefined)}>
          <span aria-hidden="true">∅</span><small>No image</small>
        </button>
        {visible.map((asset: Asset) => <button key={asset.id}
          className={`site-media-tile${asset.id === value ? ' selected' : ''}`}
          type="button" disabled={disabled} aria-pressed={asset.id === value}
          aria-label={`Use image: ${asset.alt || 'Website image'}`}
          onClick={() => onChange(asset.id)}>
          {canPreview ? <img
            src={`/dashboard/website/${id}/media/${asset.assetId}`}
            alt="" loading="lazy" /> : <span className="site-media-fallback" aria-hidden="true">▧</span>}
          <small>{asset.alt || 'Website image'}</small>
        </button>)}
      </div>
      <p className="site-media-help">{chosen
        ? `Selected: ${chosen.alt || 'Website image'}`
        : value ? 'Selected image is not in the current draft library.'
          : 'Select an image above. Changes remain a draft until saved.'}</p>
    </>}
  </div>;
}
