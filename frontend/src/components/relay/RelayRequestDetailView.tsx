"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ArrowLeft, Building2, Clock, ArrowUp } from 'lucide-react';
import { getJSON, postJSON } from '@/lib/client';
import { useT } from '@/lib/lang';
import { formatTS } from '@/lib/format';
import type { RelayRequestDetail, RelayAssignment, RelayPlatform } from '@/lib/relayTypes';

const POLL_MS = 5000;

function tone(s: string): string {
  if (s === 'done' || s === 'fulfilled') return 'var(--success,#16a34a)';
  if (s === 'overdue' || s === 'rejected') return 'var(--danger,#dc2626)';
  if (s === 'in_progress' || s === 'dispatched' || s === 'acknowledged') return 'var(--dan-blue,#2563eb)';
  return 'var(--muted,#888)';
}

function AssignmentRow({ a }: { a: RelayAssignment }) {
  const { T } = useT();
  return (
    <div className="defrow">
      <span className="defrow__label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Building2 size={15} />{a.platform_name}
      </span>
      <span className="defrow__value" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {a.reminders_sent > 0 && <span className="chip chip--neutral" title={T('relay.reminders')}>🔔 {a.reminders_sent}</span>}
        {a.escalated && <span className="chip" style={{ color: 'var(--danger,#dc2626)' }}>{T('relay.escalated')}</span>}
        <span className="muted mono" style={{ fontSize: 12 }}><Clock size={12} /> {formatTS(a.due_at)}</span>
        <span className="chip" style={{ color: tone(a.status), borderColor: 'currentColor' }}>{a.status}</span>
      </span>
    </div>
  );
}

export default function RelayRequestDetailView({ id }: { id: string }) {
  const { T } = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['relay-req', id], queryFn: () => getJSON<RelayRequestDetail>(`/api/relay/requests/${id}`), refetchInterval: POLL_MS });
  const platforms = useQuery({ queryKey: ['relay-platforms'], queryFn: () => getJSON<RelayPlatform[]>('/api/relay/platforms') });
  const [upTo, setUpTo] = useState('');
  const [fwErr, setFwErr] = useState('');
  const [fwBusy, setFwBusy] = useState(false);

  const forwardUp = async () => {
    if (!upTo) return;
    setFwErr(''); setFwBusy(true);
    const res = await postJSON(`/api/relay/requests/${id}/forward`, { platform_code: upTo });
    setFwBusy(false);
    if (!res.ok) { setFwErr(res.message || 'error'); return; }
    setUpTo('');
    qc.invalidateQueries({ queryKey: ['relay-req', id] });
  };

  if (q.isPending) return <div className="card"><Loader2 className="spin" size={18} /> {T('relay.loading')}</div>;
  if (q.isError) return <div className="alert alert--danger" role="alert">{(q.error as Error).message}</div>;
  const { request: r, assignments, events } = q.data!;
  const upstreams = (platforms.data ?? []).filter((p) => p.direction === 'upstream');

  return (
    <>
      <Link href="/admin/relay" className="btn btn--ghost" style={{ marginBottom: 12, display: 'inline-flex', gap: 6 }}>
        <ArrowLeft size={15} /> {T('relay.back')}
      </Link>

      <section className="card">
        <div className="card__head"><div className="card__title"><h2>{r.title || r.service_code}</h2></div>
          <span className="chip" style={{ color: tone(r.status), borderColor: 'currentColor' }}>{r.status}</span>
        </div>
        <div>
          <div className="defrow"><span className="defrow__label">{T('relay.field.source')}</span><span className="defrow__value">{r.source_platform || '—'}</span></div>
          <div className="defrow"><span className="defrow__label">{T('relay.field.ref')}</span><span className="defrow__value mono">{r.external_ref || '—'}</span></div>
          <div className="defrow"><span className="defrow__label">{T('relay.field.service')}</span><span className="defrow__value mono">{r.service_code}</span></div>
          <div className="defrow"><span className="defrow__label">{T('relay.field.received')}</span><span className="defrow__value mono">{formatTS(r.received_at)}</span></div>
          <div className="defrow"><span className="defrow__label">{T('relay.field.due')}</span><span className="defrow__value mono">{formatTS(r.due_at)}</span></div>
          {r.fulfilled_at && <div className="defrow"><span className="defrow__label">{T('relay.field.fulfilled')}</span><span className="defrow__value mono">{formatTS(r.fulfilled_at)}</span></div>}
          {r.breach_notified && <div className="defrow"><span className="defrow__label">{T('relay.field.breach')}</span><span className="defrow__value" style={{ color: 'var(--danger,#dc2626)' }}>{T('relay.breachYes')}</span></div>}
        </div>

        {/* Дээд platform руу дамжуулах (webhook) */}
        {upstreams.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ArrowUp size={15} style={{ color: 'var(--dan-blue-text)' }} />
            <span className="muted" style={{ fontSize: 13 }}>{T('relay.forward.label')}</span>
            <select className="input" value={upTo} onChange={(e) => setUpTo(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="">{T('relay.forward.pick')}</option>
              {upstreams.map((p) => <option key={p.id} value={p.code}>{p.name}</option>)}
            </select>
            <button className="btn btn--primary btn--sm" onClick={forwardUp} disabled={!upTo || fwBusy}>
              {fwBusy ? <Loader2 className="spin" size={14} /> : <ArrowUp size={14} />} {T('relay.forward.send')}
            </button>
            {fwErr && <span className="alert alert--danger" style={{ fontSize: 12, padding: '2px 8px' }}>{fwErr}</span>}
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card__head"><div className="card__title"><Building2 size={18} style={{ color: 'var(--dan-blue-text)' }} /><h2>{T('relay.assignments')}</h2></div></div>
        <div>{assignments.map((a) => <AssignmentRow key={a.id} a={a} />)}</div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card__head"><div className="card__title"><Clock size={18} style={{ color: 'var(--dan-blue-text)' }} /><h2>{T('relay.timeline')}</h2></div></div>
        <div>
          {events.map((e) => (
            <div className="defrow" key={e.id}>
              <span className="defrow__label mono" style={{ fontSize: 12 }}>{e.type}</span>
              <span className="defrow__value" style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flex: 1 }}>
                <span>{e.detail}</span><span className="muted mono" style={{ fontSize: 12 }}>{formatTS(e.created_at)}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
