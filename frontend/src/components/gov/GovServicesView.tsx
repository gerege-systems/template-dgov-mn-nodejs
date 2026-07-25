"use client";

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Landmark, Globe, Building2, Loader2, Inbox, Zap, UserCheck, Scale } from 'lucide-react';
import { getJSON, postJSON } from '@/lib/client';
import type { GovService, GovApplyResult } from '@/lib/govTypes';
import { Loading, money } from './govShared';

export default function GovServicesView() {
  const router = useRouter();
  const [cat, setCat] = useState<string>('all');
  const [applying, setApplying] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const q = useQuery({ queryKey: ['gov-services'], queryFn: () => getJSON<GovService[]>('/api/gov/services') });
  const items = useMemo(() => q.data ?? [], [q.data]);

  const categories = useMemo(() => ['all', ...Array.from(new Set(items.map((s) => s.category)))], [items]);
  const filtered = useMemo(
    () => (cat === 'all' ? items : items.filter((s) => s.category === cat)),
    [cat, items],
  );

  // Хоёр төрлийн үр дүнг ЯЛГАЖ харуулна: шууд биелсэн үйлчилгээ нь лавлагаа
  // руу, хянагдах хүсэлт нь хүсэлтийн жагсаалт руу аваачна. Өмнө нь бүгд
  // "хүсэлт илгээгдлээ" гэж хэлээд хүсэлтийн жагсаалт руу явдаг байсан нь
  // шууд гарсан лавлагааг иргэнээс нуудаг байв.
  const apply = async (s: GovService) => {
    setApplying(s.id); setErr(''); setMsg('');
    const res = await postJSON<GovApplyResult>('/api/gov/applications', { service_id: s.id });
    setApplying(null);
    if (!res.ok) {
      setErr(res.message || 'Хүсэлт илгээхэд алдаа гарлаа.');
      return;
    }
    if (res.data?.auto_issued) {
      setMsg(`"${s.name}" шууд олгогдлоо. Лавлагаа хэсгээс татаж авна уу.`);
      setTimeout(() => router.push('/me/references'), 900);
    } else {
      setMsg(`"${s.name}" хүсэлт бүртгэгдлээ. Хянагдсаны дараа мэдэгдэнэ.`);
      setTimeout(() => router.push('/me/applications'), 900);
    }
  };

  if (q.isPending) return <Loading />;
  if (q.isError) return <div className="alert alert--danger" role="alert">{(q.error as Error).message}</div>;

  return (
    <>
      {msg && <div className="alert" role="status" style={{ borderLeft: '3px solid var(--success,#16a34a)', marginBottom: 14 }}>{msg}</div>}
      {err && <div className="alert alert--danger" role="alert" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="segmented" role="tablist" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {categories.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={cat === c}
            className={`segmented__item${cat === c ? ' is-active' : ''}`} onClick={() => setCat(c)}>
            {c === 'all' ? 'Бүгд' : c}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="card" style={{ padding: 24 }}><p className="muted"><Inbox size={15} /> Үйлчилгээ алга.</p></div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {filtered.map((s) => (
          <div key={s.id} className="card" style={{ margin: 0, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ flex: '0 0 auto', width: 40, height: 40, borderRadius: 10, background: 'var(--surface-2,#f3f4f6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dan-blue-text)' }}>
                <Landmark size={20} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  <Building2 size={12} /> {s.agency} · {s.category}
                </div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, margin: 0, flex: 1 }}>{s.description}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
              <span className="chip chip--neutral">{s.fee > 0 ? money(s.fee) : 'Үнэгүй'}</span>
              {/* Иргэн ЮУ ХҮЛЭЭХЭЭ урьдчилан мэдэх ёстой: шууд гарах уу, эсвэл
                  хүн хянах уу. Энэ бол хамгийн чухал ялгаа. */}
              {s.fulfilment === 'auto' ? (
                <span className="chip chip--success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Zap size={11} /> Шууд олгогдоно
                </span>
              ) : (
                <span className="chip chip--neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <UserCheck size={11} /> {s.sla_hours > 0 ? `${Math.round(s.sla_hours / 24)} хоногт хянана` : 'Хянагдана'}
                </span>
              )}
              {s.online && <span className="chip chip--success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Globe size={11} /> Онлайн</span>}
            </div>

            {s.evidence.length > 0 && (
              <details style={{ fontSize: 12, color: 'var(--muted)' }}>
                <summary style={{ cursor: 'pointer' }}>Шаардах баримт ({s.evidence.length})</summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {s.evidence.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </details>
            )}

            {s.legal_basis && (
              <div style={{ fontSize: 11, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Scale size={11} /> {s.legal_basis}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {s.code}{s.cofog_code && ` · COFOG ${s.cofog_code}`}{s.sdg_code && ` · SDG ${s.sdg_code}`}
            </div>

            <button className="btn btn--primary" type="button" onClick={() => apply(s)} disabled={applying === s.id}>
              {applying === s.id
                ? <><Loader2 size={16} className="spin" /> Илгээж буй…</>
                : s.fulfilment === 'auto' ? 'Шууд авах' : 'Хүсэлт гаргах'}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
