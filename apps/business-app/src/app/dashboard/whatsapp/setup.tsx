'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isMetaOrigin, parseSignupEvent } from '@/lib/whatsapp-signup-event';

type MetaLoginResponse = {
  authResponse?: { code?: string };
  status?: string;
};
type MetaSdk = {
  init: (options: {
    appId: string;
    autoLogAppEvents: boolean;
    xfbml: boolean;
    version: string;
  }) => void;
  login: (
    callback: (response: MetaLoginResponse) => void,
    options: Record<string, unknown>,
  ) => void;
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

const SIGNUP_DETAILS_TIMEOUT_MS = 30_000;

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
  const router = useRouter();
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [registrationPins, setRegistrationPins] = useState<Record<string, string>>({});
  const [registrationMessages, setRegistrationMessages] = useState<Record<string, string>>({});
  const [registrationBusyId, setRegistrationBusyId] = useState<string | null>(null);
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
      if (!isMetaOrigin(event.origin)) return;
      const signup = parseSignupEvent(event.data);
      if (!signup) return;
      if (signup.kind === 'cancel') {
        codeRef.current = null;
        setBusy(false);
        setMessage('WhatsApp setup was cancelled before completion.');
        return;
      }
      if (signup.kind === 'error') {
        codeRef.current = null;
        setBusy(false);
        setMessage(signup.message);
        return;
      }
      if (signup.kind === 'missing-assets') {
        codeRef.current = null;
        setBusy(false);
        setMessage(
          'Meta did not return a WhatsApp account and phone number. Try the connection again.',
        );
        return;
      }
      assetRef.current = {
        wabaId: signup.wabaId,
        phoneNumberId: signup.phoneNumberId,
      };
      void completeIfReady();
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
      if (!response.ok)
        throw new Error(
          result.message ?? 'Could not connect this WhatsApp account.',
        );
      window.location.reload();
    } catch (error) {
      submittedRef.current = false;
      setBusy(false);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not connect this WhatsApp account.',
      );
    }
  }

  async function registerPhone(connectionId: string) {
    if (!canManage || registrationBusyId) return;
    const pin = registrationPins[connectionId] ?? '';
    if (!/^\d{6}$/.test(pin)) {
      setRegistrationMessages((current) => ({
        ...current,
        [connectionId]: 'Enter the six-digit WhatsApp two-step verification PIN.',
      }));
      return;
    }

    setRegistrationBusyId(connectionId);
    setRegistrationMessages((current) => ({
      ...current,
      [connectionId]: 'Registering the phone number with Meta…',
    }));
    try {
      const response = await fetch('/api/whatsapp/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, pin }),
      });
      const result = (await response.json()) as {
        registered?: boolean;
        message?: string;
      };
      if (!response.ok || !result.registered)
        throw new Error(result.message ?? 'Meta could not register this phone number.');
      setRegistrationPins((current) => ({ ...current, [connectionId]: '' }));
      setRegistrationMessages((current) => ({
        ...current,
        [connectionId]: 'Meta accepted the registration. Refresh WhatsApp Manager to confirm the number status.',
      }));
    } catch (error) {
      setRegistrationMessages((current) => ({
        ...current,
        [connectionId]:
          error instanceof Error
            ? error.message
            : 'Meta could not register this phone number.',
      }));
    } finally {
      setRegistrationBusyId(null);
    }
  }

  async function disconnect(connectionId: string) {
    if (!canManage || disconnectBusy) return;
    setDisconnectBusy(true);
    setMessage('Disconnecting this number from Business OS…');
    try {
      const response = await fetch('/api/whatsapp/connections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(result.message ?? 'Could not disconnect WhatsApp.');
      setDisconnectingId(null);
      setMessage(
        'Disconnected from Business OS. Message history is retained. Remove Propulse from Meta Business Settings to revoke Meta-side access too.',
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not disconnect WhatsApp.',
      );
    } finally {
      setDisconnectBusy(false);
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
          setMessage(
            response.status === 'unknown'
              ? 'Meta login was cancelled.'
              : 'Meta did not return an authorization code. Check the app roles and permissions.',
          );
          return;
        }
        codeRef.current = code;
        void completeIfReady();
        // Meta sends the account details separately. Do not wait forever for them.
        window.setTimeout(() => {
          if (codeRef.current !== code || assetRef.current) return;
          setBusy(false);
          setMessage(
            'Meta finished signup but did not send the WhatsApp account details. Try the connection again.',
          );
        }, SIGNUP_DETAILS_TIMEOUT_MS);
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
            Each company connects its own Meta Business Portfolio and WhatsApp
            Business Account.
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
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          Meta app settings are not configured on the Business OS server yet.
        </p>
      )}
      {configured && !sdkReady && (
        <p role="status" className="text-sm text-neutral-600">
          Loading Meta’s secure signup…
        </p>
      )}
      {!canManage && (
        <p role="status" className="text-sm text-neutral-600">
          Ask a workspace owner or administrator with automation management
          access to connect WhatsApp.
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-neutral-700">
          {message}
        </p>
      )}

      <div className="space-y-3">
        {connections.length === 0 && (
          <p className="rounded-lg border border-dashed p-5 text-sm text-neutral-600">
            No WhatsApp Business Account is connected to this workspace.
          </p>
        )}
        {connections.map((connection) => (
          <article
            key={connection.id}
            className="space-y-3 rounded-xl border p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold">
                  {connection.businessName ||
                    connection.verifiedName ||
                    'WhatsApp Business Account'}
                </h3>
                <p className="text-sm text-neutral-600">
                  {connection.displayPhoneNumber || connection.phoneNumberId} ·{' '}
                  {connection.status}
                </p>
                <p className="text-xs text-neutral-500">
                  WABA {connection.wabaId}
                </p>
                <p className="mt-2 text-xs text-neutral-500">
                  Connected{' '}
                  {new Date(connection.lastConnectedAt).toLocaleDateString()}
                </p>
              </div>
              {canManage && connection.status === 'connected' && (
                <div className="flex flex-wrap gap-2">
                  <a
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
                    href="https://business.facebook.com/latest/billing_hub/accounts"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Billing &amp; payments in Meta ↗
                  </a>
                  <button
                    type="button"
                    className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50"
                    onClick={() => setDisconnectingId(connection.id)}
                    disabled={disconnectBusy}
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
            {canManage && connection.status === 'connected' && (
              <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <label
                  htmlFor={`whatsapp-register-pin-${connection.id}`}
                  className="block text-sm font-semibold text-neutral-800"
                >
                  WhatsApp two-step verification PIN
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    id={`whatsapp-register-pin-${connection.id}`}
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    value={registrationPins[connection.id] ?? ''}
                    onChange={(event) =>
                      setRegistrationPins((current) => ({
                        ...current,
                        [connection.id]: event.target.value.replace(/\D/g, '').slice(0, 6),
                      }))
                    }
                    className={inputClass}
                    placeholder="6-digit PIN"
                    aria-describedby={`whatsapp-register-help-${connection.id}`}
                    disabled={registrationBusyId === connection.id}
                  />
                  <button
                    type="button"
                    className="rounded-lg bg-[#88352B] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    onClick={() => void registerPhone(connection.id)}
                    disabled={!canManage || registrationBusyId !== null}
                  >
                    {registrationBusyId === connection.id
                      ? 'Registering…'
                      : 'Register phone with Meta'}
                  </button>
                </div>
                <p
                  id={`whatsapp-register-help-${connection.id}`}
                  className="text-xs leading-5 text-neutral-600"
                >
                  Meta requires a six-digit two-step verification PIN to register a phone for Cloud API messaging. The PIN is sent to Meta for this request and is not saved by Business OS. If the display name is In Review in Meta, wait for approval before registering.
                </p>
                {registrationMessages[connection.id] && (
                  <p role="status" className="text-sm text-neutral-700">
                    {registrationMessages[connection.id]}
                  </p>
                )}
              </div>
            )}
            {disconnectingId === connection.id && (
              <div
                role="group"
                aria-label={`Confirm disconnect for ${connection.displayPhoneNumber || connection.phoneNumberId}`}
                className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-3"
              >
                <p className="text-sm text-rose-950">
                  This stops Business OS from using the saved Meta connection.
                  Existing WhatsApp messages and contacts stay in this
                  workspace. To revoke Propulse’s access from Meta completely,
                  remove the integration in Meta Business Settings.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold"
                    onClick={() => setDisconnectingId(null)}
                    disabled={disconnectBusy}
                  >
                    Keep connected
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    onClick={() => void disconnect(connection.id)}
                    disabled={disconnectBusy}
                  >
                    {disconnectBusy ? 'Disconnecting…' : 'Confirm disconnect'}
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>

      <p className="text-xs leading-5 text-neutral-500">
        Meta handles authentication and asset selection. Business OS never asks
        for a Facebook password or SMS verification code. The registration PIN is
        sent to Meta for the phone activation request and is not stored. The billing link opens Meta so
        you can add or manage the payment method or funding options available to
        your account.
      </p>
    </section>
  );
}
