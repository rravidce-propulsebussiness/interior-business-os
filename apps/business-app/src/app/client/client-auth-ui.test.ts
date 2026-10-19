import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const registration = read('./register/page.tsx');
const login = read('./login/page.tsx');
const form = read('./client-auth-form.tsx');
const shell = read('./client-auth-shell.tsx');
const styles = read('./client-auth.css');
const google = read('../auth/google/route.ts');
const start = read('../auth/provider-start.ts');
const callback = read('../auth/callback/route.ts');
const actions = read('./client-auth-actions.ts');

describe('Client App authentication design', () => {
 it('uses the same branded responsive shell and accessible fields on both screens', () => {
  expect(registration).toContain('<ClientAuthShell mode="register"');
  expect(login).toContain('<ClientAuthShell mode="login"');
  expect(registration).toContain('clientSignUp');
  expect(login).toContain('action={signIn}');
  expect(shell).toContain('Your Project. Your Updates.');
  expect(shell).toContain('Continue with Google');
  expect(styles).toContain('color:#19293c!important;');
  expect(styles).toContain('client-auth-backdrop');
  expect(styles).toContain('@media(max-width:540px)');
  expect(form).toContain('autoComplete="email"');
  expect(form).toContain("type={visible?'text':'password'}");
  expect(form).toContain("role={state.message.startsWith('Check your email')?'status':'alert'}");
  expect(form).toContain('minLength={register?12:1}');
 });
 it('signs up clients via separate confirmation, not staff organization creation', () => {
  expect(actions).toContain("new URL('/auth/callback',origin)");
  expect(actions).toContain("confirm.searchParams.set('audience','client')");
  expect(actions).toContain('emailRedirectTo:confirm.toString()');
  expect(actions).toContain('database.auth.signUp');
  expect(actions).not.toContain('organization.create');
 });
 it('routes Google client sign-in to portal through PKCE session exchange', () => {
  expect(shell).toContain("'/auth/google?audience=client'");
  expect(google).toContain("get('audience')==='client'");
  expect(start).toContain("callback.searchParams.set('audience', 'client')");
  expect(start).toContain("client.auth.signInWithOAuth");
  expect(callback).toContain('client.auth.exchangeCodeForSession(code)');
  expect(callback).toContain("if (clientAudience) return NextResponse.redirect(new URL('/client', url.origin));");
  expect(callback).toContain("url.searchParams.get('type') === 'email'");
  expect(callback).not.toContain('return NextResponse.redirect(new URL(' +
   "'/dashboard', url.origin));\n      // Client users");
 });
 it('does not offer arbitrary redirect URLs or client-side project authorization', () => {
  expect(login).toContain('z.uuid().safeParse(query.project)');
  expect(registration).toContain('z.uuid().safeParse(query.project)');
  expect(form).toContain("projectId?'/client/projects/'+projectId:'/client'");
  expect(start).toContain("publicAuthOrigin(request.url)");
  expect(start).not.toContain("searchParams.get('next')");
 });
});
