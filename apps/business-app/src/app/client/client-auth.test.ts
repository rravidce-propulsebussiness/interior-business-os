import {describe,expect,it} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
const load=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const register=load('./register/page.tsx');
const login=load('./login/page.tsx');
const ownerLogin=load('../login/page.tsx');
const proxy=load('../../proxy.ts');
const shell=load('./client-auth-shell.tsx');
const form=load('./client-auth-form.tsx');
const css=load('./client-auth.css');
const action=load('./client-auth-actions.ts');
const google=load('../auth/google/route.ts');
const start=load('../auth/provider-start.ts');
const callback=load('../auth/callback/route.ts');
const signIn=load('../../../../../packages/auth/src/actions.ts');
const landing=load('../../../../../packages/auth/src/login-destination.ts');

describe('Client auth uses one readable, mobile friendly design',()=>{
 it('uses one matching card and high contrast fields for both entry pages',()=>{
  expect(login).toContain('<ClientAuthShell mode="login"');
  expect(register).toContain('<ClientAuthShell mode="register"');
  expect(login).toContain('<ClientAuthForm mode="login"');
  expect(register).toContain('<ClientAuthForm mode="register"');
  expect(shell).toContain('Your Project. Your Updates.');
  expect(shell).toContain('Continue with Google');
  expect(css).toContain('color:#19293c!important');
  expect(css).toContain('-webkit-text-fill-color:#19293c!important');
  expect(css).toContain('@media(max-width:540px)');
  expect(existsSync(new URL('../../../public/client-auth-room.webp',import.meta.url))).toBe(true);
 });
 it('preserves password handling and specific project navigation',()=>{
  expect(form).toContain('autoComplete={register?\'new-password\':\'current-password\'}');
  expect(form).toContain('state.authenticated');
  expect(form).toContain("'/client/projects/'+projectId:'/client'");
  expect(login).toContain('z.uuid().safeParse(query.project)');
  expect(action).toContain('emailRedirectTo:confirm.toString()');
  expect(action).not.toContain('createOrganization');
 });
 it('uses the trusted public URL after initial login and workspace routing on Hostinger',()=>{
  expect(ownerLogin).toContain("publicAuthOrigin('http://localhost:3000/login')");
  expect(login).toContain("publicAuthOrigin('http://localhost:3000/client/login')");
  expect(proxy).toContain('new URL(routing.redirect, publicAuthOrigin(request.url))');
  expect(proxy).not.toContain('request.nextUrl.clone()');
  expect(callback).toContain('const origin = publicAuthOrigin(request.url)');
 });
 it('returns client Google sign in and email verification to /client only',()=>{
  expect(shell).toContain('/auth/google?audience=client');
  expect(google).toContain("providerStart(request,'google',audience)");
  expect(start).toContain("callback.searchParams.set('audience', 'client')");
  expect(callback).toContain('resolveLoginDestination(client, data.session.user.id, {');
  expect(callback).toContain('preferClient: clientAudience');
  expect(callback).toContain('new URL(destination, origin)');
  expect(ownerLogin).toContain('resolveLoginDestination(db, data.user.id)');
  expect(login).toContain('resolveLoginDestination(db,data.user.id,{preferClient:true})');
  expect(signIn).toContain("form.get('loginAudience') === 'client'");
  expect(landing).toContain("'client_portal_projects'");
  expect(landing).toContain("'organization_memberships'");
  expect(landing).toContain(".eq('user_id', authenticatedUserId)");
  expect(signIn).toContain('signedIn.user.id');
  expect(form).toContain('name="loginAudience" value="client"');
  expect(form).toContain('state.clientPortal');
  expect(callback).toContain('publicAuthOrigin(request.url)');
  expect(callback).not.toContain('url.origin');
 });
});
