"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, KeyRound } from 'lucide-react';
import { useT } from '@/lib/lang';
import { formatTS } from '@/lib/format';
import { pkiGet, type PkiCertItem } from '@/lib/pki';

// Иргэний eID гэрчилгээний тусгай хуудас: нэгдсэн тоо (tiles) + шүүлтүүр (бүгд/
// идэвхтэй/идэвхгүй) + бүрэн хүснэгт. Backend /api/me/eid/certificates (бодит PKI).
type Filter = 'all' | 'active' | 'inactive';

export default function EidCertificatesView({ show }: { show: boolean }) {
  const { T } = useT();
  const [filter, setFilter] = useState<Filter>('all');
  const q = useQuery({
    queryKey: ['eid-pki-certs'],
    queryFn: () => pkiGet<{ certificates: PkiCertItem[] }>('/api/me/eid/certificates'),
    enabled: show,
  });

  if (!show) return null;

  const forbidden = q.data?.status === 403;
  const all = q.data?.data?.certificates ?? [];
  const isActive = (c: PkiCertItem) => c.status === 'VALID';
  const active = all.filter(isActive).length;
  const inactive = all.length - active;
  const rows = all.filter((c) => (filter === 'all' ? true : filter === 'active' ? isActive(c) : !isActive(c)));
  const tone = (st: string) => (st === 'VALID' ? 'success' : st === 'REVOKED' ? 'danger' : 'warning');

  if (forbidden) {
    return (
      <section className="card" aria-label={T('eid.certs.title')}>
        <p className="muted" style={{ padding: '4px 2px' }}>{T('me.pki.pending')}</p>
      </section>
    );
  }

  return (
    <>
      <div className="pki-tiles" style={{ marginBottom: 16 }}>
        <div className="pki-tile"><div className="pki-tile__icon"><KeyRound size={18} /></div><div className="pki-tile__value">{all.length}</div><div className="pki-tile__label">{T('eid.certs.total')}</div></div>
        <div className="pki-tile pki-tile--success"><div className="pki-tile__icon"><ShieldCheck size={18} /></div><div className="pki-tile__value">{active}</div><div className="pki-tile__label">{T('eid.certs.active')}</div></div>
        <div className="pki-tile"><div className="pki-tile__icon"><ShieldCheck size={18} /></div><div className="pki-tile__value">{inactive}</div><div className="pki-tile__label">{T('eid.certs.inactive')}</div></div>
      </div>

      <div className="segmented segmented--tall" role="tablist" style={{ display: 'flex', marginBottom: 16 }}>
        {(['all', 'active', 'inactive'] as Filter[]).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f}
            className={`segmented__item${filter === f ? ' is-active' : ''}`} style={{ flex: 1 }}
            onClick={() => setFilter(f)}>
            <span>{f === 'all' ? T('eid.certs.all') : f === 'active' ? T('eid.certs.active') : T('eid.certs.inactive')}</span>
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="dtable">
          <thead>
            <tr>
              <th>{T('eid.certs.col.type')}</th>
              <th>{T('eid.certs.col.serial')}</th>
              <th>{T('eid.certs.col.level')}</th>
              <th>{T('eid.certs.col.valid')}</th>
              <th>{T('eid.certs.col.issuer')}</th>
              <th>{T('eid.certs.col.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.document_number + c.serial_number}>
                <td>{c.type}</td>
                <td className="mono">{c.serial_number.slice(0, 18)}…</td>
                <td><span className="chip chip--neutral">{c.certificate_level}</span></td>
                <td className="mono" style={{ fontSize: 12 }}>
                  {c.not_before ? formatTS(c.not_before) : '—'} → {c.not_after ? formatTS(c.not_after) : '—'}
                </td>
                <td style={{ fontSize: 12 }}>{c.issuer_dn || '—'}</td>
                <td><span className={`badge badge--${tone(c.status)}`}>{c.status}</span></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 20 }}>{T('me.pki.none')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
