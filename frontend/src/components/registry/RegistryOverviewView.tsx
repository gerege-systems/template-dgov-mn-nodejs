"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Ring R1 — регистрийн хяналтын самбар: инвентарын бүрэн байдал, проактив
// байдлын задаргаа, once-only зөрчлийн жагсаалт. Зөрчил бүр өөрийн засварын
// зааврыг (орлуулах ХУР лавлагаа) авч явна.

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Library, FileCheck2, FileWarning, Database, AlertTriangle, Layers, Timer } from 'lucide-react';
import { getJSON } from '@/lib/client';
import { useT } from '@/lib/lang';
import { PROACTIVITY_LEVELS } from '@/lib/registryTypes';
import type { RegistryOverview, RegistryOnceOnlyViolation, Proactivity } from '@/lib/registryTypes';
import { Loading, StatCard, ProactivityChip, fmtNum } from './regShared';

export default function RegistryOverviewView() {
  const { T } = useT();
  const [authority, setAuthority] = useState('');

  const ov = useQuery({
    queryKey: ['registry-overview'],
    queryFn: () => getJSON<RegistryOverview>('/api/registry/overview'),
  });
  const violations = useQuery({
    queryKey: ['registry-once-only', authority],
    queryFn: () =>
      getJSON<RegistryOnceOnlyViolation[]>(
        `/api/registry/once-only${authority ? `?authority=${encodeURIComponent(authority)}` : ''}`,
      ),
  });

  const proactivityLabels: Record<string, string> = {
    information: T('registry.proactivity.information'),
    online: T('registry.proactivity.online'),
    once_only: T('registry.proactivity.once_only'),
    proactive: T('registry.proactivity.proactive'),
  };

  if (ov.isPending) return <Loading label={T('registry.loading')} />;
  if (ov.isError) return <div className="alert alert--danger" role="alert">{(ov.error as Error).message}</div>;
  const o = ov.data!;

  // Проактив байдлын хуваарилалтын хамгийн өндөр багана (bar-ийн масштаб).
  const maxLevel = Math.max(1, ...PROACTIVITY_LEVELS.map((lvl) => o.by_proactivity[lvl] ?? 0));

  // Байгууллагын шүүлтүүрийн сонголтууд — зөрчилтэй байгууллагууд.
  const authorities = Array.from(new Set((violations.data ?? []).map((v) => v.authority))).sort();

  return (
    <>
      <div className="stat-grid">
        <StatCard icon={<Library size={18} />} value={fmtNum(o.total_services)} label={T('registry.kpi.services')} />
        <StatCard icon={<FileCheck2 size={18} />} value={fmtNum(o.published_services)} label={T('registry.kpi.published')} />
        <StatCard icon={<FileWarning size={18} />} value={fmtNum(o.draft_services)} label={T('registry.kpi.draft')} />
        <StatCard icon={<Database size={18} />} value={`${fmtNum(o.evidences_in_khur)} / ${fmtNum(o.evidences)}`} label={T('registry.kpi.inKhur')} />
        <StatCard
          icon={<AlertTriangle size={18} />}
          value={fmtNum(o.once_only_violations)}
          label={T('registry.kpi.violations')}
          tone={o.once_only_violations > 0 ? 'var(--danger,#dc2626)' : 'var(--success,#16a34a)'}
        />
        <StatCard icon={<Timer size={18} />} value={o.avg_max_days.toFixed(1)} label={T('registry.kpi.avgDays')} />
      </div>

      {/* Проактив байдлын шат */}
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card__head">
          <div className="card__title">
            <Layers size={18} style={{ color: 'var(--dan-blue-text)' }} />
            <h2>{T('registry.proactivity.title')}</h2>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>{T('registry.proactivity.sub')}</p>
        <div>
          {PROACTIVITY_LEVELS.map((lvl) => {
            const count = o.by_proactivity[lvl] ?? 0;
            return (
              <div className="defrow" key={lvl}>
                <span className="defrow__label">
                  <ProactivityChip level={lvl as Proactivity} labels={proactivityLabels} />
                </span>
                <span className="defrow__value" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      height: 8,
                      borderRadius: 4,
                      width: `${Math.round((count / maxLevel) * 160)}px`,
                      minWidth: count > 0 ? 6 : 0,
                      background: 'var(--dan-blue,#2563eb)',
                    }}
                  />
                  <span className="mono">{fmtNum(count)}</span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Once-only зөрчил */}
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card__head">
          <div className="card__title">
            <AlertTriangle size={18} style={{ color: 'var(--danger,#dc2626)' }} />
            <h2>{T('registry.onceOnly.title')}</h2>
          </div>
          {authorities.length > 0 && (
            <select
              className="input"
              style={{ maxWidth: 220 }}
              value={authority}
              onChange={(e) => setAuthority(e.target.value)}
              aria-label={T('registry.onceOnly.filterAuthority')}
            >
              <option value="">{T('registry.filter.allAuthorities')}</option>
              {authorities.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          )}
        </div>
        <p className="muted" style={{ marginTop: 0 }}>{T('registry.onceOnly.sub')}</p>

        {violations.isPending ? (
          <Loading label={T('registry.loading')} />
        ) : (violations.data ?? []).length === 0 ? (
          <div className="alert alert--success" role="status">{T('registry.onceOnly.none')}</div>
        ) : (
          <div>
            {(violations.data ?? []).map((v) => (
              <div className="defrow" key={`${v.service_id}-${v.evidence_id}`}>
                <span className="defrow__label" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Link href={`/admin/registry/services/${v.service_id}`}>{v.service_name}</Link>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {v.evidence_name} · {v.authority}
                  </span>
                </span>
                <span className="defrow__value" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Засварын шууд заавар: иргэний цаасыг орлох ХУР лавлагаа. */}
                  <span className="muted" style={{ fontSize: 12 }}>{T('registry.onceOnly.replaceWith')}</span>
                  <span className="chip chip--primary mono" style={{ fontSize: 11 }}>{v.khur_service_code}</span>
                  <span className="chip chip--neutral" title={T('registry.kpi.annualHits')}>
                    {fmtNum(v.annual_volume)}/{T('registry.units.year')}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
