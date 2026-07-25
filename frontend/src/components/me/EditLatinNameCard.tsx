"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useT } from '@/lib/lang';
import { sendJSON } from '@/lib/client';
import Alert from '@/components/Alert';

/**
 * EditLatinNameCard нь хэрэглэгчийн латин нэрийг (овог/нэр англиар) гараар засах карт.
 * eID-ийн автомат галиглалт заримдаа буруу гардаг; засвар нь дараагийн нэвтрэлтэд
 * хадгалагдана (backend COALESCE). Хадгалсны дараа хуудсыг router.refresh-ээр шинэчилнэ.
 */
export default function EditLatinNameCard({ firstNameEn, lastNameEn }: { firstNameEn: string; lastNameEn: string }) {
  const { T } = useT();
  const router = useRouter();
  const [first, setFirst] = useState(firstNameEn);
  const [last, setLast] = useState(lastNameEn);
  const [ok, setOk] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const res = await sendJSON('/api/me/latin-name', 'PUT', { first_name_en: first.trim(), last_name_en: last.trim() });
      if (!res.ok) throw new Error(res.message || T('me.latin.error'));
    },
    onSuccess: () => { setOk(true); router.refresh(); },
  });

  return (
    <section className="card" aria-label={T('me.latin.title')} style={{ marginTop: 16 }}>
      <div className="card__head card__head--with-sub">
        <div className="card__title"><h2>{T('me.latin.title')}</h2></div>
        <span className="card__sub">{T('me.latin.hint')}</span>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); setOk(false); if (save.isError) save.reset(); save.mutate(); }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: '1 1 160px' }} placeholder={T('me.latin.last')} value={last}
            onChange={(e) => { setLast(e.target.value); setOk(false); }} maxLength={120} disabled={save.isPending} />
          <input className="input" style={{ flex: '1 1 160px' }} placeholder={T('me.latin.first')} value={first}
            onChange={(e) => { setFirst(e.target.value); setOk(false); }} maxLength={120} disabled={save.isPending} />
          <button type="submit" className="btn btn--primary" disabled={save.isPending} style={{ flex: 'none' }}>
            <Save size={16} strokeWidth={2} />
            <span>{save.isPending ? T('me.latin.saving') : T('me.latin.save')}</span>
          </button>
        </div>
        {save.isError && <div style={{ marginTop: 8 }}><Alert kind="danger">{(save.error as Error).message}</Alert></div>}
        {ok && <div style={{ marginTop: 8 }}><Alert kind="success">{T('me.latin.saved')}</Alert></div>}
      </form>
    </section>
  );
}
