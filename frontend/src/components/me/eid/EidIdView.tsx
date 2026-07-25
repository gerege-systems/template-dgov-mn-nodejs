"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, ShieldCheck, KeyRound, Smartphone } from 'lucide-react';
import { useT } from '@/lib/lang';
import { formatTS } from '@/lib/format';
import { initialsOf } from '@/lib/format';
import { displayName, type SessionUser } from '@/lib/types';
import { pkiGet, type PkiSummary } from '@/lib/pki';

// Иргэний eID үнэмлэхний харагдац. Өгөгдөл нь нэвтэрсэн хэрэглэгчийн бичлэг
// (me.eid — civil_id/national_id/нэр/kyc) + PKI summary-ийн тоонууд. Шинэ
// backend endpoint шаардлагагүй.
export default function EidIdView({ me }: { me: SessionUser }) {
  const { T, lang } = useT();
  const eid = me.eid;
  // Локал eID linkage (me.eid) эсвэл SSO eID proxy идэвхтэй бол харуулна. Proxy
  // хэрэглэгчид civil_id/national_id/kyc локалд байхгүй тул тэдгээрийг нөхцөлтэй
  // харуулж, нэр/PKI тоог summary-аас авна.
  const canView = !!eid || !!me.eidProxy;
  const q = useQuery({ queryKey: ['eid-pki-summary'], queryFn: () => pkiGet<PkiSummary>('/api/me/eid/summary'), enabled: canView });
  const s = q.data?.data ?? null;

  if (!canView) {
    return <section className="card"><p className="muted" style={{ padding: '4px 2px' }}>{T('eid.id.notEid')}</p></section>;
  }

  return (
    <>
      {/* Hero — үнэмлэхний нүүр */}
      <section className="card" aria-label={T('eid.id.title')}>
        <div className="profile-card">
          <div className="profile-card__avatar" aria-hidden="true">{initialsOf(me.fullName || me.username)}</div>
          <div className="profile-card__body">
            <div className="profile-card__name">
              <span className="profile-card__name-text">{displayName(me, lang)}</span>
              <span className="badge badge--success">{T('eid.id.verified')}</span>
            </div>
            <div className="profile-card__sub">
              {eid?.nationalId && <><span className="mono">{eid.nationalId}</span><span className="dot" /></>}
              {eid?.civilId && <span>Civil ID: <span className="mono">{eid.civilId}</span></span>}
            </div>
          </div>
          <div className="profile-card__action">
            <CreditCard size={40} strokeWidth={1.4} style={{ color: 'var(--dan-blue)' }} />
          </div>
        </div>
      </section>

      {/* Нэр (MN/EN) */}
      <section className="card" aria-label={T('eid.id.nameCard')} style={{ marginTop: 16 }}>
        <div className="card__head"><div className="card__title"><h2>{T('eid.id.nameCard')}</h2></div></div>
        <div>
          <div className="defrow"><span className="defrow__label">{T('eid.id.lastName')}</span><span className="defrow__value">{me.lastName || '—'}</span></div>
          <div className="defrow"><span className="defrow__label">{T('eid.id.firstName')}</span><span className="defrow__value">{me.firstName || '—'}</span></div>
          <div className="defrow"><span className="defrow__label">{T('eid.id.lastNameEn')}</span><span className="defrow__value mono">{me.lastNameEn || '—'}</span></div>
          <div className="defrow"><span className="defrow__label">{T('eid.id.firstNameEn')}</span><span className="defrow__value mono">{me.firstNameEn || '—'}</span></div>
        </div>
      </section>

      {/* Баталгаажуулалт */}
      <section className="card" aria-label={T('eid.id.verifyCard')} style={{ marginTop: 16 }}>
        <div className="card__head card__head--with-sub">
          <div className="card__title"><ShieldCheck size={18} strokeWidth={2} style={{ color: 'var(--dan-blue-text)' }} /><h2>{T('eid.id.verifyCard')}</h2></div>
          <span className="card__sub"><span className="mono">eidmongolia.mn/v3</span></span>
        </div>
        <div>
          {eid?.kycLevel && <div className="defrow"><span className="defrow__label">{T('eid.id.kyc')}</span><span className="defrow__value"><span className="chip chip--neutral">{eid.kycLevel}</span></span></div>}
          {eid?.documentNumber && <div className="defrow"><span className="defrow__label">{T('eid.id.docNumber')}</span><span className="defrow__value mono">{eid.documentNumber.slice(0, 20)}…</span></div>}
          <div className="defrow"><span className="defrow__label"><KeyRound size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />{T('eid.id.certs')}</span><span className="defrow__value">{s ? `${s.certificates.valid}/${s.certificates.total}` : '—'}</span></div>
          <div className="defrow"><span className="defrow__label"><Smartphone size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />{T('eid.id.devices')}</span><span className="defrow__value">{s ? `${s.devices_active}/${s.devices_total}` : '—'}</span></div>
          <div className="defrow"><span className="defrow__label">{T('eid.id.created')}</span><span className="defrow__value mono">{formatTS(me.createdAt)}</span></div>
        </div>
      </section>
    </>
  );
}
