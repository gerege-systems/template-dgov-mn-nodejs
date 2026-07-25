"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useT } from '@/lib/lang';
import { sendJSON } from '@/lib/client';
import Alert from '@/components/Alert';

/**
 * EditOrgNameLatin нь байгууллагын латин нэрийг гараар засах карт (зөвхөн ADMIN).
 * eidmongolia талд ADMIN эрхийг шалгана. Хадгалсны дараа байгууллагын жагсаалтыг
 * (['eid-organizations']) шинэчилнэ.
 */
export default function EditOrgNameLatin({ regNo, current }: { regNo: string; current: string }) {
  const { T } = useT();
  const qc = useQueryClient();
  const [name, setName] = useState(current);
  const [ok, setOk] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const res = await sendJSON(`/api/me/eid/organizations/${encodeURIComponent(regNo)}/name-latin`, 'PUT', { name_latin: name.trim() });
      if (!res.ok) throw new Error(res.message || T('me.latin.error'));
    },
    onSuccess: () => { setOk(true); void qc.invalidateQueries({ queryKey: ['eid-organizations'] }); },
  });

  return (
    <section className="card" aria-label={T('me.latin.orgTitle')} style={{ marginTop: 16 }}>
      <div className="card__head card__head--with-sub">
        <div className="card__title"><h2>{T('me.latin.orgTitle')}</h2></div>
        <span className="card__sub">{T('me.latin.orgHint')}</span>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); setOk(false); if (save.isError) save.reset(); save.mutate(); }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: 1 }} placeholder={T('me.latin.orgPlaceholder')} value={name}
            onChange={(e) => { setName(e.target.value); setOk(false); }} maxLength={200} disabled={save.isPending} />
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
