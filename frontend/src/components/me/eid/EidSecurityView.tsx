"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Smartphone, KeyRound, LogIn, Check, X } from 'lucide-react';
import { useT } from '@/lib/lang';
import { pkiGet, type PkiSummary } from '@/lib/pki';

// Иргэний eID аюулгүй байдлын тойм: тооцоолсон "оноо" + шалгах жагсаалт.
// Backend /api/me/eid/summary-ийн бодит тоонуудаас client талд гаргана
// (тохиргоо өөрчилдөггүй — зөвхөн төлөв харуулна).
export default function EidSecurityView({ show }: { show: boolean }) {
  const { T } = useT();
  const q = useQuery({ queryKey: ['eid-pki-summary'], queryFn: () => pkiGet<PkiSummary>('/api/me/eid/summary'), enabled: show });

  if (!show) return null;
  const forbidden = q.data?.status === 403;
  const s = q.data?.data ?? null;

  if (forbidden) {
    return <section className="card"><p className="muted" style={{ padding: '4px 2px' }}>{T('me.pki.pending')}</p></section>;
  }

  const checks = [
    { ok: (s?.certificates.valid ?? 0) > 0, label: T('eid.security.chkCert') },
    { ok: (s?.devices_active ?? 0) > 0, label: T('eid.security.chkDevice') },
    { ok: (s?.activity.authentication ?? 0) > 0, label: T('eid.security.chkLogin') },
    { ok: true, label: T('eid.security.chkActive') },
  ];
  const passed = checks.filter((c) => c.ok).length;
  const score = Math.round((passed / checks.length) * 100);

  return (
    <>
      <div className="pki-tiles" style={{ marginBottom: 16 }}>
        <div className={`pki-tile pki-tile--${score >= 75 ? 'success' : 'warning'}`}><div className="pki-tile__icon"><ShieldCheck size={18} /></div><div className="pki-tile__value">{s ? `${score}%` : '—'}</div><div className="pki-tile__label">{T('eid.security.score')}</div></div>
        <div className="pki-tile"><div className="pki-tile__icon"><Smartphone size={18} /></div><div className="pki-tile__value">{s?.devices_active ?? '—'}</div><div className="pki-tile__label">{T('eid.security.devices')}</div></div>
        <div className="pki-tile"><div className="pki-tile__icon"><KeyRound size={18} /></div><div className="pki-tile__value">{s?.certificates.valid ?? '—'}</div><div className="pki-tile__label">{T('eid.security.certs')}</div></div>
        <div className="pki-tile"><div className="pki-tile__icon"><LogIn size={18} /></div><div className="pki-tile__value">{s?.activity.authentication ?? '—'}</div><div className="pki-tile__label">{T('eid.security.logins')}</div></div>
      </div>

      <section className="card" aria-label={T('eid.security.title')}>
        <div className="card__head card__head--with-sub">
          <div className="card__title"><ShieldCheck size={18} strokeWidth={2} style={{ color: 'var(--dan-blue-text)' }} /><h2>{T('eid.security.checklist')}</h2></div>
          <span className="card__sub">{T('me.pki.sub')} <span className="mono">eidmongolia.mn/v3</span></span>
        </div>
        <div>
          {checks.map((c, i) => (
            <div key={i} className="defrow">
              <span className="defrow__label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 999, background: c.ok ? 'var(--success-soft)' : 'var(--surface-2)', color: c.ok ? 'var(--success)' : 'var(--muted)' }}>
                  {c.ok ? <Check size={14} strokeWidth={2.5} /> : <X size={14} strokeWidth={2.5} />}
                </span>
                {c.label}
              </span>
              <span className="defrow__value">
                <span className={`badge badge--${c.ok ? 'success' : 'warning'}`}>{c.ok ? T('eid.security.done') : T('eid.security.todo')}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
