"use client";

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, Inbox, Loader2, CheckCircle2 } from 'lucide-react';
import { getJSON, postJSON } from '@/lib/client';
import type { GovPayment } from '@/lib/govTypes';
import { Loading, money, fmtDate } from './govShared';

const CAT_LABEL: Record<string, string> = { tax: 'Татвар', fee: 'Хураамж', fine: 'Торгууль' };

export default function GovPaymentsView() {
  const qc = useQueryClient();
  const [paying, setPaying] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const q = useQuery({ queryKey: ['gov-payments'], queryFn: () => getJSON<GovPayment[]>('/api/gov/payments') });
  const items = q.data ?? [];
  const unpaidTotal = items.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount, 0);

  const pay = async (p: GovPayment) => {
    if (!window.confirm(`${money(p.amount, p.currency)} төлбөрийг төлөх үү?`)) return;
    setPaying(p.id); setErr('');
    const res = await postJSON(`/api/gov/payments/${p.id}/pay`, {});
    setPaying(null);
    if (res.ok) await qc.invalidateQueries({ queryKey: ['gov-payments'] });
    else setErr(res.message || 'Төлбөр төлөхөд алдаа гарлаа.');
  };

  return (
    <>
      {err && <div className="alert alert--danger" role="alert" style={{ marginBottom: 14 }}>{err}</div>}

      {unpaidTotal > 0 && (
        <section className="card stat-card" style={{ margin: '0 0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--dan-blue-text)' }}><Wallet size={18} /></div>
          <div className="stat-card__value">{money(unpaidTotal)}</div>
          <div className="stat-card__label">Нийт төлөгдөөгүй төлбөр</div>
        </section>
      )}

      {q.isPending && <Loading />}
      {!q.isPending && items.length === 0 && (
        <div className="card" style={{ padding: 24 }}><p className="muted"><Inbox size={15} /> Төлбөр алга.</p></div>
      )}
      {items.length > 0 && (
        <div className="card users-table-wrap" style={{ margin: 0 }}>
          <table className="users-table">
            <thead><tr><th>Төлбөр</th><th>Төрөл</th><th>Дүн</th><th>Хугацаа</th><th>Төлөв</th><th aria-label="actions" /></tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td data-label="Төлбөр">{p.title}</td>
                  <td data-label="Төрөл"><span className="chip chip--neutral">{CAT_LABEL[p.category] ?? p.category}</span></td>
                  <td className="mono" data-label="Дүн">{money(p.amount, p.currency)}</td>
                  <td className="mono muted" data-label="Хугацаа">{p.status === 'paid' ? fmtDate(p.paid_at) : fmtDate(p.due_date)}</td>
                  <td data-label="Төлөв">
                    {p.status === 'paid'
                      ? <span className="chip chip--success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={12} /> Төлсөн</span>
                      : <span className="chip chip--danger">Төлөгдөөгүй</span>}
                  </td>
                  <td className="users-table__actions">
                    {p.status === 'pending' && (
                      <button className="btn btn--primary btn--sm" type="button" onClick={() => pay(p)} disabled={paying === p.id}>
                        {paying === p.id ? <Loader2 size={14} className="spin" /> : 'Төлөх'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
