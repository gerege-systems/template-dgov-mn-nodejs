"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, RefreshCw, HelpCircle } from 'lucide-react';
import Alert from '@/components/Alert';
import MFAChallenge from '@/components/superadmin/MFAChallenge';
import { postJSON } from '@/lib/client';
import { safeNext } from '@/lib/navigation';
import { useT } from '@/lib/lang';

// Нэвтрэх арга: (A) РД-ээр — иргэний апп руу push, зөвшөөрөхөд browser нэвтэрнэ (CROSS-DEVICE).
// (B) device-link — DESKTOP дээр QR (CROSS-DEVICE, тусдаа утсаар уншуулна, browser poll хийнэ);
// MOBILE browser дээр SAME-DEVICE (App2App): eID app-ийг deep-link-ээр нээж, утас approve хийсний
// дараа browser-ийг /auth/eid/callback руу буцаана. Same-device үед л callbackUrl дамжуулна;
// cross-device (desktop/push) үед callbackUrl хоосон — browser өөрөө session poll хийж нэвтэрнэ.

// isMobileBrowser — утас=browser нэг төхөөрөмж (same-device App2App боломжтой) эсэх.
function isMobileBrowser(): boolean {
  return typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// sameDeviceCallbackUrl — платформ стандарт буцах зам <origin>/auth/eid/callback. iOS дээрх custom
// browser (Chrome/Edge)-ыг зөв буцаах retScheme query-г нэмнэ (eID app https-ийг тэр browser-аар нээнэ).
function sameDeviceCallbackUrl(): string {
  const ua = navigator.userAgent;
  let retScheme = '';
  if (/CriOS/i.test(ua)) retScheme = 'googlechromes'; // Chrome on iOS
  else if (/EdgiOS/i.test(ua)) retScheme = 'microsoft-edge-https'; // Edge on iOS
  return window.location.origin + '/auth/eid/callback' + (retScheme ? '?retScheme=' + retScheme : '');
}

interface StartData {
  session_id: string;
  device_link_url?: string; // зөвхөн QR арга буцаана
  verification_code: string;
  expires_at: string;
}

type Method = 'id' | 'qr';
type Phase = 'idle' | 'starting' | 'waiting' | 'expired' | 'refused' | 'error' | 'success';

const POLL_INTERVAL_MS = 2500;

export default function LoginForm({ next, notice, googleLink, googleError, mfaGate }: { next: string; notice?: string; googleLink?: boolean; googleError?: boolean; mfaGate?: boolean }) {
  const { T } = useT();

  const [method, setMethod] = useState<Method>('id');
  const [phase, setPhase] = useState<Phase>('idle');
  const [start, setStart] = useState<StartData | null>(null);
  const [nationalId, setNationalId] = useState('');
  const [idError, setIdError] = useState('');
  // MFA-той superadmin — eID poll эсвэл Google callback дараа 2 дахь хүчин зүйл
  // шаардвал энэ challenge-ийг харуулна. mfaToken байвал eID poll урсгал (клиент
  // token эзэмшинэ); null бол Google callback (sa_mfa cookie ашиглана).
  const [mfa, setMfa] = useState<{ token?: string } | null>(mfaGate ? {} : null);

  // unmount хийсний дараа интервалд timer-уудыг цэвэрлэхэд ашиглана.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  // Сүүлд эхлүүлсэн арга — terminal төлөвт retry хийхэд ашиглана.
  const lastMethod = useRef<Method>('id');

  const noticeText =
    notice === 'verified' ? 'Бүртгэл баталгаажлаа. Одоо нэвтэрнэ үү.'
    : notice === 'registered' ? 'Бүртгэл үүслээ.'
    : notice === 'reset' ? 'Нууц үг шинэчлэгдлээ.'
    : notice === 'expired' ? 'Таны сесси дууссан тул дахин нэвтэрнэ үү.'
    : '';
  // Сесси дуусах нь мэдээллийн (амжилтын биш) шинжтэй тул info өнгө.
  const noticeKind = notice === 'expired' ? 'info' : 'success';

  const stopTimers = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    if (expiryTimer.current) {
      clearTimeout(expiryTimer.current);
      expiryTimer.current = null;
    }
  }, []);

  const poll = useCallback(
    async (sessionId: string) => {
      const res = await postJSON<{ state?: string; mfa_required?: boolean; mfa_token?: string }>('/api/auth/eid/poll', { session_id: sessionId });
      if (!mounted.current) return;

      if (!res.ok) {
        // Сүлжээ/түр зуурын алдаа — дараагийн интервалд дахин оролдоно.
        return;
      }

      // MFA-той superadmin — session-ий оронд mfa_token ирнэ. Poll-ыг зогсоож,
      // TOTP/recovery challenge руу шилжинэ (mfa_token-ийг challenge-д дамжуулна).
      if (res.data?.mfa_required && res.data?.mfa_token) {
        stopTimers();
        setPhase('success');
        setMfa({ token: res.data.mfa_token });
        return;
      }

      const state = res.data?.state;
      if (state === 'COMPLETE') {
        stopTimers();
        setPhase('success');
        // Бүтэн хуудас шилжилт — router.push+refresh нь энд race болж, шинэ
        // session cookie-той хуудас руу заримдаа шилжихгүй "Шилжиж байна…"
        // дээр гацдаг. Hard redirect нь session-ийг найдвартай ачаална.
        window.location.assign(safeNext(next));
        return;
      }
      if (state === 'EXPIRED') {
        stopTimers();
        setPhase('expired');
        return;
      }
      if (state === 'REFUSED') {
        stopTimers();
        setPhase('refused');
        return;
      }
      // RUNNING — үргэлжлүүлэн хүлээнэ.
    },
    [next, stopTimers],
  );

  // start өгөгдөл хүлээн авсны дараа poll болон expiry timer-уудыг тохируулна.
  const armSession = useCallback(
    (data: StartData) => {
      setStart(data);
      setPhase('waiting');

      // ~2.5 секунд тутамд төлвийг шалгана.
      pollTimer.current = setInterval(() => {
        void poll(data.session_id);
      }, POLL_INTERVAL_MS);

      // expires_at-ийн дараа автоматаар зогсоож, хугацаа дууссан гэж тэмдэглэнэ.
      const expiresMs = new Date(data.expires_at).getTime() - Date.now();
      if (Number.isFinite(expiresMs) && expiresMs > 0) {
        expiryTimer.current = setTimeout(() => {
          if (!mounted.current) return;
          stopTimers();
          setPhase((p) => (p === 'waiting' ? 'expired' : p));
        }, expiresMs);
      }
    },
    [poll, stopTimers],
  );

  // device-link арга. MOBILE (same-device): callbackUrl дамжуулж, eID app-ийг deep-link-ээр нээнэ —
  // утас approve хийгээд browser-ийг /auth/eid/callback руу буцаана (тэнд poll хийж дуусна).
  // DESKTOP (cross-device): callbackUrl хоосон, QR харагдана, эх browser өөрөө poll хийж нэвтэрнэ.
  const beginQr = useCallback(async () => {
    stopTimers();
    setStart(null);
    setIdError('');
    lastMethod.current = 'qr';
    setPhase('starting');

    const mobile = isMobileBrowser();
    const callbackUrl = mobile ? sameDeviceCallbackUrl() : '';
    const res = await postJSON<StartData>('/api/auth/eid/start', { callbackUrl });
    if (!mounted.current) return;

    if (!res.ok || !res.data?.session_id) {
      setPhase('error');
      return;
    }
    armSession(res.data);

    // SAME-DEVICE: eID app-ийг deep-link-ээр шууд нээнэ (утас approve хийгээд callback руу буцна).
    if (mobile) {
      window.location.href = 'geregesmartid://approve?sessionId=' + encodeURIComponent(res.data.session_id);
    }
  }, [armSession, stopTimers]);

  // РД арга — backend иргэний апп руу push мэдэгдэл илгээнэ (device_link_url алга).
  const beginId = useCallback(async () => {
    const rd = nationalId.trim();
    if (!rd) {
      setIdError(T('auth.eid.nationalIdRequired'));
      return;
    }

    stopTimers();
    setStart(null);
    setIdError('');
    lastMethod.current = 'id';
    setPhase('starting');

    // SAME-DEVICE (утасны browser): callbackUrl дамжуулна — push ижил утас руу ирж, approve хийсний
    // дараа eID app browser-ийг /auth/eid/callback руу буцаана. DESKTOP: callbackUrl хоосон, browser poll.
    const mobile = isMobileBrowser();
    const callbackUrl = mobile ? sameDeviceCallbackUrl() : '';
    const res = await postJSON<StartData>('/api/auth/eid/start-id', { national_id: rd, callbackUrl });
    if (!mounted.current) return;

    if (!res.ok || !res.data?.session_id) {
      setPhase('error');
      return;
    }
    armSession(res.data);
  }, [armSession, nationalId, stopTimers, T]);

  // Terminal төлөвт сүүлд хэрэглэсэн аргаар дахин эхлүүлнэ.
  const retry = useCallback(() => {
    if (lastMethod.current === 'qr') void beginQr();
    else void beginId();
  }, [beginQr, beginId]);

  // Арга солих — идэвхтэй session-ыг зогсоож, цэвэр idle төлөвт оруулна.
  const switchMethod = useCallback(
    (m: Method) => {
      if (m === method) return;
      stopTimers();
      setStart(null);
      setIdError('');
      setPhase('idle');
      setMethod(m);
      // QR аргыг сонгомогц шууд эхлүүлнэ; РД нь дугаар оруулахыг шаардана.
      if (m === 'qr') void beginQr();
    },
    [method, stopTimers, beginQr],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopTimers();
    };
  }, [stopTimers]);

  const isTerminal = phase === 'expired' || phase === 'refused' || phase === 'error';
  const busy = phase === 'starting' || phase === 'waiting';

  // MFA gate идэвхжсэн бол зөвхөн 2 дахь хүчин зүйлийн challenge-ийг харуулна.
  if (mfa) return <MFAChallenge mfaToken={mfa.token} next={next} />;

  return (
    <div className="form-grid" aria-live="polite">
      <div>
        <h1 id="login-title">{googleLink ? T('auth.google.linkTitle') : T('auth.eid.cardTitle')}</h1>
        <p className="signin-card__lede" style={{ marginTop: 6, fontSize: 14 }}>
          {googleLink ? T('auth.google.linkSub') : T('auth.eid.cardSub')}
        </p>
      </div>

      {noticeText && <Alert kind={noticeKind}>{noticeText}</Alert>}

      {/* Google эхний удаа — eID-ээр баталгаажуулах анхааруулгыг дээр тод харуулна */}
      {googleLink && <Alert kind="info">{T('auth.google.linkNotice')}</Alert>}
      {googleError && <Alert kind="danger">{T('auth.google.error')}</Alert>}

      {/* Нэвтрэх аргын сонголт */}
      <div className="segmented segmented--tall" role="tablist" style={{ display: 'flex', width: '100%' }}>
        <button
          type="button"
          role="tab"
          aria-selected={method === 'id'}
          className={`segmented__item${method === 'id' ? ' is-active' : ''}`}
          style={{ flex: 1 }}
          onClick={() => switchMethod('id')}
        >
          <span>{T('auth.eid.methodId')}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={method === 'qr'}
          className={`segmented__item${method === 'qr' ? ' is-active' : ''}`}
          style={{ flex: 1 }}
          onClick={() => switchMethod('qr')}
        >
          <span>{T('auth.eid.methodQr')}</span>
        </button>
      </div>

      {phase === 'error' && <Alert kind="danger">{T('auth.eid.startError')}</Alert>}
      {phase === 'expired' && <Alert kind="info">{T('auth.eid.expired')}</Alert>}
      {phase === 'refused' && <Alert kind="danger">{T('auth.eid.refused')}</Alert>}
      {phase === 'success' && <Alert kind="success">{T('auth.eid.success')}</Alert>}

      {phase === 'starting' && (
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          {T('auth.eid.starting')}
        </p>
      )}

      {/* РД арга — дугаар оруулах форм (хүлээх төлөвт орох хүртэл) */}
      {method === 'id' && phase !== 'waiting' && phase !== 'starting' && (
        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault();
            void beginId();
          }}
        >
          <p className="login-instruction">{T('auth.eid.idInstruction')}</p>
          <label className="field__label" htmlFor="eid-national-id">
            {T('auth.eid.nationalIdLabel')}
          </label>
          <input
            id="eid-national-id"
            className="input mono input--lg-center"
            value={nationalId}
            onChange={(e) => {
              setNationalId(e.target.value);
              if (idError) setIdError('');
            }}
            placeholder={T('auth.eid.nationalIdPlaceholder')}
            aria-invalid={idError ? 'true' : undefined}
            autoComplete="off"
            autoFocus
          />
          {idError && <span className="field__error">{idError}</span>}
          <button className="btn btn--eid btn--lg btn--block" type="submit" style={{ marginTop: 6 }}>
            <span>{T('auth.eid.submit')}</span>
          </button>
        </form>
      )}

      {/* РД арга — push илгээсэн хүлээх төлөв */}
      {method === 'id' && phase === 'waiting' && start && (
        <>
          <p className="signin-card__lede" style={{ fontSize: 14, marginTop: -4 }}>
            {T('auth.eid.pushSent')}
          </p>

          <div
            style={{
              textAlign: 'center',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '12px 16px',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
              {T('auth.eid.verificationCode')}
            </div>
            <div
              className="mono"
              style={{ fontSize: 30, fontWeight: 700, letterSpacing: 4, color: 'var(--fg)' }}
            >
              {start.verification_code}
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, marginBottom: 0 }}>
              {T('auth.eid.pushHint')}
            </p>
          </div>

          <p
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'var(--muted)',
              fontSize: 13,
              marginBottom: 0,
            }}
          >
            <ShieldCheck size={15} strokeWidth={2} />
            <span>{T('auth.eid.waiting')}</span>
          </p>
        </>
      )}

      {/* QR арга — QR код + баталгаажуулах код (хүлээх төлөв) */}
      {method === 'qr' && phase === 'waiting' && start?.device_link_url && (
        <>
          <p className="signin-card__lede" style={{ fontSize: 14, marginTop: -4 }}>
            {T('auth.eid.scanInstruction')}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <div
              style={{
                background: '#fff',
                padding: 16,
                borderRadius: 12,
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              }}
            >
              <QRCodeSVG value={start.device_link_url} size={196} level="M" includeMargin={false} />
            </div>
          </div>

          <div
            style={{
              textAlign: 'center',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '12px 16px',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
              {T('auth.eid.verificationCode')}
            </div>
            <div
              className="mono"
              style={{ fontSize: 30, fontWeight: 700, letterSpacing: 4, color: 'var(--fg)' }}
            >
              {start.verification_code}
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, marginBottom: 0 }}>
              {T('auth.eid.verificationHint')}
            </p>
          </div>

          <p
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'var(--muted)',
              fontSize: 13,
              marginBottom: 0,
            }}
          >
            <ShieldCheck size={15} strokeWidth={2} />
            <span>{T('auth.eid.waiting')}</span>
          </p>
        </>
      )}

      {isTerminal && (
        <button
          className="btn btn--eid btn--lg btn--block"
          type="button"
          onClick={retry}
          disabled={busy}
        >
          <RefreshCw size={18} strokeWidth={2} />
          <span>{T('auth.eid.retry')}</span>
        </button>
      )}

      {/* Google-ээр нэвтрэх — эхний удаа eID-ээр холбоно. glink горимд (эхний удаа
          Google-ээс буцаж ирсэн) энэ товчийг НУУНА: хэрэглэгч одоо eID-ээр
          баталгаажуулах ёстой тул дахин Google руу оруулах нь ойлгомжгүй болно. */}
      {!googleLink && (
        <>
          <div className="login-or"><span>{T('auth.eid.or')}</span></div>

          <a
            className="btn btn--google btn--lg btn--block"
            href={`/api/auth/google/start${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
          >
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.2 13.3 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-17z"/><path fill="#FBBC05" d="M10.4 28.3a14.5 14.5 0 0 1 0-8.6l-7.8-6.1a24 24 0 0 0 0 20.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.6 2.2-8.8 2.2-6.4 0-11.8-3.8-13.6-9.3l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
            <span>{T('auth.google.button')}</span>
          </a>
        </>
      )}

      {/* Footer — шинэ бүртгэл + тусламж (eID app-д бүртгүүлнэ) */}
      <div className="login-footer">
        <hr className="login-footer__divider" />
        <a className="login-footer__register" href="https://eidmongolia.mn" target="_blank" rel="noopener noreferrer">
          {T('auth.eid.register')}
        </a>
        <a className="login-footer__help" href="mailto:support@eidmongolia.mn">
          <HelpCircle size={14} strokeWidth={2} />
          <span>{T('auth.eid.help')}</span>
        </a>
      </div>
    </div>
  );
}
