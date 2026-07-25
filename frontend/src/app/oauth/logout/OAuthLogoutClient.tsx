// eID based AI enabled Government Template Platform V3.0
// Logout — dan-ий өөрийн дизайн. Гарах товч дарахад ЭХЛЭЭД dan-ий session-ыг
// цэвэрлээд (/api/auth/logout), дараа нь Hydra logout challenge-ыг accept хийж
// (/api/provider/logout/accept) RP руу буцна.
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { postJSON } from '@/lib/client';

export default function OAuthLogoutClient({ challenge }: { challenge: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirmLogout() {
    if (!challenge) {
      window.location.href = '/';
      return;
    }
    setBusy(true);
    await postJSON('/api/auth/logout', undefined).catch(() => {});
    const r = await postJSON<{ redirect_to?: string }>('/api/provider/logout/accept', {
      logout_challenge: challenge,
    });
    if (r.ok && r.data?.redirect_to) {
      window.location.href = r.data.redirect_to;
    } else {
      setError(r.ok ? 'Гарах амжилтгүй боллоо' : r.message || 'Алдаа гарлаа');
      setBusy(false);
    }
  }

  return (
    <div className="form-grid">
      <div>
        <h1 id="logout-title">Та үнэхээр гарах уу?</h1>
        <p className="signin-card__lede" style={{ marginTop: 6, fontSize: 14 }}>
          Энэ нь таныг sso.dgov.mn-аас гаргаж, холбогдсон үйлчилгээ рүү single-logout сигнал
          явуулна. Дахин нэвтрэхдээ eID Mongolia аппаараа дахин баталгаажуулна.
        </p>
      </div>

      {error && <div className="field__error">{error}</div>}

      <div style={{ display: 'flex', gap: 10 }}>
        <Link className="btn btn--secondary btn--lg btn--block" href="/">
          Цуцлах
        </Link>
        <button
          className="btn btn--primary btn--lg btn--block"
          type="button"
          disabled={busy}
          onClick={confirmLogout}
        >
          Тийм, гарна
        </button>
      </div>
    </div>
  );
}
