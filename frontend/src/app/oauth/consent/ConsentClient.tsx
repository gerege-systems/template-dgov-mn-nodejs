// eID based AI enabled Government Template Platform V3.0
// Consent — dan-ий өөрийн дизайн (form-grid / signin-card / btn--*). Логик нь
// /api/provider/consent-д холбогдоно.
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getJSON, postJSON } from '@/lib/client';

type ConsentInfo = {
  ClientID: string;
  ClientName: string;
  RequestedScope: string[] | null;
  Skip: boolean;
};

function scopeHelp(s: string): string {
  switch (s) {
    case 'openid':
      return 'Таныг танихад зориулсан үндсэн ID';
    case 'profile':
      return 'Овог нэр, тохиргооны хэл';
    case 'email':
      return 'И-мэйл хаяг';
    case 'phone':
      return 'Утасны дугаар';
    case 'nationalid':
      return 'Регистрийн дугаар (нууцлалд анхаарч хандана)';
    case 'roles':
      return 'Албан тушаалын эрх';
    default:
      return '';
  }
}

export default function ConsentClient({ challenge }: { challenge: string }) {
  const [info, setInfo] = useState<ConsentInfo | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  const scopes = useMemo(() => info?.RequestedScope ?? [], [info]);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const data = await getJSON<ConsentInfo>(
          `/api/provider/consent?consent_challenge=${encodeURIComponent(challenge)}`,
        );
        if (!mounted.current) return;
        if (data.Skip) {
          await submit('accept', data.RequestedScope ?? []);
          return;
        }
        setInfo(data);
        setChecked(Object.fromEntries((data.RequestedScope ?? []).map((s) => [s, true])));
      } catch {
        if (mounted.current) setError('Consent мэдээлэл авахад алдаа гарлаа');
      }
    })();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge]);

  async function submit(action: 'accept' | 'reject', grantScope: string[]) {
    setBusy(true);
    const path = action === 'accept' ? '/api/provider/consent/accept' : '/api/provider/consent/reject';
    const r = await postJSON<{ redirect_to?: string }>(path, {
      consent_challenge: challenge,
      grant_scope: grantScope,
    });
    if (r.ok && r.data?.redirect_to) {
      window.location.href = r.data.redirect_to;
    } else {
      setError(r.ok ? 'Амжилтгүй боллоо' : r.message || 'Алдаа гарлаа');
      setBusy(false);
    }
  }

  if (!info) {
    return (
      <div className="form-grid" aria-live="polite">
        <div>
          <h1 id="consent-title">Хандах эрх</h1>
          <p className="signin-card__lede" style={{ marginTop: 6, fontSize: 14 }}>
            {error || 'Ачааллаж байна…'}
          </p>
        </div>
      </div>
    );
  }

  const grant = scopes.filter((s) => checked[s]);
  return (
    <div className="form-grid">
      <div>
        <h1 id="consent-title">{info.ClientName || info.ClientID}</h1>
        <p className="signin-card__lede" style={{ marginTop: 6, fontSize: 14 }}>
          Энэ үйлчилгээ танаас доорх мэдээлэлд хандах зөвшөөрөл хүсэж байна.
        </p>
      </div>

      {error && <div className="field__error">{error}</div>}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {scopes.map((s) => (
          <li
            key={s}
            style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px' }}
          >
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!checked[s]}
                onChange={(e) => setChecked((c) => ({ ...c, [s]: e.target.checked }))}
                style={{ marginTop: 3 }}
              />
              <span>
                <span className="mono" style={{ fontWeight: 600 }}>
                  {s}
                </span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)' }}>
                  {scopeHelp(s)}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn btn--secondary btn--lg btn--block"
          type="button"
          disabled={busy}
          onClick={() => submit('reject', [])}
        >
          Татгалзах
        </button>
        <button
          className="btn btn--primary btn--lg btn--block"
          type="button"
          disabled={busy}
          onClick={() => submit('accept', grant)}
        >
          Зөвшөөрөх
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', margin: 0 }}>
        Client ID: <span className="mono">{info.ClientID}</span>
      </p>
    </div>
  );
}
