"use client";

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, CheckCircle2, AlertTriangle, Info, Inbox } from 'lucide-react';
import { getJSON, postJSON } from '@/lib/client';
import type { GovNotification } from '@/lib/govTypes';
import { Loading, fmtDateTime } from './govShared';

function icon(category: string) {
  if (category === 'success') return <CheckCircle2 size={16} style={{ color: 'var(--success,#16a34a)' }} />;
  if (category === 'warning') return <AlertTriangle size={16} style={{ color: 'var(--danger,#dc2626)' }} />;
  return <Info size={16} style={{ color: 'var(--dan-blue-text)' }} />;
}

export default function GovNotificationsView() {
  const qc = useQueryClient();
  const [err, setErr] = useState('');
  const q = useQuery({ queryKey: ['gov-notifications'], queryFn: () => getJSON<GovNotification[]>('/api/gov/notifications') });
  const items = q.data ?? [];
  const hasUnread = items.some((n) => !n.read);

  const refresh = () => qc.invalidateQueries({ queryKey: ['gov-notifications'] });

  const markRead = async (n: GovNotification) => {
    if (n.read) return;
    const res = await postJSON(`/api/gov/notifications/${n.id}/read`, {});
    if (res.ok) await refresh(); else setErr(res.message || 'Алдаа гарлаа.');
  };

  const markAll = async () => {
    const res = await postJSON('/api/gov/notifications/read-all', {});
    if (res.ok) await refresh(); else setErr(res.message || 'Алдаа гарлаа.');
  };

  return (
    <>
      {err && <div className="alert alert--danger" role="alert" style={{ marginBottom: 14 }}>{err}</div>}

      <section className="card" style={{ margin: 0 }} aria-label="Мэдэгдэл">
        <div className="card__head card__head--with-sub">
          <div className="card__title"><Bell size={18} style={{ color: 'var(--dan-blue-text)' }} /><h2>Мэдэгдэл</h2></div>
          {hasUnread && (
            <button className="btn btn--ghost btn--sm" type="button" onClick={markAll}><CheckCheck size={14} /> Бүгдийг уншсан болгох</button>
          )}
        </div>
        <div>
          {q.isPending && <Loading />}
          {!q.isPending && items.length === 0 && (
            <div className="defrow"><span className="defrow__value muted"><Inbox size={15} /> Мэдэгдэл алга.</span></div>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => markRead(n)}
              className="defrow defrow--wide"
              style={{
                width: '100%', textAlign: 'left', background: n.read ? 'transparent' : 'var(--surface-2,#f3f4f6)',
                border: 'none', cursor: n.read ? 'default' : 'pointer', borderRadius: 8,
              }}
            >
              <span className="defrow__label" style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 10 }}>
                {icon(n.category)}
                <span>
                  <span style={{ fontWeight: n.read ? 400 : 700 }}>{n.title}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{n.body}</span>
                </span>
              </span>
              <span className="defrow__value mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                {!n.read && <span className="chip chip--danger" style={{ marginRight: 8 }}>Шинэ</span>}
                {fmtDateTime(n.created_at)}
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
