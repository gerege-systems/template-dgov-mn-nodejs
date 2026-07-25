"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Ring R1 — нотолгооны каталог. Бичиг баримт бүрийг "аль төрийн санд аль
// хэдийн байгаа вэ" гэсэн ХУР mapping-тай холбоно. Нотолгоог ХУР-д боломжтой
// гэж тэмдэглэх нь once-only зөрчлийг илрүүлэх урьдчилсан нөхцөл — тиймээс
// backend нь in_khur тэмдэглэхэд khur_service_code-ыг заавал шаарддаг.

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Plus, Trash2, Link2 } from 'lucide-react';
import { getJSON, postJSON, sendJSON } from '@/lib/client';
import { useT } from '@/lib/lang';
import type { RegistryEvidence } from '@/lib/registryTypes';
import { Loading, fmtNum } from './regShared';

const EMPTY = {
  code: '',
  name: '',
  holder_agency: '',
  source_system: '',
  in_khur: false,
  khur_service_code: '',
};

export default function RegistryEvidencesView() {
  const { T } = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const evidences = useQuery({
    queryKey: ['registry-evidences'],
    queryFn: () => getJSON<RegistryEvidence[]>('/api/registry/evidences'),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['registry-evidences'] });
    qc.invalidateQueries({ queryKey: ['registry-overview'] });
    qc.invalidateQueries({ queryKey: ['registry-once-only'] });
  };

  const create = async () => {
    setErr('');
    setBusy(true);
    const r = await postJSON('/api/registry/evidences', form);
    setBusy(false);
    if (!r.ok) {
      setErr(r.message || T('registry.error'));
      return;
    }
    setForm(EMPTY);
    refresh();
  };

  // ХУР-ын боломжийг асаах/унтраах — зөрчлийн самбарт шууд нөлөөлнө.
  const toggleKhur = async (e: RegistryEvidence) => {
    setErr('');
    // Асаахад ХУР лавлагааны код заавал (backend мөн адил шалгана).
    const code = e.in_khur
      ? ''
      : (window.prompt(T('registry.evidence.askKhurCode'), e.khur_service_code) ?? '').trim();
    if (!e.in_khur && !code) return;

    setBusy(true);
    const r = await sendJSON(`/api/registry/evidences/${e.id}`, 'PUT', {
      name: e.name,
      description: e.description,
      holder_agency: e.holder_agency,
      source_system: e.source_system,
      in_khur: !e.in_khur,
      khur_service_code: code,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.message || T('registry.error'));
      return;
    }
    refresh();
  };

  const remove = async (id: string) => {
    if (!window.confirm(T('registry.confirmDelete'))) return;
    setBusy(true);
    const r = await sendJSON(`/api/registry/evidences/${id}`, 'DELETE');
    setBusy(false);
    if (!r.ok) {
      setErr(r.message || T('registry.error'));
      return;
    }
    refresh();
  };

  const inKhurCount = (evidences.data ?? []).filter((e) => e.in_khur).length;

  return (
    <>
      {err && <div className="alert alert--danger" role="alert" style={{ marginBottom: 12 }}>{err}</div>}

      <section className="card">
        <div className="card__head">
          <div className="card__title">
            <Database size={18} style={{ color: 'var(--dan-blue-text)' }} />
            <h2>{T('nav.registryEvidences')}</h2>
          </div>
          {evidences.data && (
            <span className="muted">
              {fmtNum(inKhurCount)} / {fmtNum(evidences.data.length)} · {T('registry.evidence.inKhur')}
            </span>
          )}
        </div>
        <p className="muted" style={{ marginTop: 0 }}>{T('registry.evidences.hint')}</p>

        {evidences.isPending ? (
          <Loading label={T('registry.loading')} />
        ) : evidences.isError ? (
          <div className="alert alert--danger" role="alert">{(evidences.error as Error).message}</div>
        ) : evidences.data!.length === 0 ? (
          <div className="muted" style={{ padding: 12 }}>{T('registry.noData')}</div>
        ) : (
          <div>
            {evidences.data!.map((e) => (
              <div className="defrow" key={e.id}>
                <span className="defrow__label" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>{e.name}</span>
                  <span className="muted mono" style={{ fontSize: 12 }}>
                    {e.code}
                    {e.holder_agency ? ` · ${e.holder_agency}` : ''}
                  </span>
                </span>
                <span className="defrow__value" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {e.in_khur && (
                    <span className="chip chip--primary mono" style={{ fontSize: 11 }} title={T('registry.evidence.khurCode')}>
                      <Link2 size={12} style={{ verticalAlign: '-2px' }} /> {e.khur_service_code}
                    </span>
                  )}
                  <button
                    className={`btn btn--sm ${e.in_khur ? 'btn--ghost' : 'btn--primary'}`}
                    onClick={() => toggleKhur(e)}
                    disabled={busy}
                  >
                    {e.in_khur ? T('registry.evidence.unmarkKhur') : T('registry.evidence.markKhur')}
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={() => remove(e.id)} disabled={busy} aria-label={T('registry.action.delete')}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Шинэ нотолгоо */}
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card__head">
          <div className="card__title">
            <Plus size={18} style={{ color: 'var(--dan-blue-text)' }} />
            <h2>{T('registry.evidences.new')}</h2>
          </div>
        </div>
        <div className="form-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input mono" style={{ maxWidth: 180 }} placeholder={T('registry.field.code')} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <input className="input" placeholder={T('registry.field.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" style={{ maxWidth: 180 }} placeholder={T('registry.evidence.holder')} value={form.holder_agency} onChange={(e) => setForm({ ...form, holder_agency: e.target.value })} />
          <input className="input" style={{ maxWidth: 200 }} placeholder={T('registry.evidence.source')} value={form.source_system} onChange={(e) => setForm({ ...form, source_system: e.target.value })} />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={form.in_khur} onChange={(e) => setForm({ ...form, in_khur: e.target.checked })} />
            {T('registry.evidence.inKhur')}
          </label>
          {/* ХУР-д байгаа гэж тэмдэглэсэн бол лавлагааны код заавал. */}
          {form.in_khur && (
            <input
              className="input mono"
              style={{ maxWidth: 260 }}
              placeholder={T('registry.evidence.khurCode')}
              value={form.khur_service_code}
              onChange={(e) => setForm({ ...form, khur_service_code: e.target.value })}
            />
          )}
          <button
            className="btn btn--primary"
            onClick={create}
            disabled={busy || !form.code.trim() || !form.name.trim() || (form.in_khur && !form.khur_service_code.trim())}
          >
            <Plus size={15} /> {T('registry.action.add')}
          </button>
        </div>
      </section>
    </>
  );
}
