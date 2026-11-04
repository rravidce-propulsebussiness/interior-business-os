'use client';

import { useEffect, useRef, useState } from 'react';

type MetaLoginResponse = {
  authResponse?: { code?: string };
  status?: string;
};
type MetaSdk = {
  init: (options: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (callback: (response: MetaLoginResponse) => void, options: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    FB?: MetaSdk;
    fbAsyncInit?: () => void;
  }
}
type Connection = {
  id: string;
  businessName: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: string;
  lastConnectedAt: string;
};
type SignupAsset = { wabaId: string; phoneNumberId: string };

const inputClass =
  'rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow-sm disabled:cursor-not-allowed disabled:opacity-50';

export function WhatsAppSetup({
  configured,
  appId,
  configurationId,
  graphApiVersion,
  canManage,
  initialMessage,
  connections,
}: {
  configured: boolean;
  appId: string;
  configurationId: string;
  graphApiVersion: string;
  canManage: boolean;
  initialMessage: string;
  connections: Connection[];
}) {
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const codeRef = useRef<string | null>(null);
  const assetRef = useRef<SignupAsset | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!configured) return;
    const init = () => {
      if (!window.FB) return;
      window.FB.init({
        appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: graphApiVersion,
      });
      setSdkReady(true);
    };
    if (window.FB) {
      init();
      return;
    }
    window.fbAsyncInit = init;
    const existing = document.getElementById('facebook-jssdk');
    if (existing) return;
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    document.body.appendChild(script);
  }, [appId, configured, graphApiVersion]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      let host = '';
      try {
        host = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) return;
      let data: {
        type?: string;
        event?: string;
        data?: { waba_id?: string; phone_number_id?: string };
      };
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (data.event === 'CANCEL') {
        setBusy(false);
        setMessage('WhatsApp setup was cancelled before completion.');
        return;
      }
      if (data.event === 'FINISH' || data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
        const wabaId = data.data?.waba_id;
        const phoneNumberId = data.data?.phone_number_id;
        if (!wabaId || !phoneNumberId) {
          setBusy(false);
          setMessage('Meta did not return a WhatsApp account and phone number. Try the connection again.');
          return;
        }
        assetRef.current = { wabaId, phoneNumberId };
        void completeIfReady();
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  });

  async function completeIfReady() {
    if (!codeRef.current || !assetRef.current || submittedRef.current) return;
    submittedRef.current = true;
    setBusy(true);
    setMessage('Securely verifying your WhatsApp account with Meta…');
    try {
      const response = await fetch('/api/whatsapp/embedded-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: codeRef.current,
          wabaId: assetRef.current.wabaId,
          phoneNumberId: assetRef.current.phoneNumberId,
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message ?? 'Could not connect this WhatsApp account.');
      window.location.reload();
    } catch (error) {
      submittedRef.current = false;
      setBusy(false);
      setMessage(error instanceof Error ? error.message : 'Could not connect this WhatsApp account.');
    }
  }

  function connect() {
    if (!window.FB || !sdkReady || !canManage || busy) return;
    codeRef.current = null;
    assetRef.current = null;
    submittedRef.current = false;
    setBusy(true);
    setMessage('Complete the secure WhatsApp signup window from Meta.');
    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setBusy(false);
          setMessage(response.status === 'unknown' ? 'Meta login was cancelled.' : 'Meta did not return an authorization code. Check the app roles and permissions.');
          return;
        }
        codeRef.current = code;
        void completeIfReady();
      },
      {
        config_id: configurationId,
        auth_type: 'rerequest',
        response_type: 'code',
        override_default_response_type: true,
        extras: {},
      },
    );
  }

  return (
    <section className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">WhatsApp API connection</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Each company connects its own Meta Business Portfolio and WhatsApp Business Account.
          </p>
        </div>
        <button
          type="button"
          className={inputClass}
          onClick={connect}
          disabled={!configured || !sdkReady || !canManage || busy}
        >
          {busy ? 'Connecting…' : 'Connect WhatsApp with Meta'}
        </button>
      </div>

      {!configured && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Meta app settings are not configured on the Business OS server yet.
        </p>
      )}
      {configured && !sdkReady && (
        <p role="status" className="text-sm text-neutral-600">Loading Meta’s secure signup…</p>
      )}
      {!canManage && (
        <p role="status" className="text-sm text-neutral-600">
          Ask a workspace owner or administrator with automation management access to connect WhatsApp.
        </p>
      )}
      {message && <p role="status" className="text-sm text-neutral-700">{message}</p>}

      <div className="space-y-3">
        {connections.length === 0 && (
          <p className="rounded-lg border border-dashed p-5 text-sm text-neutral-600">
            No WhatsApp Business Account is connected to this workspace.
          </p>
        )}
        {connections.map((connection) => (
          <article key={connection.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
            <div>
              <h3 className="font-semibold">{connection.businessName || connection.verifiedName || 'WhatsApp Business Account'}</h3>
              <p className="text-sm text-neutral-600">
                {connection.displayPhoneNumber || connection.phoneNumberId} · {connection.status}
              </p>
              <p className="text-xs text-neutral-500">WABA {connection.wabaId}</p>
            </div>
            <p className="text-xs text-neutral-500">
              Connected {new Date(connection.lastConnectedAt).toLocaleDateString()}
            </p>
          </article>
        ))}
      </div>

      <p className="text-xs leading-5 text-neutral-500">
        Meta handles authentication and asset selection. Propulse never asks for a Facebook password or verification code. You can disconnect the account from Meta Business Settings.
      </p>
    </section>
  );
}
