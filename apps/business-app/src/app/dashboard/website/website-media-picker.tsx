'use client';

import Link from 'next/link';
import { useState, type ChangeEvent, type MouseEvent } from 'react';
import type { WebsiteDocument } from '@business-os/website-builder';
import './website-media-picker.css';

type Asset = WebsiteDocument['assets'][number];

/**
 * Uploads use a dedicated same-origin tenant-authorized POST-only endpoint,\n * separate from the /media page and its GET asset routes.
 * Selection and document attachment stay local until the owner saves the draft.
 */
export function WebsiteMediaPicker({
  id, assets, value, onChange, onUploaded, label = 'Image', disabled = false,
  canPreview = false, unsaved = false,
}: {
  id: string;
  assets: WebsiteDocument['assets'];
  value?: string | undefined;
  onChange: (next: string | undefined) => void;
  onUploaded?: (asset: Asset) => void;
  label?: string;
  disabled?: boolean;
  canPreview?: boolean;
  unsaved?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const chosen = assets.find(asset => asset.id === value);
  const recent = assets.slice(-24).reverse();
  const visible = chosen && !recent.some(asset => asset.id === chosen.id)
    ? [chosen, ...recent] : recent;
  const allowLeaving = (event: MouseEvent<HTMLAnchorElement>) => {
    if (unsaved && !window.confirm('Opening the media library will discard unsaved website changes. Continue?'))
      event.preventDefault();
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || !onUploaded || !canPreview || disabled || uploading) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
      setError('Choose a JPG, PNG, WebP or AVIF image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Choose an image smaller than 10 MB.');
      return;
    }
    setError('');
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 500);
      body.append('alt', alt);
      const response = await fetch(`/dashboard/website/${id}/uploads/media`, {
        method: 'POST', body, credentials: 'same-origin',
      });
      const result: { id?: unknown; width?: unknown; height?: unknown; alt?: unknown; message?: unknown } =
        await response.json();
      if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : 'Upload failed');
      if (typeof result.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.id))
        throw new Error('Upload response was invalid. Refresh the media library.');
      onUploaded({
        id: `asset${result.id.replaceAll('-', '')}`,
        assetId: result.id,
        alt: typeof result.alt === 'string' ? result.alt : alt,
        width: typeof result.width === 'number' && result.width > 0 ? result.width : 1,
        height: typeof result.height === 'number' && result.height > 0 ? result.height : 1,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Image upload failed');
    } finally {
      setUploading(false);
    }
  };
  return <div className="site-media-picker">
    <div className="site-media-picker-heading">
      <strong>{label}</strong>
      {canPreview && <Link onClick={allowLeaving} href={`/dashboard/website/${id}/media`}>
        Manage images
      </Link>}
    </div>
    {canPreview && onUploaded && <label className="site-media-upload">
      <span>{uploading ? 'Uploading image…' : '＋ Upload image or logo'}</span>
      <input type="file" accept="image/jpeg,image/png,image/webp,image/avif"
        aria-label={`Upload ${label.toLowerCase()}`}
        disabled={disabled || uploading} onChange={upload} />
    </label>}
    {error && <p role="alert" className="site-media-error">{error}</p>}
    {!assets.length ? <p className="site-media-help">
      No images yet. {canPreview && onUploaded
        ? 'Upload an image here and save your website draft.'
        : canPreview ? 'Add an image in the media library, then return here.'
          : 'Ask a website media manager to add images.'}
    </p> : <>
      <div className="site-media-grid" role="group" aria-label={`Choose ${label.toLowerCase()}`}>
        <button type="button" aria-pressed={!value} disabled={disabled || uploading}
          className={`site-media-tile site-media-none${!value ? ' selected' : ''}`}
          onClick={() => onChange(undefined)}>
          <span aria-hidden="true">∅</span><small>No image</small>
        </button>
        {visible.map((asset: Asset) => <button key={asset.id}
          className={`site-media-tile${asset.id === value ? ' selected' : ''}`}
          type="button" disabled={disabled || uploading} aria-pressed={asset.id === value}
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
          : 'Select an image above. Save your draft to publish later.'}</p>
    </>}
  </div>;
}
