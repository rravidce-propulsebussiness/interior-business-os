import type { ReactNode } from 'react';

function HomeMark(){
 return <svg className="client-auth-logo" width="58" height="58" viewBox="0 0 64 64"
  fill="none" stroke="currentColor" strokeWidth="4.3"
  strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
  <path d="m9 30 23-22 23 22M16 27v26h32V27"/>
  <path d="M27 53V37h11v16" strokeWidth="3.6"/>
 </svg>;
}
function GoogleMark(){
 return <svg viewBox="0 0 48 48" width="26" height="26" aria-hidden="true">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.39 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/>
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.25 5.48-4.77 7.18l7.73 6C44.4 38.05 46.98 31.92 46.98 24.55Z"/>
  <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.2A23.92 23.92 0 0 0 0 24c0 3.87.93 7.54 2.56 10.78l7.97-6.19Z"/>
  <path fill="#34A853" d="M24 48c6.48 0 11.92-2.13 15.89-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48Z"/>
 </svg>;
}

export function ClientAuthShell({mode,projectId,providerError,children}:{
 mode:'login'|'register';projectId?:string;providerError?:string;children:ReactNode;
}){
 const register=mode==='register';
 const query=projectId?'?project='+encodeURIComponent(projectId):'';
 const googleHref='/auth/google?audience=client';
 const switchHref=(register?'/client/login':'/client/register')+query;
 return <main className="client-auth-page" id="main-content">
  <div className="client-auth-backdrop" aria-hidden="true"/>
  <section className="client-auth-card" aria-labelledby="client-auth-title">
   <header className="client-auth-brand">
    <HomeMark/>
    <p className="client-auth-title" id="client-auth-title">Client App</p>
    <p className="client-auth-subtitle">Your Project. Your Updates.</p>
   </header>
   <div className="client-auth-invite">
    <span className="client-auth-invite-symbol" aria-hidden="true">
     <svg width="31" height="31" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="8" r="4"/><path d="M1.5 21v-2a7.5 7.5 0 0 1 15 0v2z"/>
      <circle cx="19" cy="9" r="3"/><path d="M17.4 14.5c3.3-.5 5.1 2.1 5.1 5.3V21h-4.2v-2a9 9 0 0 0-.9-4.5z"/>
     </svg>
    </span>
    <div>
     <strong>Access your project</strong>
     <p>{register
      ? 'Create an account using the exact email shared by your project owner. After verification, you can view only your project.'
      : 'Sign in using the email your project owner invited. Only the projects shared with you will appear.'}</p>
    </div>
   </div>
   {providerError&&<p className="client-auth-notice" role="alert">
    Google sign-in could not be completed. Please try again or use your email and password.
   </p>}
   <a className="client-auth-google" href={googleHref}>
    <GoogleMark/><strong>Continue with Google</strong>
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"
     fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
     <path d="M4 12h16m-6-6 6 6-6 6"/>
    </svg>
   </a>
   <div className="client-auth-divider"><span/><span>OR</span><span/></div>
   {children}
   {register&&<p className="client-auth-legal">
    Use your own email address. Your project data is only available after the owner grants access.
   </p>}
   <div className="client-auth-switch">
    <span>{register?'Already have an account?':'New to the Client App?'}</span>
    <a href={switchHref}>{register?'Sign in':'Create account'}
     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12h16m-6-6 6 6-6 6"/>
     </svg>
    </a>
   </div>
  </section>
 </main>;
}
