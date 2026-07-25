"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Inbox, Loader2, AlertTriangle, CheckCircle2, Gauge, Timer,
  Bell, Send, ArrowUpCircle, ShieldAlert, Building2,
} from 'lucide-react';
import { getJSON } from '@/lib/client';
import { useT } from '@/lib/lang';
import { formatTS } from '@/lib/format';
import type { RelayOverview, RelayRequest, RelayEvent } from '@/lib/relayTypes';

const POLL_MS = 5000;

function StatCard({ icon, value, label, tone }: { icon: React.ReactNode; value: React.ReactNode; label: string; tone?: string }) {
  return (
    <div className="card stat-card" style={{ margin: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: tone ?? 'var(--dan-blue-text)' }}>{icon}</div>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  );
}

// Статусын өнгө.
function statusTone(s: string): string {
  if (s === 'fulfilled') return 'var(--success,#16a34a)';
  if (s === 'overdue' || s === 'rejected') return 'var(--danger,#dc2626)';
  if (s === 'in_progress' || s === 'dispatched') return 'var(--dan-blue,#2563eb)';
  return 'var(--muted,#888)';
}

// Event төрлийн icon.
function EventIcon({ t }: { t: string }) {
  const size = 15;
  switch (t) {
    case 'received': return <Inbox size={size} />;
    case 'dispatched': return <Send size={size} style={{ color: 'var(--dan-blue-text)' }} />;
    case 'reminded': return <Bell size={size} style={{ color: 'var(--warning,#d97706)' }} />;
    case 'responded': return <CheckCircle2 size={size} style={{ color: 'var(--success,#16a34a)' }} />;
    case 'fulfilled': return <CheckCircle2 size={size} style={{ color: 'var(--success,#16a34a)' }} />;
    case 'overdue': return <AlertTriangle size={size} style={{ color: 'var(--danger,#dc2626)' }} />;
    case 'escalated': return <ArrowUpCircle size={size} style={{ color: 'var(--danger,#dc2626)' }} />;
    case 'breach_notified': return <ShieldAlert size={size} style={{ color: 'var(--danger,#dc2626)' }} />;
    default: return <Inbox size={size} />;
  }
}

export default function RelayDashboardView() {
  const { T } = useT();
  const ov = useQuery({ queryKey: ['relay-overview'], queryFn: () => getJSON<RelayOverview>('/api/relay/overview'), refetchInterval: POLL_MS });
  const reqs = useQuery({ queryKey: ['relay-requests'], queryFn: () => getJSON<RelayRequest[]>('/api/relay/requests?limit=25'), refetchInterval: POLL_MS });

  if (ov.isPending) return <div className="card"><Loader2 className="spin" size={18} /> {T('relay.loading')}</div>;
  if (ov.isError) return <div className="alert alert--danger" role="alert">{(ov.error as Error).message}</div>;
  const o = ov.data!;
  const compliance = (o.sla_compliance_pct * 100).toFixed(0);
  const maxBucket = Math.max(1, ...o.status_buckets.map((b) => b.count));

  return (
    <>
      <div className="stat-grid">
        <StatCard icon={<Inbox size={18} />} value={o.received_today} label={T('relay.kpi.receivedToday')} />
        <StatCard icon={<Loader2 size={18} />} value={o.in_progress} label={T('relay.kpi.inProgress')} />
        <StatCard icon={<AlertTriangle size={18} />} value={o.overdue} label={T('relay.kpi.overdue')} tone="var(--danger,#dc2626)" />
        <StatCard icon={<CheckCircle2 size={18} />} value={o.fulfilled} label={T('relay.kpi.fulfilled')} tone="var(--success,#16a34a)" />
        <StatCard icon={<Gauge size={18} />} value={`${compliance}%`} label={T('relay.kpi.compliance')} />
        <StatCard icon={<Timer size={18} />} value={`${o.avg_fulfill_mins}m`} label={T('relay.kpi.avgFulfill')} />
      </div>

      <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {/* Статусын хуваарилалт */}
        <section className="card">
          <div className="card__head"><div className="card__title"><Gauge size={18} style={{ color: 'var(--dan-blue-text)' }} /><h2>{T('relay.statusDist')}</h2></div></div>
          <div>
            {o.status_buckets.length === 0 && <div className="defrow"><span className="defrow__value muted"><Inbox size={15} /> {T('relay.noData')}</span></div>}
            {o.status_buckets.map((b) => (
              <div className="defrow" key={b.status}>
                <span className="defrow__label mono">{b.status}</span>
                <span className="defrow__value" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
                  <span style={{ flex: 1, height: 6, background: 'var(--surface-2,#eee)', borderRadius: 4, overflow: 'hidden', maxWidth: 160 }}>
                    <span style={{ display: 'block', height: '100%', width: `${(b.count / maxBucket) * 100}%`, background: statusTone(b.status) }} />
                  </span>
                  <span className="mono" style={{ minWidth: 28, textAlign: 'right' }}>{b.count}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Доод platform-уудын SLA гүйцэтгэл */}
        <section className="card">
          <div className="card__head"><div className="card__title"><Building2 size={18} style={{ color: 'var(--dan-blue-text)' }} /><h2>{T('relay.platforms')}</h2></div></div>
          <div>
            {o.platforms.map((p) => (
              <div className="defrow" key={p.platform_id}>
                <span className="defrow__label">{p.platform_name}</span>
                <span className="defrow__value" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span title={T('relay.done')} style={{ color: 'var(--success,#16a34a)' }}>{p.done}</span>
                  <span title={T('relay.kpi.overdue')} style={{ color: 'var(--danger,#dc2626)' }}>{p.overdue}</span>
                  <span title={T('relay.pending')} className="muted">{p.pending}</span>
                  <span className="chip chip--neutral">{(p.compliance_pct * 100).toFixed(0)}%</span>
                </span>
              </div>
            ))}
            {o.platforms.length === 0 && <div className="defrow"><span className="defrow__value muted">{T('relay.noData')}</span></div>}
          </div>
        </section>
      </div>

      <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        {/* Сүүлийн хүсэлтүүд */}
        <section className="card">
          <div className="card__head"><div className="card__title"><Inbox size={18} style={{ color: 'var(--dan-blue-text)' }} /><h2>{T('relay.recentRequests')}</h2></div></div>
          <div>
            {(reqs.data ?? []).map((r) => (
              <Link key={r.id} href={`/admin/relay/${r.id}`} className="defrow" style={{ textDecoration: 'none' }}>
                <span className="defrow__label" style={{ display: 'flex', flexDirection: 'column' }}>
                  <span>{r.title || r.service_code}</span>
                  <span className="muted mono" style={{ fontSize: 12 }}>{r.source_platform} · {formatTS(r.due_at)}</span>
                </span>
                <span className="defrow__value"><span className="chip" style={{ color: statusTone(r.status), borderColor: 'currentColor' }}>{r.status}</span></span>
              </Link>
            ))}
            {(reqs.data ?? []).length === 0 && <div className="defrow"><span className="defrow__value muted">{T('relay.noData')}</span></div>}
          </div>
        </section>

        {/* Realtime event feed */}
        <section className="card">
          <div className="card__head"><div className="card__title"><Bell size={18} style={{ color: 'var(--dan-blue-text)' }} /><h2>{T('relay.liveFeed')}</h2></div></div>
          <div>
            {o.recent_events.map((e: RelayEvent) => (
              <div className="defrow" key={e.id}>
                <span className="defrow__label" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <EventIcon t={e.type} /><span>{e.detail}</span>
                </span>
                <span className="defrow__value muted mono" style={{ fontSize: 12 }}>{formatTS(e.created_at)}</span>
              </div>
            ))}
            {o.recent_events.length === 0 && <div className="defrow"><span className="defrow__value muted">{T('relay.noData')}</span></div>}
          </div>
        </section>
      </div>
    </>
  );
}
