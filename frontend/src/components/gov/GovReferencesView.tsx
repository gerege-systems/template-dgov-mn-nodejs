"use client";

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCheck, Plus, Download, Inbox, Loader2 } from 'lucide-react';
import { getJSON, postJSON } from '@/lib/client';
import type { GovReference } from '@/lib/govTypes';
import { Loading, fmtDate } from './govShared';

const REF_TYPES: { value: string; label: string }[] = [
  { value: 'residence', label: 'Оршин суугаа газрын лавлагаа' },
  { value: 'birth', label: 'Төрсний гэрчилгээний лавлагаа' },
  { value: 'marriage', label: 'Гэрлэлтийн байдлын лавлагаа' },
  { value: 'tax', label: 'Татварын тодорхойлолт' },
  { value: 'social_ins', label: 'Нийгмийн даатгалын лавлагаа' },
  { value: 'criminal', label: 'Ял эдэлж байгаагүй тодорхойлолт' },
];

export default function GovReferencesView() {
  const qc = useQueryClient();
  const [type, setType] = useState(REF_TYPES[0].value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const q = useQuery({ queryKey: ['gov-references'], queryFn: () => getJSON<GovReference[]>('/api/gov/references') });
  const items = q.data ?? [];

  const request = async () => {
    setBusy(true); setErr('');
    const res = await postJSON('/api/gov/references', { type });
    setBusy(false);
    if (res.ok) await qc.invalidateQueries({ queryKey: ['gov-references'] });
    else setErr(res.message || 'Лавлагаа захиалахад алдаа гарлаа.');
  };

  return (
    <>
      {err && <div className="alert alert--danger" role="alert" style={{ marginBottom: 14 }}>{err}</div>}

      <section className="card" style={{ margin: '0 0 16px', padding: 18 }}>
        <div className="card__head"><div className="card__title"><FileCheck size={18} style={{ color: 'var(--dan-blue-text)' }} /><h2>Лавлагаа захиалах</h2></div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 240 }}>Төрөл
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {REF_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <button className="btn btn--primary" type="button" onClick={request} disabled={busy}>
            {busy ? <><Loader2 size={16} className="spin" /> Захиалж буй…</> : <><Plus size={16} /> Захиалах</>}
          </button>
        </div>
      </section>

      {q.isPending && <Loading />}
      {!q.isPending && items.length === 0 && (
        <div className="card" style={{ padding: 24 }}><p className="muted"><Inbox size={15} /> Лавлагаа алга.</p></div>
      )}
      {items.length > 0 && (
        <div className="card users-table-wrap" style={{ margin: 0 }}>
          <table className="users-table">
            <thead><tr><th>Лавлагаа</th><th>Лавлах №</th><th>Олгосон</th><th>Хүчинтэй</th><th>Төлөв</th><th aria-label="actions" /></tr></thead>
            <tbody>
              {items.map((r) => {
                const expired = r.status !== 'issued' || (r.valid_until ? new Date(r.valid_until) < new Date() : false);
                return (
                  <tr key={r.id}>
                    <td data-label="Лавлагаа">{r.title}</td>
                    <td className="mono" data-label="Лавлах №">{r.reference_no}</td>
                    <td className="mono muted" data-label="Олгосон">{fmtDate(r.issued_at)}</td>
                    <td className="mono muted" data-label="Хүчинтэй">{fmtDate(r.valid_until)}</td>
                    <td data-label="Төлөв">{expired ? <span className="chip chip--danger">Хүчингүй</span> : <span className="chip chip--success">Хүчинтэй</span>}</td>
                    <td className="users-table__actions">
                      <button className="btn btn--ghost btn--sm" type="button" title="Татах (PDF)" disabled={expired}><Download size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
