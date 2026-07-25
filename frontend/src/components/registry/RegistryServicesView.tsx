"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Ring R1 — үйлчилгээний паспортын жагсаалт: шүүлтүүр, хайлт, шинэ паспорт
// үүсгэх. Шинэ паспорт үргэлж ноорогоор эхэлдэг (backend талд албадсан).

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Library, Search } from 'lucide-react';
import { getJSON, postJSON } from '@/lib/client';
import { useT } from '@/lib/lang';
import type { RegistryService, RegistryStatus } from '@/lib/registryTypes';
import { Loading, StatusChip, ProactivityChip, fmtNum } from './regShared';

const STATUSES: RegistryStatus[] = ['draft', 'published', 'archived'];

export default function RegistryServicesView() {
  const { T } = useT();
  const qc = useQueryClient();

  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ code: '', name: '', authority: '' });
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);

  const services = useQuery({
    queryKey: ['registry-services', status, q],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      if (q.trim()) qs.set('q', q.trim());
      return getJSON<RegistryService[]>(`/api/registry/services${qs.size ? `?${qs}` : ''}`);
    },
  });

  const statusLabels: Record<string, string> = {
    draft: T('registry.status.draft'),
    published: T('registry.status.published'),
    archived: T('registry.status.archived'),
  };
  const proactivityLabels: Record<string, string> = {
    information: T('registry.proactivity.information'),
    online: T('registry.proactivity.online'),
    once_only: T('registry.proactivity.once_only'),
    proactive: T('registry.proactivity.proactive'),
  };

  const create = async () => {
    setErr('');
    setCreating(true);
    const r = await postJSON('/api/registry/services', form);
    setCreating(false);
    if (!r.ok) {
      setErr(r.message || T('registry.error'));
      return;
    }
    setForm({ code: '', name: '', authority: '' });
    qc.invalidateQueries({ queryKey: ['registry-services'] });
    qc.invalidateQueries({ queryKey: ['registry-overview'] });
  };

  return (
    <>
      {err && <div className="alert alert--danger" role="alert" style={{ marginBottom: 12 }}>{err}</div>}

      {/* Шүүлтүүр */}
      <section className="card">
        <div className="form-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Search size={16} className="muted" aria-hidden />
          <input
            className="input"
            placeholder={T('registry.services.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ maxWidth: 260 }}
          />
          <select className="input" style={{ maxWidth: 180 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label={T('registry.field.status')}>
            <option value="">{T('registry.filter.allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabels[s]}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Жагсаалт */}
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card__head">
          <div className="card__title">
            <Library size={18} style={{ color: 'var(--dan-blue-text)' }} />
            <h2>{T('nav.registryServices')}</h2>
          </div>
          {services.data && <span className="muted">{fmtNum(services.data.length)}</span>}
        </div>

        {services.isPending ? (
          <Loading label={T('registry.loading')} />
        ) : services.isError ? (
          <div className="alert alert--danger" role="alert">{(services.error as Error).message}</div>
        ) : services.data!.length === 0 ? (
          <div className="muted" style={{ padding: 12 }}>{T('registry.noData')}</div>
        ) : (
          <div>
            {services.data!.map((s) => (
              <div className="defrow" key={s.id}>
                <span className="defrow__label" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Link href={`/admin/registry/services/${s.id}`}>{s.name}</Link>
                  <span className="muted mono" style={{ fontSize: 12 }}>
                    {s.code} · {s.authority}
                  </span>
                </span>
                <span className="defrow__value" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <ProactivityChip level={s.proactivity} labels={proactivityLabels} />
                  <StatusChip status={s.status} labels={statusLabels} />
                  {s.version > 0 && <span className="chip chip--neutral mono">v{s.version}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Шинэ паспорт — код, нэр, эрх бүхий байгууллага (цөм талбарууд).
          Үлдсэнийг дэлгэрэнгүй хуудсанд бөглөнө. */}
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card__head">
          <div className="card__title">
            <Plus size={18} style={{ color: 'var(--dan-blue-text)' }} />
            <h2>{T('registry.services.new')}</h2>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>{T('registry.services.newHint')}</p>
        <div className="form-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input mono"
            placeholder={T('registry.field.code')}
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            style={{ maxWidth: 180 }}
          />
          <input
            className="input"
            placeholder={T('registry.field.name')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input"
            placeholder={T('registry.field.authority')}
            value={form.authority}
            onChange={(e) => setForm({ ...form, authority: e.target.value })}
            style={{ maxWidth: 200 }}
          />
          <button
            className="btn btn--primary"
            onClick={create}
            disabled={creating || !form.code.trim() || !form.name.trim() || !form.authority.trim()}
          >
            <Plus size={15} /> {T('registry.action.add')}
          </button>
        </div>
      </section>
    </>
  );
}
