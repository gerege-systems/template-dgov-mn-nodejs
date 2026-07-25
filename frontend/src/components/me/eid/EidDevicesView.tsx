"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Smartphone, ChevronDown, ChevronRight } from 'lucide-react';
import { useT } from '@/lib/lang';
import { formatTS } from '@/lib/format';
import { pkiGet, humanizeKey, renderVal, type PkiDeviceItem } from '@/lib/pki';

// Иргэний eID-д холбогдсон төхөөрөмжийн тусгай хуудас. Backend
// /api/me/eid/devices (бодит PKI — платформ, элсэлт, идэвх, идэвхгүйжсэн огноо +
// upstream-ийн нэмэлт талбарууд extra). Мөр бүрийг задлан ирсэн БҮХ талбарыг харуулна.
export default function EidDevicesView({ show }: { show: boolean }) {
  const { T } = useT();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const q = useQuery({
    queryKey: ['eid-pki-devices'],
    queryFn: () => pkiGet<{ devices: PkiDeviceItem[]; active_count: number; total: number }>('/api/me/eid/devices'),
    enabled: show,
  });

  if (!show) return null;
  const forbidden = q.data?.status === 403;
  const list = q.data?.data?.devices ?? [];
  const activeCount = list.filter((d) => d.active).length;
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });

  if (forbidden) {
    return <section className="card"><p className="muted" style={{ padding: '4px 2px' }}>{T('me.pki.pending')}</p></section>;
  }

  return (
    <>
      <div className="pki-tiles" style={{ marginBottom: 16 }}>
        <div className="pki-tile pki-tile--success"><div className="pki-tile__icon"><Smartphone size={18} /></div><div className="pki-tile__value">{activeCount}</div><div className="pki-tile__label">{T('me.pki.active')}</div></div>
        <div className="pki-tile"><div className="pki-tile__icon"><Smartphone size={18} /></div><div className="pki-tile__value">{list.length}</div><div className="pki-tile__label">{T('eid.devices.total')}</div></div>
      </div>

      <section className="card" aria-label={T('eid.devices.title')}>
        <div className="card__head card__head--with-sub">
          <div className="card__title"><Smartphone size={18} strokeWidth={2} style={{ color: 'var(--dan-blue-text)' }} /><h2>{T('eid.devices.title')}</h2></div>
          <span className="card__sub">{T('me.pki.sub')} <span className="mono">eidmongolia.mn/v3</span></span>
        </div>
        {list.length === 0 ? (
          <p className="muted" style={{ padding: '4px 2px' }}>{T('me.pki.none')}</p>
        ) : (
          <div className="pki-list" style={{ marginTop: 12 }}>
            {list.map((d, i) => {
              const rowKey = d.document_number || `dev-${i}`;
              const expanded = open.has(rowKey);
              const when = d.active ? d.enrolled_at : d.deactivated_at;
              // Мөрийн БҮХ талбар: танигдсан + upstream-ийн нэмэлт (extra).
              const fields: [string, unknown][] = [
                [T('eid.devices.col.device'), d.document_number],
                [T('eid.devices.col.platform'), d.platform],
                [T('eid.devices.col.status'), d.active ? T('me.pki.active') : T('me.pki.inactive')],
                [T('eid.devices.col.enrolled'), d.enrolled_at ? formatTS(d.enrolled_at) : undefined],
                [T('eid.devices.col.deactivated'), d.deactivated_at ? formatTS(d.deactivated_at) : undefined],
                ...Object.entries(d.extra ?? {}).map(([k, v]) => [humanizeKey(k), v] as [string, unknown]),
              ];
              return (
                <div key={rowKey} style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
                  <button type="button" aria-expanded={expanded} aria-label={T('eid.logs.expand')}
                    onClick={() => toggle(rowKey)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      background: 'none', border: 0, padding: '10px 12px', cursor: 'pointer', color: 'inherit',
                    }}>
                    <span style={{ color: 'var(--muted)', display: 'inline-flex', flexShrink: 0 }}>
                      {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                    <Smartphone size={15} style={{ color: d.active ? 'var(--success, #16a34a)' : 'var(--muted)', flexShrink: 0 }} />
                    <span className="mono" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.document_number.slice(0, 16)}…
                    </span>
                    {d.platform && <span className="chip chip--neutral">{d.platform}</span>}
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span className={`badge badge--${d.active ? 'success' : 'danger'}`}>{d.active ? T('me.pki.active') : T('me.pki.inactive')}</span>
                      {when && <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{formatTS(when)}</span>}
                    </span>
                  </button>
                  {expanded && (
                    <div style={{ background: 'var(--surface-2)', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 8 }}>
                        {T('eid.logs.details')}
                      </div>
                      <dl style={{
                        display: 'grid', gridTemplateColumns: 'minmax(120px, max-content) 1fr',
                        gap: '6px 16px', margin: 0, fontSize: 13,
                      }}>
                        {fields.map(([label, val], j) => (
                          <React.Fragment key={j}>
                            <dt className="muted" style={{ fontWeight: 500 }}>{label}</dt>
                            <dd className="mono" style={{ margin: 0, wordBreak: 'break-word' }}>{renderVal(String(label), val)}</dd>
                          </React.Fragment>
                        ))}
                      </dl>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
