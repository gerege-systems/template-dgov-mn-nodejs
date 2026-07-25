"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2, Plus, Building2, Route as RouteIcon, ArrowUp, ArrowDown, KeyRound, Copy } from 'lucide-react';
import { getJSON, postJSON, sendJSON } from '@/lib/client';
import { useT } from '@/lib/lang';
import type { RelayPlatform, RelayRoute } from '@/lib/relayTypes';

export default function RelayConfigView() {
  const { T } = useT();
  const qc = useQueryClient();
  const platforms = useQuery({ queryKey: ['relay-platforms'], queryFn: () => getJSON<RelayPlatform[]>('/api/relay/platforms') });
  const routes = useQuery({ queryKey: ['relay-routes'], queryFn: () => getJSON<RelayRoute[]>('/api/relay/routes') });

  const [pf, setPf] = useState({ code: '', name: '', direction: 'downstream', supervisor_contact: '' });
  const [rt, setRt] = useState({ service_code: '', platform_id: '', sla_minutes: 60 });
  const [err, setErr] = useState('');
  const [shownSecret, setShownSecret] = useState<string>('');

  const createPlatform = async () => {
    setErr('');
    const r = await postJSON('/api/relay/platforms', { ...pf, endpoint_url: 'demo://loopback', enabled: true });
    if (!r.ok) { setErr(r.message || 'error'); return; }
    setPf({ code: '', name: '', direction: 'downstream', supervisor_contact: '' });
    qc.invalidateQueries({ queryKey: ['relay-platforms'] });
  };
  const delPlatform = async (id: string) => {
    await sendJSON(`/api/relay/platforms/${id}`, 'DELETE');
    qc.invalidateQueries({ queryKey: ['relay-platforms'] });
    qc.invalidateQueries({ queryKey: ['relay-routes'] });
  };
  const createRoute = async () => {
    setErr('');
    const r = await postJSON('/api/relay/routes', rt);
    if (!r.ok) { setErr(r.message || 'error'); return; }
    setRt({ service_code: '', platform_id: '', sla_minutes: 60 });
    qc.invalidateQueries({ queryKey: ['relay-routes'] });
  };
  const delRoute = async (id: string) => {
    await sendJSON(`/api/relay/routes/${id}`, 'DELETE');
    qc.invalidateQueries({ queryKey: ['relay-routes'] });
  };
  const copy = (v: string) => { void navigator.clipboard?.writeText(v); };

  if (platforms.isPending || routes.isPending) return <div className="card"><Loader2 className="spin" size={18} /> {T('relay.loading')}</div>;

  const all = platforms.data ?? [];
  const upstream = all.filter((p) => p.direction === 'upstream');
  const downstream = all.filter((p) => p.direction !== 'upstream');
  const webhookURL = typeof window !== 'undefined' ? `${window.location.origin}/api/relay/webhook` : '/api/relay/webhook';

  const platformRow = (p: RelayPlatform) => (
    <div className="defrow" key={p.id} style={{ flexWrap: 'wrap' }}>
      <span className="defrow__label">
        {p.direction === 'upstream'
          ? <ArrowUp size={14} style={{ color: 'var(--dan-blue-text)' }} />
          : <ArrowDown size={14} style={{ color: '#0a7c4a' }} />}
        {' '}{p.name} <span className="muted mono" style={{ fontSize: 12 }}>({p.code})</span>
      </span>
      <span className="defrow__value" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className="muted mono" style={{ fontSize: 12 }}>{p.supervisor_contact}</span>
        <button className="btn btn--ghost btn--sm" onClick={() => setShownSecret(shownSecret === p.id ? '' : p.id)} title={T('relay.webhook.secret')}><KeyRound size={14} /></button>
        <button className="btn btn--ghost btn--sm" onClick={() => delPlatform(p.id)} aria-label="delete"><Trash2 size={14} /></button>
      </span>
      {shownSecret === p.id && (
        <div style={{ flexBasis: '100%', marginTop: 8, padding: 10, background: 'var(--surface-2, #f6f8fa)', borderRadius: 8, fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span className="muted">{T('relay.webhook.secret')}:</span>
            <code className="mono" style={{ wordBreak: 'break-all' }}>{p.webhook_secret}</code>
            <button className="btn btn--ghost btn--sm" onClick={() => copy(p.webhook_secret)} title="copy"><Copy size={13} /></button>
          </div>
          <div className="muted" style={{ lineHeight: 1.5 }}>
            {T('relay.webhook.help')} <code className="mono">POST {webhookURL}</code><br />
            <code className="mono">X-Relay-Source: {p.code}</code> · <code className="mono">X-Relay-Signature: sha256=HMAC(secret, body)</code>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {err && <div className="alert alert--danger" role="alert" style={{ marginBottom: 12 }}>{err}</div>}

      {/* Platforms */}
      <section className="card">
        <div className="card__head"><div className="card__title"><Building2 size={18} style={{ color: 'var(--dan-blue-text)' }} /><h2>{T('relay.platforms')}</h2></div></div>

        <h3 className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', margin: '4px 0 6px' }}>
          <ArrowUp size={13} style={{ verticalAlign: '-2px' }} /> {T('relay.dir.upstream')} — {T('relay.dir.upstreamHint')}
        </h3>
        {upstream.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>{T('relay.dir.none')}</p> : upstream.map(platformRow)}

        <h3 className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', margin: '14px 0 6px' }}>
          <ArrowDown size={13} style={{ verticalAlign: '-2px' }} /> {T('relay.dir.downstream')} — {T('relay.dir.downstreamHint')}
        </h3>
        {downstream.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>{T('relay.dir.none')}</p> : downstream.map(platformRow)}

        <div className="form-row" style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <input className="input" placeholder={T('relay.form.code')} value={pf.code} onChange={(e) => setPf({ ...pf, code: e.target.value })} />
          <input className="input" placeholder={T('relay.form.name')} value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} />
          <select className="input" value={pf.direction} onChange={(e) => setPf({ ...pf, direction: e.target.value })} style={{ maxWidth: 160 }}>
            <option value="downstream">{T('relay.dir.downstream')}</option>
            <option value="upstream">{T('relay.dir.upstream')}</option>
          </select>
          <input className="input" placeholder={T('relay.form.supervisor')} value={pf.supervisor_contact} onChange={(e) => setPf({ ...pf, supervisor_contact: e.target.value })} />
          <button className="btn btn--primary" onClick={createPlatform} disabled={!pf.code || !pf.name}><Plus size={15} /> {T('relay.form.add')}</button>
        </div>
      </section>

      {/* Routes */}
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card__head"><div className="card__title"><RouteIcon size={18} style={{ color: 'var(--dan-blue-text)' }} /><h2>{T('relay.routes')}</h2></div></div>
        <div>
          {(routes.data ?? []).map((r) => (
            <div className="defrow" key={r.id}>
              <span className="defrow__label mono">{r.service_code} → {r.platform_name}</span>
              <span className="defrow__value" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="chip chip--neutral">{r.sla_minutes} {T('relay.mins')}</span>
                <button className="btn btn--ghost btn--sm" onClick={() => delRoute(r.id)} aria-label="delete"><Trash2 size={14} /></button>
              </span>
            </div>
          ))}
        </div>
        <div className="form-row" style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <input className="input" placeholder={T('relay.form.serviceCode')} value={rt.service_code} onChange={(e) => setRt({ ...rt, service_code: e.target.value })} />
          <select className="input" value={rt.platform_id} onChange={(e) => setRt({ ...rt, platform_id: e.target.value })}>
            <option value="">{T('relay.form.pickPlatform')}</option>
            {downstream.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className="input" type="number" style={{ maxWidth: 120 }} placeholder={T('relay.form.sla')} value={rt.sla_minutes} onChange={(e) => setRt({ ...rt, sla_minutes: Number(e.target.value) })} />
          <button className="btn btn--primary" onClick={createRoute} disabled={!rt.service_code || !rt.platform_id}><Plus size={15} /> {T('relay.form.add')}</button>
        </div>
      </section>
    </>
  );
}
