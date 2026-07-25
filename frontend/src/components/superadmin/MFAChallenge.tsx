// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

"use client";

import React, { useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import Alert from '@/components/Alert';
import { postJSON } from '@/lib/client';
import { safeNext } from '@/lib/navigation';
import { useT } from '@/lib/lang';

// MFA-той superadmin нэвтрэлтийн 2 дахь хүчин зүйл. code = TOTP (6 орон) эсвэл
// нөөц (recovery) код. mfaToken байвал body-д дамжуулна (eID poll урсгал);
// байхгүй бол BFF нь sa_mfa cookie-оос уншина (Google callback урсгал).
export default function MFAChallenge({ mfaToken, next }: { mfaToken?: string; next: string }) {
  const { T } = useT();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const c = code.trim();
    if (!c) {
      setError(T('mfa.codeRequired'));
      return;
    }
    setBusy(true);
    setError('');
    const res = await postJSON('/api/auth/superadmin/mfa', {
      ...(mfaToken ? { mfa_token: mfaToken } : {}),
      code: c,
    });
    if (res.ok) {
      // Session cookie суусан — бүтэн хуудас шилжилтээр найдвартай ачаална.
      window.location.assign(safeNext(next));
      return;
    }
    setBusy(false);
    setError(res.message || T('mfa.invalid'));
  };

  return (
    <div className="form-grid" aria-live="polite">
      <div>
        <h1 id="login-title">{T('mfa.title')}</h1>
        <p className="signin-card__lede" style={{ marginTop: 6, fontSize: 14 }}>
          {T('mfa.sub')}
        </p>
      </div>

      {error && <Alert kind="danger">{error}</Alert>}

      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="field__label" htmlFor="mfa-code">
          {T('mfa.codeLabel')}
        </label>
        <input
          id="mfa-code"
          className="input mono input--lg-center"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (error) setError('');
          }}
          placeholder="000000"
          inputMode="text"
          autoComplete="one-time-code"
          autoFocus
        />
        <p className="login-instruction" style={{ marginTop: 6 }}>{T('mfa.recoveryHint')}</p>
        <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? <Loader2 size={18} strokeWidth={2} className="spin" /> : <ShieldCheck size={18} strokeWidth={2} />}
          <span>{T('mfa.verify')}</span>
        </button>
      </form>
    </div>
  );
}
