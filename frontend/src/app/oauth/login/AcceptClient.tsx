// eID based AI enabled Government Template Platform V3.0
// Нэвтэрсэн сесстэй иргэн /oauth/login руу ирэхэд (eID/Google-ийн дараа буцаж
// ирсэн, эсвэл өмнөх session) Hydra login challenge-ыг шууд accept хийж RP руу
// буцна.
'use client';

import { useEffect, useState } from 'react';
import { postJSON } from '@/lib/client';

export default function AcceptClient({ challenge }: { challenge: string }) {
  const [error, setError] = useState('');

  useEffect(() => {
    let done = false;
    (async () => {
      const r = await postJSON<{ redirect_to?: string }>('/api/provider/login/accept', {
        login_challenge: challenge,
      });
      if (done) return;
      if (r.ok && r.data?.redirect_to) window.location.href = r.data.redirect_to;
      else setError(r.ok ? 'Нэвтрэлт амжилтгүй боллоо' : r.message || 'Алдаа гарлаа');
    })();
    return () => {
      done = true;
    };
  }, [challenge]);

  return (
    <div className="form-grid" aria-live="polite">
      <div>
        <h1 id="login-title">Нэвтрэх</h1>
        <p className="signin-card__lede" style={{ marginTop: 6, fontSize: 14 }}>
          {error || 'Нэвтрэлтийг баталгаажуулж байна…'}
        </p>
      </div>
    </div>
  );
}
