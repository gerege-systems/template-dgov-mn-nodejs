// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, Loader2, Check, Copy, Download, RefreshCw } from 'lucide-react';
import Alert from '@/components/Alert';
import { postJSON } from '@/lib/client';
import { useT } from '@/lib/lang';

// Superadmin онбординг wizard — Google → eID → И-мэйл → 2FA → Нөөц код.
// onboard_token-ийг алхмуудын хооронд component state-д (болон sessionStorage-д
// eID round-trip/reload-ыг тэсвэрлэхийн тулд) хадгална. Финал алхам totp/verify
// нь backend-ээс токен авч BFF нь session cookie-г суулгадаг — дараа нь /admin/superadmin.

type Step = 'google' | 'eid' | 'email' | 'totp' | 'done';

const STEP_ORDER: Step[] = ['google', 'eid', 'email', 'totp', 'done'];
const TOKEN_KEY = 'sa_onboard_token';
const EMAIL_KEY = 'sa_onboard_email';

// ── Алхмын прогресс индикатор ────────────────────────────────────────────────
function Progress({ current }: { current: Step }) {
  const { T } = useT();
  const labels: Record<Step, string> = {
    google: 'Google',
    eid: T('onboard.step.eid'),
    email: T('onboard.step.email'),
    totp: T('onboard.step.totp'),
    done: T('onboard.step.recovery'),
  };
  const currentIdx = STEP_ORDER.indexOf(current);
  return (
    <ol className="onboard-steps" style={{ display: 'flex', gap: 6, listStyle: 'none', padding: 0, margin: '0 0 4px' }}>
      {STEP_ORDER.map((s, i) => {
        const state = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'todo';
        return (
          <li key={s} style={{ flex: 1, textAlign: 'center' }}>
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: state === 'todo' ? 'var(--border)' : 'var(--dan-blue-text, var(--accent))',
                opacity: state === 'active' ? 1 : state === 'done' ? 0.8 : 1,
              }}
            />
            <span
              className="mono"
              style={{
                fontSize: 11,
                color: state === 'active' ? 'var(--fg)' : 'var(--muted)',
                fontWeight: state === 'active' ? 600 : 400,
                display: 'block',
                marginTop: 4,
              }}
            >
              {labels[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ── Google алхам ─────────────────────────────────────────────────────────────
function GoogleStep({ error }: { error?: string }) {
  const { T } = useT();
  return (
    <>
      <div>
        <h1 id="onboard-title">{T('onboard.title')}</h1>
        <p className="signin-card__lede" style={{ marginTop: 6, fontSize: 14 }}>{T('onboard.googleSub')}</p>
      </div>
      {error && <Alert kind="danger">{error}</Alert>}
      <Alert kind="info">{T('onboard.inviteNotice')}</Alert>
      <a className="btn btn--google btn--lg btn--block" href="/api/auth/superadmin/onboard/google/start">
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.2 13.3 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-17z"/><path fill="#FBBC05" d="M10.4 28.3a14.5 14.5 0 0 1 0-8.6l-7.8-6.1a24 24 0 0 0 0 20.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.6 2.2-8.8 2.2-6.4 0-11.8-3.8-13.6-9.3l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
        <span>{T('onboard.googleButton')}</span>
      </a>
    </>
  );
}

// ── eID алхам (QR / РД push — онбординг эндпойнтууд) ──────────────────────────
interface StartData {
  session_id: string;
  device_link_url?: string;
  verification_code: string;
  expires_at: string;
}
type Method = 'id' | 'qr';
type Phase = 'idle' | 'starting' | 'waiting' | 'expired' | 'refused' | 'error' | 'success';
const POLL_INTERVAL_MS = 2500;

function EidStep({ onboardToken, onDone }: { onboardToken: string; onDone: () => void }) {
  const { T } = useT();
  const [method, setMethod] = useState<Method>('id');
  const [phase, setPhase] = useState<Phase>('idle');
  const [start, setStart] = useState<StartData | null>(null);
  const [nationalId, setNationalId] = useState('');
  const [idError, setIdError] = useState('');

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const lastMethod = useRef<Method>('id');

  const stopTimers = useCallback(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    if (expiryTimer.current) { clearTimeout(expiryTimer.current); expiryTimer.current = null; }
  }, []);

  const poll = useCallback(async (sessionId: string) => {
    const res = await postJSON<{ state?: string; step?: string }>('/api/auth/superadmin/onboard/eid/poll', {
      onboard_token: onboardToken,
      session_id: sessionId,
    });
    if (!mounted.current) return;
    if (!res.ok) return; // түр зуурын алдаа — дараагийн интервалд дахин.
    const { state, step } = res.data ?? {};
    if (state === 'COMPLETE' || step === 'email') {
      stopTimers();
      setPhase('success');
      onDone();
      return;
    }
    if (state === 'EXPIRED') { stopTimers(); setPhase('expired'); return; }
    if (state === 'REFUSED') { stopTimers(); setPhase('refused'); return; }
  }, [onboardToken, onDone, stopTimers]);

  const armSession = useCallback((data: StartData) => {
    setStart(data);
    setPhase('waiting');
    pollTimer.current = setInterval(() => { void poll(data.session_id); }, POLL_INTERVAL_MS);
    const expiresMs = new Date(data.expires_at).getTime() - Date.now();
    if (Number.isFinite(expiresMs) && expiresMs > 0) {
      expiryTimer.current = setTimeout(() => {
        if (!mounted.current) return;
        stopTimers();
        setPhase((p) => (p === 'waiting' ? 'expired' : p));
      }, expiresMs);
    }
  }, [poll, stopTimers]);

  const beginQr = useCallback(async () => {
    stopTimers();
    setStart(null); setIdError('');
    lastMethod.current = 'qr';
    setPhase('starting');
    // Онбординг үед cross-device (browser өөрөө poll) — same-device callback resume
    // хийхгүй тул callbackUrl хоосон.
    const res = await postJSON<StartData>('/api/auth/superadmin/onboard/eid/start', {
      onboard_token: onboardToken,
      callbackUrl: '',
    });
    if (!mounted.current) return;
    if (!res.ok || !res.data?.session_id) { setPhase('error'); return; }
    armSession(res.data);
  }, [armSession, onboardToken, stopTimers]);

  const beginId = useCallback(async () => {
    const rd = nationalId.trim();
    if (!rd) { setIdError(T('auth.eid.nationalIdRequired')); return; }
    stopTimers();
    setStart(null); setIdError('');
    lastMethod.current = 'id';
    setPhase('starting');
    const res = await postJSON<StartData>('/api/auth/superadmin/onboard/eid/start-id', {
      onboard_token: onboardToken,
      national_id: rd,
      callbackUrl: '',
    });
    if (!mounted.current) return;
    if (!res.ok || !res.data?.session_id) { setPhase('error'); return; }
    armSession(res.data);
  }, [armSession, nationalId, onboardToken, stopTimers, T]);

  const retry = useCallback(() => {
    if (lastMethod.current === 'qr') void beginQr();
    else void beginId();
  }, [beginQr, beginId]);

  const switchMethod = useCallback((m: Method) => {
    if (m === method) return;
    stopTimers();
    setStart(null); setIdError('');
    setPhase('idle');
    setMethod(m);
    if (m === 'qr') void beginQr();
  }, [method, stopTimers, beginQr]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stopTimers(); };
  }, [stopTimers]);

  const isTerminal = phase === 'expired' || phase === 'refused' || phase === 'error';
  const busy = phase === 'starting' || phase === 'waiting';

  return (
    <div className="form-grid" aria-live="polite">
      <div>
        <h1 id="onboard-title">{T('onboard.eidTitle')}</h1>
        <p className="signin-card__lede" style={{ marginTop: 6, fontSize: 14 }}>{T('onboard.eidSub')}</p>
      </div>

      <div className="segmented segmented--tall" role="tablist" style={{ display: 'flex', width: '100%' }}>
        <button type="button" role="tab" aria-selected={method === 'id'} className={`segmented__item${method === 'id' ? ' is-active' : ''}`} style={{ flex: 1 }} onClick={() => switchMethod('id')}>
          <span>{T('auth.eid.methodId')}</span>
        </button>
        <button type="button" role="tab" aria-selected={method === 'qr'} className={`segmented__item${method === 'qr' ? ' is-active' : ''}`} style={{ flex: 1 }} onClick={() => switchMethod('qr')}>
          <span>{T('auth.eid.methodQr')}</span>
        </button>
      </div>

      {phase === 'error' && <Alert kind="danger">{T('auth.eid.startError')}</Alert>}
      {phase === 'expired' && <Alert kind="info">{T('auth.eid.expired')}</Alert>}
      {phase === 'refused' && <Alert kind="danger">{T('auth.eid.refused')}</Alert>}
      {phase === 'success' && <Alert kind="success">{T('auth.eid.success')}</Alert>}
      {phase === 'starting' && (
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>{T('auth.eid.starting')}</p>
      )}

      {method === 'id' && phase !== 'waiting' && phase !== 'starting' && (
        <form className="field" onSubmit={(e) => { e.preventDefault(); void beginId(); }}>
          <p className="login-instruction">{T('auth.eid.idInstruction')}</p>
          <label className="field__label" htmlFor="onboard-eid-rd">{T('auth.eid.nationalIdLabel')}</label>
          <input id="onboard-eid-rd" className="input mono input--lg-center" value={nationalId}
            onChange={(e) => { setNationalId(e.target.value); if (idError) setIdError(''); }}
            placeholder={T('auth.eid.nationalIdPlaceholder')} aria-invalid={idError ? 'true' : undefined} autoComplete="off" autoFocus />
          {idError && <span className="field__error">{idError}</span>}
          <button className="btn btn--eid btn--lg btn--block" type="submit" style={{ marginTop: 6 }}>
            <span>{T('auth.eid.submit')}</span>
          </button>
        </form>
      )}

      {method === 'id' && phase === 'waiting' && start && (
        <>
          <p className="signin-card__lede" style={{ fontSize: 14, marginTop: -4 }}>{T('auth.eid.pushSent')}</p>
          <div style={{ textAlign: 'center', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{T('auth.eid.verificationCode')}</div>
            <div className="mono" style={{ fontSize: 30, fontWeight: 700, letterSpacing: 4, color: 'var(--fg)' }}>{start.verification_code}</div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, marginBottom: 0 }}>{T('auth.eid.pushHint')}</p>
          </div>
          <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
            <ShieldCheck size={15} strokeWidth={2} /><span>{T('auth.eid.waiting')}</span>
          </p>
        </>
      )}

      {method === 'qr' && phase === 'waiting' && start?.device_link_url && (
        <>
          <p className="signin-card__lede" style={{ fontSize: 14, marginTop: -4 }}>{T('auth.eid.scanInstruction')}</p>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <div style={{ background: '#fff', padding: 16, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}>
              <QRCodeSVG value={start.device_link_url} size={196} level="M" includeMargin={false} />
            </div>
          </div>
          <div style={{ textAlign: 'center', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{T('auth.eid.verificationCode')}</div>
            <div className="mono" style={{ fontSize: 30, fontWeight: 700, letterSpacing: 4, color: 'var(--fg)' }}>{start.verification_code}</div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, marginBottom: 0 }}>{T('auth.eid.verificationHint')}</p>
          </div>
          <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
            <ShieldCheck size={15} strokeWidth={2} /><span>{T('auth.eid.waiting')}</span>
          </p>
        </>
      )}

      {isTerminal && (
        <button className="btn btn--eid btn--lg btn--block" type="button" onClick={retry} disabled={busy}>
          <RefreshCw size={18} strokeWidth={2} /><span>{T('auth.eid.retry')}</span>
        </button>
      )}
    </div>
  );
}

// ── И-мэйл алхам (OTP) ────────────────────────────────────────────────────────
function EmailStep({ onboardToken, email, onDone }: { onboardToken: string; email?: string; onDone: () => void }) {
  const { T } = useT();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(true);
  const [error, setError] = useState('');
  const sentRef = useRef(false);

  const send = useCallback(async () => {
    setSending(true);
    setError('');
    const res = await postJSON('/api/auth/superadmin/onboard/email/send', { onboard_token: onboardToken });
    setSending(false);
    if (!res.ok) setError(res.message || T('onboard.emailSendError'));
  }, [onboardToken, T]);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    void send();
  }, [send]);

  const verify = async () => {
    const c = code.trim();
    if (!c) { setError(T('onboard.codeRequired')); return; }
    setBusy(true); setError('');
    const res = await postJSON('/api/auth/superadmin/onboard/email/verify', { onboard_token: onboardToken, code: c });
    setBusy(false);
    if (res.ok) onDone();
    else setError(res.message || T('onboard.emailVerifyError'));
  };

  return (
    <div className="form-grid" aria-live="polite">
      <div>
        <h1 id="onboard-title">{T('onboard.emailTitle')}</h1>
        <p className="signin-card__lede" style={{ marginTop: 6, fontSize: 14 }}>
          {T('onboard.emailSub')}{email ? ` (${email})` : ''}
        </p>
      </div>
      {error && <Alert kind="danger">{error}</Alert>}
      {sending && <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>{T('onboard.emailSending')}</p>}
      <form className="field" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
        <label className="field__label" htmlFor="onboard-email-code">{T('onboard.emailCodeLabel')}</label>
        <input id="onboard-email-code" className="input mono input--lg-center" value={code}
          onChange={(e) => { setCode(e.target.value); if (error) setError(''); }}
          placeholder="000000" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus />
        <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? <Loader2 size={18} strokeWidth={2} className="spin" /> : <ShieldCheck size={18} strokeWidth={2} />}
          <span>{T('onboard.verify')}</span>
        </button>
      </form>
      <button className="btn btn--ghost btn--sm" type="button" onClick={() => void send()} disabled={sending} style={{ justifySelf: 'center' }}>
        <RefreshCw size={14} strokeWidth={2} /><span>{T('onboard.emailResend')}</span>
      </button>
    </div>
  );
}

// ── 2FA (TOTP) алхам ─────────────────────────────────────────────────────────
function TotpStep({ onboardToken, onDone }: { onboardToken: string; onDone: (codes: string[]) => void }) {
  const { T } = useT();
  const [init, setInit] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    (async () => {
      setLoading(true);
      const res = await postJSON<{ secret: string; otpauth_url: string }>('/api/auth/superadmin/onboard/totp/init', { onboard_token: onboardToken });
      setLoading(false);
      if (res.ok && res.data?.otpauth_url) setInit({ secret: res.data.secret, otpauth_url: res.data.otpauth_url });
      else setError(res.message || T('onboard.totpInitError'));
    })();
  }, [onboardToken, T]);

  const copySecret = async () => {
    if (!init) return;
    try { await navigator.clipboard.writeText(init.secret); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard байхгүй */ }
  };

  const verify = async () => {
    const c = code.trim();
    if (!c) { setError(T('onboard.codeRequired')); return; }
    setBusy(true); setError('');
    const res = await postJSON<{ recovery_codes?: string[] }>('/api/auth/superadmin/onboard/totp/verify', { onboard_token: onboardToken, code: c });
    setBusy(false);
    if (res.ok) onDone(res.data?.recovery_codes ?? []);
    else setError(res.message || T('onboard.totpVerifyError'));
  };

  return (
    <div className="form-grid" aria-live="polite">
      <div>
        <h1 id="onboard-title">{T('onboard.totpTitle')}</h1>
        <p className="signin-card__lede" style={{ marginTop: 6, fontSize: 14 }}>{T('onboard.totpSub')}</p>
      </div>
      {error && <Alert kind="danger">{error}</Alert>}
      {loading && <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>{T('auth.eid.starting')}</p>}

      {init && (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <div style={{ background: '#fff', padding: 16, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}>
              <QRCodeSVG value={init.otpauth_url} size={196} level="M" includeMargin={false} />
            </div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{T('onboard.totpSecretLabel')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
              <code className="mono" style={{ fontSize: 14, wordBreak: 'break-all' }}>{init.secret}</code>
              <button className="btn btn--ghost btn--sm" type="button" onClick={copySecret} title={T('onboard.copy')}>
                {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
              </button>
            </div>
          </div>
        </>
      )}

      <form className="field" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
        <label className="field__label" htmlFor="onboard-totp-code">{T('onboard.totpCodeLabel')}</label>
        <input id="onboard-totp-code" className="input mono input--lg-center" value={code}
          onChange={(e) => { setCode(e.target.value); if (error) setError(''); }}
          placeholder="000000" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
        <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={busy || !init} style={{ marginTop: 6 }}>
          {busy ? <Loader2 size={18} strokeWidth={2} className="spin" /> : <ShieldCheck size={18} strokeWidth={2} />}
          <span>{T('onboard.verify')}</span>
        </button>
      </form>
    </div>
  );
}

// ── Нөөц код (нэг удаа) ───────────────────────────────────────────────────────
function DoneStep({ codes }: { codes: string[] }) {
  const { T } = useT();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    try { await navigator.clipboard.writeText(codes.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no-op */ }
  };
  const download = () => {
    const blob = new Blob([codes.join('\n') + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="form-grid" aria-live="polite">
      <div>
        <h1 id="onboard-title">{T('onboard.recoveryTitle')}</h1>
        <p className="signin-card__lede" style={{ marginTop: 6, fontSize: 14 }}>{T('onboard.recoverySub')}</p>
      </div>
      <Alert kind="danger">{T('onboard.recoveryWarn')}</Alert>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {codes.map((c) => (
          <code key={c} className="mono" style={{ fontSize: 14, letterSpacing: 1 }}>{c}</code>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn--secondary" type="button" onClick={copyAll} style={{ flex: 1 }}>
          {copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={2} />}
          <span>{T('onboard.copyAll')}</span>
        </button>
        <button className="btn btn--secondary" type="button" onClick={download} style={{ flex: 1 }}>
          <Download size={16} strokeWidth={2} /><span>{T('onboard.download')}</span>
        </button>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>{T('onboard.savedCheck')}</span>
      </label>

      <button className="btn btn--primary btn--lg btn--block" type="button" disabled={!saved}
        onClick={() => window.location.assign('/admin/superadmin')}>
        <span>{T('onboard.finish')}</span>
      </button>
    </div>
  );
}

// ── Wizard ────────────────────────────────────────────────────────────────────
export default function OnboardWizard({ code, gerror }: { code?: string; gerror?: string }) {
  const { T } = useT();
  const [step, setStep] = useState<Step>('google');
  const [onboardToken, setOnboardToken] = useState('');
  const [email, setEmail] = useState<string | undefined>(undefined);
  const [recovery, setRecovery] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [exchanging, setExchanging] = useState(false);
  const exchangedRef = useRef(false);

  const googleError =
    gerror === 'google_cancelled' ? T('onboard.googleCancelled')
    : gerror === 'state_mismatch' ? T('onboard.stateMismatch')
    : gerror === 'google_disabled' ? T('onboard.googleDisabled')
    : gerror ? T('onboard.googleError')
    : '';

  // Reload/round-trip-ыг тэсвэрлэхийн тулд onboard_token-ийг sessionStorage-аас сэргээнэ.
  useEffect(() => {
    try {
      const t = sessionStorage.getItem(TOKEN_KEY);
      if (t) {
        setOnboardToken(t);
        setEmail(sessionStorage.getItem(EMAIL_KEY) || undefined);
        setStep((s) => (s === 'google' ? 'eid' : s));
      }
    } catch { /* sessionStorage хүрэхгүй */ }
  }, []);

  // Google callback-аас ирсэн code-ийг onboard_token болгож солино (нэг удаа).
  useEffect(() => {
    if (!code || exchangedRef.current || onboardToken) return;
    exchangedRef.current = true;
    setExchanging(true);
    (async () => {
      const res = await postJSON<{ onboard_token?: string; email?: string }>('/api/auth/superadmin/onboard/google', { code });
      setExchanging(false);
      // URL-аас code-ийг цэвэрлэнэ (дахин exchange хийхгүй, refresh-д аюулгүй).
      try { window.history.replaceState(null, '', '/superadmin/onboard'); } catch { /* no-op */ }
      if (res.ok && res.data?.onboard_token) {
        setOnboardToken(res.data.onboard_token);
        setEmail(res.data.email);
        try {
          sessionStorage.setItem(TOKEN_KEY, res.data.onboard_token);
          if (res.data.email) sessionStorage.setItem(EMAIL_KEY, res.data.email);
        } catch { /* no-op */ }
        setStep('eid');
      } else {
        setError(res.message || T('onboard.googleExchangeError'));
      }
    })();
  }, [code, onboardToken, T]);

  return (
    <div className="form-grid">
      <Progress current={step} />

      {error && <Alert kind="danger">{error}</Alert>}
      {exchanging && (
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          <Loader2 size={16} strokeWidth={2} className="spin" /><span>{T('onboard.googleExchanging')}</span>
        </p>
      )}

      {step === 'google' && !exchanging && <GoogleStep error={googleError} />}
      {step === 'eid' && onboardToken && <EidStep onboardToken={onboardToken} onDone={() => setStep('email')} />}
      {step === 'email' && onboardToken && <EmailStep onboardToken={onboardToken} email={email} onDone={() => setStep('totp')} />}
      {step === 'totp' && onboardToken && <TotpStep onboardToken={onboardToken} onDone={(codes) => { setRecovery(codes); try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(EMAIL_KEY); } catch { /* no-op */ } setStep('done'); }} />}
      {step === 'done' && <DoneStep codes={recovery} />}
    </div>
  );
}
