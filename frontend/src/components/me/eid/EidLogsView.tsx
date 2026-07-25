"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSignature, LogIn, ListChecks, ChevronDown, ChevronRight } from 'lucide-react';
import { useT } from '@/lib/lang';
import { formatTS } from '@/lib/format';
import { pkiGet, humanizeKey, renderVal, type PkiActItem } from '@/lib/pki';

// Иргэний eID үйл ажиллагааны (нэвтрэлт + гарын үсэг) лог. Backend
// /api/me/eid/activity (limit/offset + бодит нийт тоо counts + activity
// service-ийн нэмэлт талбарууд extra дэмждэг). Нэгдсэн тоо (tiles) + шүүлтүүр +
// олон баганат хүснэгт; мөр бүрийг задлан ирсэн БҮХ талбарыг харуулна.
type Filter = 'all' | 'AUTHENTICATION' | 'SIGNATURE';
type ActResponse = {
  sessions: PkiActItem[];
  total: number;
  counts?: { authentication: number; signature: number };
};
const PAGE = 20;
const isSign = (f: string) => f === 'SIGNATURE';

// extraStr нь activity service-ийн нэмэлт (extra) талбараас string утга уншина.
const extraStr = (extra: Record<string, unknown> | undefined, key: string): string => {
  const v = extra?.[key];
  return v === null || v === undefined || v === '' ? '—' : String(v);
};

export default function EidLogsView({ show }: { show: boolean }) {
  const { T } = useT();
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ['eid-pki-logs', limit],
    queryFn: () => pkiGet<ActResponse>(`/api/me/eid/activity?limit=${limit}&offset=0`),
    enabled: show,
  });

  if (!show) return null;
  const forbidden = q.data?.status === 403;
  const all = q.data?.data?.sessions ?? [];
  const total = q.data?.data?.total ?? all.length;
  // Бодит нийт тоо backend-ээс (counts); байхгүй бол ачаалагдсан мөрөөс тооцно.
  const counts = q.data?.data?.counts;
  const authCount = counts?.authentication ?? all.filter((a) => !isSign(a.flow)).length;
  const signCount = counts?.signature ?? all.filter((a) => isSign(a.flow)).length;
  const rows = all.filter((a) => (filter === 'all' ? true : a.flow === filter));

  const flowLabel = (f: string) => (isSign(f) ? T('eid.logs.sign') : T('eid.logs.auth'));
  // Нэвтрэлт — cobalt/цэнхэр, Гарын үсэг — ногоон; icon-оор ялгана.
  const flowColor = (f: string) => (isSign(f) ? 'var(--success, #16a34a)' : 'var(--accent, #6366f1)');
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
        <div className="pki-tile">
          <div className="pki-tile__icon"><ListChecks size={18} /></div>
          <div className="pki-tile__value">{total}</div>
          <div className="pki-tile__label">{T('eid.logs.total')}</div>
        </div>
        <div className="pki-tile">
          <div className="pki-tile__icon" style={{ color: 'var(--accent, #6366f1)' }}><LogIn size={18} /></div>
          <div className="pki-tile__value">{authCount}</div>
          <div className="pki-tile__label">{T('eid.logs.auth')}</div>
        </div>
        <div className="pki-tile pki-tile--success">
          <div className="pki-tile__icon"><FileSignature size={18} /></div>
          <div className="pki-tile__value">{signCount}</div>
          <div className="pki-tile__label">{T('eid.logs.sign')}</div>
        </div>
      </div>

      <div className="segmented segmented--tall" role="tablist" style={{ display: 'flex', marginBottom: 16 }}>
        {(['all', 'AUTHENTICATION', 'SIGNATURE'] as Filter[]).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f}
            className={`segmented__item${filter === f ? ' is-active' : ''}`} style={{ flex: 1 }}
            onClick={() => setFilter(f)}>
            <span>{f === 'all' ? T('eid.logs.all') : f === 'AUTHENTICATION' ? T('eid.logs.auth') : T('eid.logs.sign')}</span>
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }} aria-label={T('eid.logs.title')}>
        <table className="dtable">
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
              <th>{T('eid.logs.col.type')}</th>
              <th>{T('eid.logs.col.rpApp')}</th>
              <th>{T('eid.logs.col.rpName')}</th>
              <th>{T('eid.logs.col.detail')}</th>
              <th>{T('eid.logs.col.session')}</th>
              <th>{T('eid.logs.col.outcome')}</th>
              <th>{T('eid.logs.col.time')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => {
              const Icon = isSign(a.flow) ? FileSignature : LogIn;
              const color = flowColor(a.flow);
              const rowKey = a.session_id || `row-${i}`;
              const expanded = open.has(rowKey);
              // Мөрийн БҮХ талбар: танигдсан + activity service-ийн нэмэлт (extra).
              const fields: [string, unknown][] = [
                [T('eid.logs.col.type'), flowLabel(a.flow)],
                [T('eid.logs.col.detail'), a.doc_text],
                [T('eid.logs.col.session'), a.session_id],
                [T('eid.logs.col.outcome'), a.outcome],
                [T('eid.logs.col.time'), a.timestamp ? formatTS(a.timestamp) : undefined],
                ...Object.entries(a.extra ?? {}).map(([k, v]) => [humanizeKey(k), v] as [string, unknown]),
              ];
              return (
                <React.Fragment key={rowKey}>
                  <tr onClick={() => toggle(rowKey)} style={{ cursor: 'pointer' }}>
                    <td style={{ paddingRight: 0, color: 'var(--muted)' }}>
                      <button type="button" className="icon-btn" aria-label={T('eid.logs.expand')}
                        aria-expanded={expanded}
                        onClick={(e) => { e.stopPropagation(); toggle(rowKey); }}
                        style={{ background: 'none', border: 0, padding: 2, cursor: 'pointer', color: 'inherit', display: 'inline-flex' }}>
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 26, height: 26, borderRadius: 8, color,
                          background: 'color-mix(in oklab, currentColor 14%, transparent)', flexShrink: 0,
                        }}>
                          <Icon size={15} />
                        </span>
                        <span style={{ fontWeight: 500 }}>{flowLabel(a.flow)}</span>
                      </span>
                    </td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}
                      title={extraStr(a.extra, 'subsystemName')}>
                      {extraStr(a.extra, 'subsystemName')}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }} title={extraStr(a.extra, 'rpName')}>
                      {extraStr(a.extra, 'rpName')}
                    </td>
                    <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={a.doc_text || flowLabel(a.flow)}>
                      {a.doc_text || flowLabel(a.flow)}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{a.session_id ? a.session_id.slice(0, 8) : '—'}</td>
                    <td><span className={`badge badge--${a.outcome === 'OK' ? 'success' : 'warning'}`}>{a.outcome}</span></td>
                    <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{a.timestamp ? formatTS(a.timestamp) : '—'}</td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={8} style={{ background: 'var(--surface-2)', padding: '12px 16px' }}>
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
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 20 }}>{T('me.pki.none')}</td></tr>
            )}
          </tbody>
        </table>
        {all.length < total && (
          <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn--secondary btn--block" type="button"
              onClick={() => setLimit((l) => l + PAGE)} disabled={q.isFetching}>
              {q.isFetching ? T('users.loading') : T('common.next')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
