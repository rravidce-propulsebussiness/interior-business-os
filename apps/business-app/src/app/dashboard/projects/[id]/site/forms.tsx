'use client';

import { useState, useTransition } from 'react';
import { saveProjectSite, uploadProjectSiteMedia } from './actions';

export type SiteField = {
  name: string;
  label: string;
  required?: boolean;
  input?: 'text'|'textarea'|'number'|'date'|'select';
  options?: readonly { value: string; label: string }[];
  initial?: string;
  placeholder?: string;
};

const control =
  'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-blue-600';
export function ProjectSiteForm({
  project, operation, label, fields, hidden = {}, secondary = false,
}: {
  project: string;
  operation: string;
  label: string;
  fields: readonly SiteField[];
  hidden?: Readonly<Record<string, string>>;
  secondary?: boolean;
}) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const target = event.currentTarget;
        const values = new FormData(target);
        start(async () => {
          const result = await saveProjectSite(project, operation, values);
          setMessage(result.message);
          if (result.saved) target.reset();
        });
      }}
    >
      {Object.entries(hidden).map(([key, value]) => <input type="hidden" name={key} value={value} key={key} />)}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <label key={field.name} className={field.input === 'textarea' ? 'sm:col-span-2 text-sm font-medium' : 'text-sm font-medium'}>
            {field.label}
            {field.input === 'textarea' ? (
              <textarea
                required={field.required}
                name={field.name}
                maxLength={5000}
                rows={3}
                defaultValue={field.initial}
                placeholder={field.placeholder}
                className={control}
              />
            ) : field.input === 'select' ? (
              <select
                required={field.required}
                name={field.name}
                defaultValue={field.initial ?? ''}
                className={control}
              >
                <option value="">Choose</option>
                {field.options?.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <input
                required={field.required}
                name={field.name}
                type={field.input ?? 'text'}
                step={field.input === 'number' ? 'any' : undefined}
                min={field.input === 'number' ? '0' : undefined}
                defaultValue={field.initial}
                placeholder={field.placeholder}
                maxLength={field.input === 'number' ? undefined : 1500}
                className={control}
              />
            )}
          </label>
        ))}
      </div>
      <button
        disabled={pending}
        className={secondary
          ? 'rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50'
          : 'rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50'}
      >
        {pending ? 'Saving…' : label}
      </button>
      {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
    </form>
  );
}

export function ProjectSiteMediaForm({
  project, phase,
}: {
  project: string;
  phase: 'design'|'execution';
}) {
  const [message,setMessage] = useState('');
  const [pending,start] = useTransition();
  return (
    <form className="grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      const target=event.currentTarget;
      const values=new FormData(target);
      start(async () => {
        const result=await uploadProjectSiteMedia(project,values);
        setMessage(result.message);
        if(result.saved) target.reset();
      });
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Attachment (image, PDF or short MP4 up to 8 MB)
          <input className={control} required name="file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf"/>
        </label>
        <label className="text-sm font-medium">
          Related to
          <select className={control} name="category" defaultValue={phase === 'design'?'design':'daily'}>
            {phase==='design' ? <option value="design">Design evidence</option> : (
              <>
                <option value="daily">Daily site progress</option>
                <option value="site">General site photo/video</option>
                <option value="inspection">Inspection evidence</option>
              </>
            )}
          </select>
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Caption
          <input className={control} name="caption" maxLength={500} placeholder="Area, date and what this image shows"/>
        </label>
      </div>
      <button className="w-fit rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50" disabled={pending}>
        {pending?'Uploading…':'Upload private evidence'}
      </button>
      {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
    </form>
  );
}
