'use client';

import { useActionState, useEffect, useState } from 'react';

type Result = { message: string; authenticated?: boolean; clientPortal?: boolean };
type Action = (state: { message: string }, form: FormData) => Promise<Result>;

function Glyph({name}:{name:'user'|'mail'|'lock'|'eye'|'eye-off'|'arrow'}) {
 const paths={
  user:<><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
  mail:<><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m3 6 9 7 9-7"/></>,
  lock:<><rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  eye:<><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  'eye-off':<><path d="m3 3 18 18M10.6 6.1A11 11 0 0 1 12 6c6.5 0 10 6 10 6a15 15 0 0 1-3.1 3.6M6 6.5C3.4 8.3 2 12 2 12s3.5 6 10 6a10 10 0 0 0 3.1-.5"/><path d="M10 10a3 3 0 0 0 4 4"/></>,
  arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,
 };
 return <svg width="21" height="21" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round"
  aria-hidden="true">{paths[name]}</svg>;
}

/** The same accessible branded form serves client sign-in and registration.
 * Only the invited, verified email can see the corresponding project's records.
 */
export function ClientAuthForm({mode,action,projectId}:{
 mode:'login'|'register';action:Action;projectId?:string;
}) {
 const [state,dispatch,busy]=useActionState(action,{message:''});
 const [visible,setVisible]=useState(false);
 useEffect(()=>{
  if(state.authenticated){
   // After cookies change, use a fresh page to avoid stale RSC on Hostinger.
   // Owners, employees and homeowners share the same authentication system.
   // The server selected the destination using active membership and project
   // invitation checks, not the login screen the person happened to open.
   window.location.replace(state.clientPortal
    ? (projectId?'/client/projects/'+projectId:'/client')
    : '/dashboard');
  }
 },[state.authenticated,projectId]);
 const register=mode==='register';
 return <form action={dispatch} className="client-auth-fields">
  {!register&&<input type="hidden" name="loginAudience" value="client"/>}
  {register&&<div className="client-auth-field">
   <label htmlFor="client-auth-name">Full name</label>
   <div className="client-auth-input">
    <Glyph name="user"/>
    <input id="client-auth-name" name="fullName" type="text" required
     autoComplete="name" maxLength={200} placeholder="Enter your full name"/>
   </div>
  </div>}
  <div className="client-auth-field">
   <label htmlFor="client-auth-email">{register?'Email':'Your invited email'}</label>
   <div className="client-auth-input">
    <Glyph name="mail"/>
    <input id="client-auth-email" name="email" type="email" required
     autoComplete="email" inputMode="email" maxLength={254}
     placeholder="you@example.com"/>
   </div>
  </div>
  <div className="client-auth-field">
   <div className="client-auth-field-header">
    <label htmlFor="client-auth-password">Password</label>
    {!register&&<a className="client-auth-forgot" href="/forgot-password">Forgot password?</a>}
   </div>
   <div className="client-auth-input">
    <Glyph name="lock"/>
    <input id="client-auth-password" name="password"
     type={visible?'text':'password'} required
     minLength={register?12:1} maxLength={128}
     autoComplete={register?'new-password':'current-password'}
     placeholder={register?'At least 12 characters':'Enter your password'}/>
    <button type="button" className="client-auth-toggle"
     aria-label={visible?'Hide password':'Show password'}
     aria-pressed={visible}
     onClick={()=>setVisible(value=>!value)}>
     <Glyph name={visible?'eye-off':'eye'}/>
    </button>
   </div>
   {register&&<small className="client-auth-help">Use at least 12 characters for your password.</small>}
  </div>
  {state.message&&<p className="client-auth-feedback" role={state.message.startsWith('Check your email')?'status':'alert'}>
   {state.message}</p>}
  <button className="client-auth-submit" type="submit" disabled={busy||state.authenticated===true}>
   <span>{busy?'Please wait…':register?'Create account':'Sign in'}</span>
   <Glyph name="arrow"/>
  </button>
 </form>;
}
