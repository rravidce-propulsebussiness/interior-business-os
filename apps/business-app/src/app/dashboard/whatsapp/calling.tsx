'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { readApiResponse } from '@/lib/whatsapp-response';
import {
  canRequestWhatsAppCallingEnable,
  isWhatsAppCallingEnabled,
} from '@/lib/whatsapp-calling-status';
import {
  canStartWhatsAppCall,
  metaCallActionAllowed,
  type MetaCallPermission,
} from '@/lib/whatsapp-calling-permission';

type Calling = {
  status?: string;
  call_icon_visibility?: string;
  callback_permission_status?: string;
  sip?: unknown;
};
type Permission = MetaCallPermission;
type CallEvent = {
  id: string;
  event: string;
  direction: string;
  from: string;
  to: string;
  timestamp: number;
  session?: { sdp_type?: string; sdp?: string };
};
const button =
  'rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-800 hover:border-[#BD5C3F] disabled:cursor-not-allowed disabled:opacity-40';
const primary =
  'rounded-xl bg-[#88352B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#6f2b23] disabled:cursor-not-allowed disabled:opacity-40';

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'WhatsApp calling could not complete the action.';
}
async function waitForIce(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === 'complete') return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      peer.removeEventListener('icegatheringstatechange', check);
      reject(
        new Error(
          'Could not gather network candidates. Try another connection or configure TURN relay.',
        ),
      );
    }, 12000);
    function check() {
      if (peer.iceGatheringState === 'complete') {
        window.clearTimeout(timeout);
        peer.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    }
    peer.addEventListener('icegatheringstatechange', check);
    check();
  });
}

export function WhatsAppCalling({
  connectionId,
  selectedWaId,
  active,
  canManage,
  onOpen,
  onCallActivityChange,
}: {
  connectionId: string;
  selectedWaId: string;
  active: boolean;
  canManage: boolean;
  onOpen: () => void;
  onCallActivityChange: (active: boolean) => void;
}) {
  const [settings, setSettings] = useState<Calling | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [relayConfigured, setRelayConfigured] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<Permission | null>(null);
  const [permissionFor, setPermissionFor] = useState('');
  const [permissionError, setPermissionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [notice, setNotice] = useState('');
  const [incoming, setIncoming] = useState<CallEvent | null>(null);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const activeCallRef = useRef('');
  const appliedAnswerRef = useRef('');
  const dismissedCallsRef = useRef(new Set<string>());

  const closeMedia = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    remoteStreamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    activeCallRef.current = '';
    appliedAnswerRef.current = '';
    setPhase('idle');
    setMuted(false);
    onCallActivityChange(false);
  }, [onCallActivityChange]);

  useEffect(() => {
    // When leaving WhatsApp, request termination before releasing local audio.
    // keepalive is best-effort during tab closure; customers can also hang up.
    const peer = peerRef;
    const stream = streamRef;
    const callId = activeCallRef;
    const terminateOnExit = () => {
      const id = callId.current;
      if (!id) return;
      callId.current = '';
      try {
        void fetch('/api/whatsapp/calling', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'terminate',
            connectionId,
            callId: id,
          }),
          keepalive: true,
          credentials: 'same-origin',
        }).catch(() => undefined);
      } catch {
        // The peer is closed even if the network is no longer available.
      }
    };
    window.addEventListener('pagehide', terminateOnExit);
    return () => {
      window.removeEventListener('pagehide', terminateOnExit);
      terminateOnExit();
      peer.current?.close();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, [connectionId]);

  const get = useCallback(
    async (action: string, waId?: string) => {
      const params = new URLSearchParams({ connectionId, action });
      if (waId) params.set('waId', waId);
      const response = await fetch(`/api/whatsapp/calling?${params}`, {
        cache: 'no-store',
      });
      const result = (await readApiResponse(response)) as Record<
        string,
        unknown
      >;
      if (!response.ok)
        throw new Error(String(result.message ?? 'Meta calling check failed.'));
      return result;
    },
    [connectionId],
  );

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      const response = await fetch('/api/whatsapp/calling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, connectionId }),
      });
      const result = (await readApiResponse(response)) as Record<
        string,
        unknown
      >;
      if (!response.ok)
        throw new Error(
          String(result.message ?? 'Meta rejected the calling request.'),
        );
      return result;
    },
    [connectionId],
  );

  const refreshSettings = useCallback(async () => {
    if (!connectionId || !canManage) return null;
    let next: Calling | null = null;
    try {
      const result = await get('settings');
      next = (result.calling as Calling | null) ?? { status: 'NOT_CONFIGURED' };
      setSettings(next);
      setSettingsError('');
    } catch (error) {
      setSettings(null);
      setSettingsError(errorText(error));
    }
    try {
      const ice = await get('ice');
      setRelayConfigured(ice.relayConfigured === true);
    } catch {
      setRelayConfigured(false);
    }
    return next;
  }, [connectionId, canManage, get]);

  const refreshPermission = useCallback(async () => {
    if (!connectionId || !canManage || !selectedWaId) return;
    try {
      const result = await get('permissions', selectedWaId);
      setPermission((result.permission as Permission | null) ?? null);
      setPermissionFor(selectedWaId);
      setPermissionError('');
    } catch (error) {
      setPermissionError(errorText(error));
      setPermission(null);
      setPermissionFor('');
    }
  }, [connectionId, canManage, selectedWaId, get]);

  useEffect(() => {
    const handle = window.requestAnimationFrame(() => void refreshSettings());
    return () => window.cancelAnimationFrame(handle);
  }, [refreshSettings]);
  useEffect(() => {
    const handle = window.requestAnimationFrame(() => {
      setPermission(null);
      setPermissionFor('');
      setPermissionError('');
      if (active && selectedWaId && isWhatsAppCallingEnabled(settings?.status))
        void refreshPermission();
    });
    return () => window.cancelAnimationFrame(handle);
  }, [active, selectedWaId, refreshPermission, settings?.status]);

  const beginAudio = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error('A secure browser and microphone access are required.');
    const ice = (await get('ice')) as {
      iceServers?: RTCIceServer[];
      relayConfigured?: boolean;
    };
    if (!Array.isArray(ice.iceServers) || ice.iceServers.length === 0)
      throw new Error('WebRTC network configuration is not available.');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    let peer: RTCPeerConnection;
    try {
      peer = new RTCPeerConnection({ iceServers: ice.iceServers });
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      throw error;
    }
    setRelayConfigured(ice.relayConfigured === true);
    stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));
    peer.ontrack = (event) => {
      if (audioRef.current) {
        remoteStreamRef.current =
          event.streams[0] ?? new MediaStream([event.track]);
        audioRef.current.srcObject = remoteStreamRef.current;
        void audioRef.current
          .play()
          .catch(() =>
            setNotice('Tap the audio player to allow call playback.'),
          );
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed')
        setNotice(
          'Audio connection failed. A TURN relay may be required on this network.',
        );
    };
    streamRef.current = stream;
    peerRef.current = peer;
    return peer;
  }, [get]);

  const poll = useCallback(async () => {
    if (!connectionId || !canManage) return;
    try {
      const result = await get('events');
      const events = ((result.events as CallEvent[] | undefined) ?? []).filter(
        (event) => event.id,
      );
      const current = activeCallRef.current;
      if (current) {
        const updated = events.find(
          (event) => event.id === current && event.event === 'terminate',
        );
        if (updated) {
          setNotice('Call ended.');
          closeMedia();
          setIncoming(null);
          return;
        }
        const answer = events.find(
          (event) =>
            event.id === current &&
            event.event === 'connect' &&
            event.direction === 'BUSINESS_INITIATED' &&
            event.session?.sdp_type === 'answer',
        );
        if (
          answer?.session?.sdp &&
          appliedAnswerRef.current !== current &&
          peerRef.current
        ) {
          appliedAnswerRef.current = current;
          try {
            await peerRef.current.setRemoteDescription({
              type: 'answer',
              sdp: answer.session.sdp,
            });
            setPhase('connected');
          } catch (error) {
            setNotice(errorText(error));
          }
        }
        return;
      }
      const incomingCall = events.find(
        (event) =>
          event.direction === 'USER_INITIATED' &&
          event.event === 'connect' &&
          event.session?.sdp_type === 'offer' &&
          Boolean(event.session.sdp) &&
          Date.now() - event.timestamp * 1000 < 60_000 &&
          !dismissedCallsRef.current.has(event.id) &&
          !events.some(
            (other) => other.id === event.id && other.event === 'terminate',
          ),
      );
      setIncoming(incomingCall ?? null);
    } catch {
      /* Inbox can continue if Meta webhook data is momentarily unavailable. */
    }
  }, [connectionId, canManage, closeMedia, get]);

  useEffect(() => {
    if (
      !connectionId ||
      !canManage ||
      !isWhatsAppCallingEnabled(settings?.status)
    )
      return;
    const first = window.setTimeout(() => void poll(), 0);
    const handle = window.setInterval(() => void poll(), 2500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(handle);
    };
  }, [connectionId, canManage, poll, settings?.status]);

  useEffect(() => {
    if (!audioRef.current || !remoteStreamRef.current) return;
    audioRef.current.srcObject = remoteStreamRef.current;
    void audioRef.current.play().catch(() => undefined);
  }, [active, phase, incoming]);

  async function requestPermission() {
    if (!selectedWaId) return;
    setBusy(true);
    try {
      await post({ action: 'request_permission', waId: selectedWaId });
      setNotice(
        'WhatsApp call permission request sent. The customer must approve it.',
      );
      await refreshPermission();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    if (
      !window.confirm(
        'Request WhatsApp Calling activation for this business number? The customer call button will remain HIDDEN until your relay, calls webhook and answering agents are ready. Meta may reject the request if the account is not eligible.',
      )
    )
      return;
    setBusy(true);
    try {
      await post({ action: 'enable' });
      const current = await refreshSettings();
      setNotice(
        isWhatsAppCallingEnabled(current?.status)
          ? 'Meta Calling is enabled. The public call button remains hidden until you explicitly publish it.'
          : 'Meta accepted the setup request, but its enabled status is not yet confirmed. Check WhatsApp Manager and refresh the status.',
      );
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function changePublicCallButton(show: boolean) {
    if (
      !window.confirm(
        show
          ? 'Show the WhatsApp call button to customers? Confirm the calls webhook is subscribed and an agent is online to answer. Incoming calls may arrive immediately.'
          : 'Hide the WhatsApp call button from customers? Existing active calls will not be disconnected.',
      )
    )
      return;
    setBusy(true);
    try {
      await post({ action: show ? 'publish' : 'hide' });
      const current = await refreshSettings();
      setNotice(
        current?.call_icon_visibility === (show ? 'DEFAULT' : 'DISABLE_ALL')
          ? show
            ? 'Customer call button is visible in Meta.'
            : 'Customer call button is hidden in Meta.'
          : 'Meta accepted the request; refresh status in a moment to verify the call button setting.',
      );
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function call() {
    if (
      !selectedWaId ||
      permissionFor !== selectedWaId ||
      !canStartWhatsAppCall(permission)
    )
      return;
    setBusy(true);
    try {
      const peer = await beginAudio();
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIce(peer);
      const result = await post({
        action: 'connect',
        waId: selectedWaId,
        sdp: peer.localDescription?.sdp,
      });
      activeCallRef.current = String(result.callId ?? '');
      onCallActivityChange(true);
      setPhase('dialing');
      setNotice('Calling customer. Waiting for their answer…');
    } catch (error) {
      setNotice(errorText(error));
      closeMedia();
    } finally {
      setBusy(false);
    }
  }

  async function answer() {
    if (!incoming?.session?.sdp) return;
    setBusy(true);
    try {
      const peer = await beginAudio();
      await peer.setRemoteDescription({
        type: 'offer',
        sdp: incoming.session.sdp,
      });
      const answerSdp = await peer.createAnswer();
      await peer.setLocalDescription(answerSdp);
      await waitForIce(peer);
      // Meta Calling API negotiates inbound media with pre_accept followed
      // by accept; the SDP answer includes all non-trickle ICE candidates.
      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new Error('WebRTC did not create an SDP answer.');
      await post({ action: 'pre_accept', callId: incoming.id, sdp });
      await post({ action: 'accept', callId: incoming.id, sdp });
      activeCallRef.current = incoming.id;
      onCallActivityChange(true);
      dismissedCallsRef.current.add(incoming.id);
      setIncoming(null);
      setPhase('connected');
      setNotice('Call connected.');
    } catch (error) {
      setNotice(errorText(error));
      closeMedia();
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!incoming) return;
    setBusy(true);
    try {
      await post({ action: 'reject', callId: incoming.id });
      dismissedCallsRef.current.add(incoming.id);
      setIncoming(null);
      setNotice('Incoming call declined.');
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function hangup() {
    const id = activeCallRef.current;
    if (!id) return;
    setBusy(true);
    try {
      await post({ action: 'terminate', callId: id });
      closeMedia();
      setNotice('Call ended.');
    } catch (error) {
      // Keep the End Call control visible. The session may still be connected
      // and billable at Meta until termination succeeds.
      setNotice(
        `Could not end the call with Meta: ${errorText(error)}. Retry End call or ask the customer to hang up.`,
      );
    } finally {
      setBusy(false);
    }
  }

  function toggleMute() {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  }

  if (!canManage) {
    return active ? (
      <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
        Calling requires WhatsApp management permission.
      </p>
    ) : null;
  }

  if (!active && !incoming && phase === 'idle')
    return <audio ref={audioRef} autoPlay playsInline className="hidden" />;
  return (
    <section
      className={
        active
          ? 'mb-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm'
          : 'fixed bottom-5 right-5 z-[80] max-w-sm rounded-2xl border border-[#BD5C3F] bg-white p-4 shadow-xl'
      }
      aria-label="WhatsApp voice calling"
    >
      <audio
        ref={audioRef}
        autoPlay
        playsInline
        controls={phase === 'connected'}
        className="mb-2 w-full"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-[#88352B]">WhatsApp voice calling</h3>
          <p className="mt-1 text-xs text-stone-500">
            {phase === 'idle'
              ? 'Meta Cloud API · live readiness checks'
              : `Call status: ${phase}`}
          </p>
        </div>
        {!active && (
          <button className={button} onClick={onOpen}>
            Open calls
          </button>
        )}
      </div>
      {incoming && (
        <div
          role="alert"
          className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
        >
          <p className="font-semibold">
            Incoming WhatsApp call · +{incoming.from}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              className={primary}
              onClick={() => void answer()}
              disabled={busy}
            >
              Answer
            </button>
            <button
              className={button}
              onClick={() => void reject()}
              disabled={busy}
            >
              Decline
            </button>
          </div>
        </div>
      )}
      {phase !== 'idle' && (
        <div className="mt-3 flex gap-2">
          <button className={button} onClick={toggleMute}>
            {muted ? 'Unmute' : 'Mute'}
          </button>
          <button
            className="rounded-xl bg-red-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
            disabled={busy}
            onClick={() => void hangup()}
          >
            End call
          </button>
        </div>
      )}
      {active && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-stone-700">
              Number calling:{' '}
              <strong>
                {settings?.status ??
                  (settingsError ? 'Could not check' : 'Checking…')}
              </strong>
            </span>
            <button
              className={button}
              disabled={busy}
              onClick={() => void refreshSettings()}
            >
              Refresh Meta status
            </button>
            {canRequestWhatsAppCallingEnable(settings?.status) && (
              <button
                className={primary}
                disabled={busy}
                onClick={() => void enable()}
              >
                Activate with Meta (private)
              </button>
            )}
            {isWhatsAppCallingEnabled(settings?.status) &&
              settings?.call_icon_visibility !== 'DEFAULT' && (
                <button
                  className={primary}
                  disabled={busy || relayConfigured !== true}
                  onClick={() => void changePublicCallButton(true)}
                  title={
                    relayConfigured
                      ? 'Requires a subscribed calls webhook and available answering agents.'
                      : 'Configure a TURN relay before displaying the customer call button.'
                  }
                >
                  Show customer call button
                </button>
              )}
            {isWhatsAppCallingEnabled(settings?.status) &&
              settings?.call_icon_visibility === 'DEFAULT' && (
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => void changePublicCallButton(false)}
                >
                  Hide customer call button
                </button>
              )}
          </div>
          {settingsError && (
            <p className="text-xs text-red-700">{settingsError}</p>
          )}
          {canRequestWhatsAppCallingEnable(settings?.status) && (
            <p
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
            >
              Meta Calling is not yet active on this number. Select
              &quot;Activate with Meta (private)&quot; to request activation,
              then verify it in WhatsApp Manager. Meta currently requires a
              messaging limit of at least 2,000 business-initiated conversations
              per 24 hours. If Meta rejects the request, that eligibility or app
              permissions may be the blocker.
            </p>
          )}
          {relayConfigured === false && (
            <p
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
            >
              TURN relay is not configured. Calls may connect without audio on
              restrictive networks. Add a TURN server before production rollout.
            </p>
          )}
          <p className="text-xs leading-5 text-stone-500">
            Calling requires Meta approval, the calls webhook subscription, and
            an agent with microphone access. Do not enable the public call
            button without a tested answering workflow. Reliable audio across
            restrictive networks may require TURN relay.
          </p>
          {selectedWaId ? (
            <div className="rounded-xl border border-stone-200 p-4">
              <p className="text-sm font-semibold text-stone-800">
                Customer +{selectedWaId}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Meta call permission:{' '}
                {permission?.permission?.status ?? 'Unknown'}
              </p>
              {permissionError && (
                <p className="mt-1 text-xs text-red-700">{permissionError}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={button}
                  disabled={busy || !isWhatsAppCallingEnabled(settings?.status)}
                  onClick={() => void refreshPermission()}
                >
                  Check permission
                </button>
                <button
                  className={button}
                  disabled={
                    busy ||
                    !isWhatsAppCallingEnabled(settings?.status) ||
                    permissionFor !== selectedWaId ||
                    !metaCallActionAllowed(
                      permission,
                      'send_call_permission_request',
                    )
                  }
                  onClick={() => void requestPermission()}
                >
                  Request permission
                </button>
                <button
                  className={primary}
                  disabled={
                    busy ||
                    phase !== 'idle' ||
                    !isWhatsAppCallingEnabled(settings?.status) ||
                    permissionFor !== selectedWaId ||
                    !canStartWhatsAppCall(permission)
                  }
                  onClick={() => void call()}
                >
                  Call customer
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-stone-500">
              Open a conversation and select Call to check that contact&apos;s
              permissions.
            </p>
          )}
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="mt-3 rounded-xl bg-stone-50 p-3 text-xs text-stone-700"
        >
          {notice}
        </p>
      )}
    </section>
  );
}
