"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, LogIn, FileSignature, Smartphone, Building2 } from 'lucide-react';
import { useT } from '@/lib/lang';
import { pkiGet, type PkiSummary } from '@/lib/pki';

function Tile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className={`pki-tile${tone ? ` pki-tile--${tone}` : ''}`}>
      <div className="pki-tile__icon" aria-hidden="true">{icon}</div>
      <div className="pki-tile__value">{value}</div>
      <div className="pki-tile__label">{label}</div>
    </div>
  );
}

/**
 * EidSummaryCard нь Профайл хуудсанд иргэний eID PKI-ийн нэгдсэн
 * тоог tile-аар харуулна: хүчинтэй/нийт гэрчилгээ, нэвтрэлт/гарын үсгийн тоо,
 * идэвхтэй/нийт төхөөрөмж, төлөөлдөг байгууллагын тоо. PKI_READ эрхгүй (403)
 * бол тайлбар мессеж; eID хэрэглэгч биш бол огт render хийхгүй.
 */
export default function EidSummaryCard({ show }: { show: boolean }) {
  const { T } = useT();
  const q = useQuery({
    queryKey: ['eid-pki-summary'],
    queryFn: () => pkiGet<PkiSummary>('/api/me/eid/summary'),
    enabled: show,
  });

  if (!show) return null;

  const forbidden = q.data?.status === 403;
  const s = q.data?.data ?? null;

  return (
    <section className="card" aria-label={T('me.pki.title')} style={{ marginTop: 16 }}>
      <div className="card__head card__head--with-sub">
        <div className="card__title"><h2>{T('me.pki.title')}</h2></div>
        <span className="card__sub">{T('me.pki.sub')} <span className="mono">eidmongolia.mn/v3</span></span>
      </div>

      {forbidden ? (
        <p className="muted" style={{ padding: '4px 2px' }}>{T('me.pki.pending')}</p>
      ) : (
        <div className="pki-tiles">
          <Tile icon={<KeyRound size={18} />} label={T('me.pki.certsValid')} value={s ? `${s.certificates.valid}/${s.certificates.total}` : '—'} tone="success" />
          <Tile icon={<LogIn size={18} />} label={T('me.pki.auth')} value={s?.activity.authentication ?? '—'} />
          <Tile icon={<FileSignature size={18} />} label={T('me.pki.sign')} value={s?.activity.signature ?? '—'} />
          <Tile icon={<Smartphone size={18} />} label={T('me.pki.devices')} value={s ? `${s.devices_active}/${s.devices_total}` : '—'} />
          <Tile icon={<Building2 size={18} />} label={T('me.pki.orgsCount')} value={s?.representation_count ?? '—'} />
        </div>
      )}
    </section>
  );
}
