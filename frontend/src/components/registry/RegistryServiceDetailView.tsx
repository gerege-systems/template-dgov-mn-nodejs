"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Ring R1 — паспортын дэлгэрэнгүй: CPSV-AP талбарууд, шаардах нотолгооны
// жагсаалт (once-only тэмдэглэгээтэй), нийтлэлт, хувилбарын түүх.
//
// Гол ажлын урсгал: нотолгооны "иргэнээс шаардах" тэмдгийг унтраах →
// проактив байдлын шатыг ахиулах → нийтлэх. Хувилбарын delta нь хассан
// баримт, богиносгосон хугацааг baseline-тай харьцуулж бүртгэнэ.

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Paperclip, History, ShieldCheck, ShieldAlert, Send, Archive, Trash2, Plus, Save,
} from 'lucide-react';
import { getJSON, postJSON, sendJSON } from '@/lib/client';
import { useT } from '@/lib/lang';
import { CHANNELS, PROACTIVITY_LEVELS, OUTPUT_TYPES } from '@/lib/registryTypes';
import type {
  RegistryService, RegistryVersion, RegistryEvidence, RegistryEvidenceLink,
  RegistryOnceOnlyReport, RegistryLifeEvent, Proactivity,
  Fulfilment, AssuranceLevel, OutputType,
} from '@/lib/registryTypes';
import { Loading, StatusChip, ProactivityChip, Delta, fmtDate, fmtNum } from './regShared';

export default function RegistryServiceDetailView({ id }: { id: string }) {
  const { T } = useT();
  const qc = useQueryClient();
  const router = useRouter();

  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [pickEvidence, setPickEvidence] = useState('');

  const svc = useQuery({
    queryKey: ['registry-service', id],
    queryFn: () => getJSON<RegistryService>(`/api/registry/services/${id}`),
  });
  const versions = useQuery({
    queryKey: ['registry-versions', id],
    queryFn: () => getJSON<RegistryVersion[]>(`/api/registry/services/${id}/versions`),
  });
  const report = useQuery({
    queryKey: ['registry-once-only-report', id],
    queryFn: () => getJSON<RegistryOnceOnlyReport>(`/api/registry/services/${id}/once-only`),
  });
  const catalogue = useQuery({
    queryKey: ['registry-evidences'],
    queryFn: () => getJSON<RegistryEvidence[]>('/api/registry/evidences'),
  });
  const lifeEvents = useQuery({
    queryKey: ['registry-life-events'],
    queryFn: () => getJSON<RegistryLifeEvent[]>('/api/registry/life-events'),
  });

  // Засварын төлөв — сервер өгөгдөл ирэхэд/шинэчлэгдэхэд дүүргэнэ.
  const [form, setForm] = useState<RegistryService | null>(null);
  useEffect(() => {
    if (svc.data) setForm(svc.data);
  }, [svc.data]);

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

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['registry-service', id] });
    qc.invalidateQueries({ queryKey: ['registry-versions', id] });
    qc.invalidateQueries({ queryKey: ['registry-once-only-report', id] });
    qc.invalidateQueries({ queryKey: ['registry-once-only'] });
    qc.invalidateQueries({ queryKey: ['registry-services'] });
    qc.invalidateQueries({ queryKey: ['registry-overview'] });
  };

  // Нэг мутацийг ажиллуулж, алдаа/амжилтыг нэг мөрөөр удирдана.
  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>, okMsg: string) => {
    setErr('');
    setMsg('');
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      setErr(r.message || T('registry.error'));
      return false;
    }
    setMsg(okMsg);
    refresh();
    return true;
  };

  if (svc.isPending || !form) return <Loading label={T('registry.loading')} />;
  if (svc.isError) return <div className="alert alert--danger" role="alert">{(svc.error as Error).message}</div>;

  const s = svc.data!;
  const links = s.evidences ?? [];

  const save = () =>
    run(
      () =>
        sendJSON(`/api/registry/services/${id}`, 'PUT', {
          name: form.name,
          name_en: form.name_en,
          description: form.description,
          authority: form.authority,
          legal_basis: form.legal_basis,
          target_group: form.target_group,
          output: form.output,
          channels: form.channels,
          fee: form.fee,
          max_days: form.max_days,
          steps_count: form.steps_count,
          annual_volume: form.annual_volume,
          proactivity: form.proactivity,
          life_event_id: form.life_event_id || null,
          // Үйл ажиллагааны тохиргоо — нийтлэхэд иргэний каталог руу буудаг.
          category: form.category,
          cofog_code: form.cofog_code,
          cofog_label: form.cofog_label,
          sdg_code: form.sdg_code,
          processing_time: form.processing_time,
          output_type: form.output_type,
          output_ref_type: form.output_ref_type,
          assurance_level: form.assurance_level,
          fulfilment: form.fulfilment,
          has_discretion: form.has_discretion,
          has_assessment: form.has_assessment,
          sla_hours: form.sla_hours,
          tacit_approval: form.tacit_approval,
          online: form.online,
        }),
      T('registry.msg.saved'),
    );

  // Нотолгооны жагсаалтыг БҮХЭЛД нь дахин илгээнэ (backend талд нэг транзакц).
  const putEvidences = (next: RegistryEvidenceLink[]) =>
    run(
      () =>
        sendJSON(`/api/registry/services/${id}/evidences`, 'PUT', {
          evidences: next.map((e) => ({
            evidence_id: e.evidence_id,
            required: e.required,
            from_citizen: e.from_citizen,
            note: e.note,
          })),
        }),
      T('registry.msg.evidencesSaved'),
    );

  const toggleLink = (evidenceID: string, field: 'required' | 'from_citizen') =>
    putEvidences(links.map((e) => (e.evidence_id === evidenceID ? { ...e, [field]: !e[field] } : e)));

  const removeLink = (evidenceID: string) =>
    putEvidences(links.filter((e) => e.evidence_id !== evidenceID));

  const addLink = async () => {
    if (!pickEvidence) return;
    const chosen = (catalogue.data ?? []).find((e) => e.id === pickEvidence);
    if (!chosen) return;
    const ok = await putEvidences([
      ...links,
      {
        evidence_id: chosen.id, code: chosen.code, name: chosen.name,
        required: true, from_citizen: true, in_khur: chosen.in_khur,
        once_only_violation: chosen.in_khur, note: '',
      },
    ]);
    if (ok) setPickEvidence('');
  };

  const publish = async () => {
    const ok = await run(
      () => postJSON(`/api/registry/services/${id}/publish`, { change_note: changeNote }),
      T('registry.msg.published'),
    );
    if (ok) setChangeNote('');
  };

  const archive = () =>
    run(() => postJSON(`/api/registry/services/${id}/archive`, {}), T('registry.msg.archived'));

  const remove = async () => {
    if (!window.confirm(T('registry.confirmDelete'))) return;
    const ok = await run(() => sendJSON(`/api/registry/services/${id}`, 'DELETE'), T('registry.msg.deleted'));
    if (ok) router.push('/admin/registry/services');
  };

  const toggleChannel = (ch: string) =>
    setForm({
      ...form,
      channels: form.channels.includes(ch)
        ? form.channels.filter((c) => c !== ch)
        : [...form.channels, ch],
    });

  // Каталогийн аль нотолгоо энэ паспортод хараахан холбогдоогүй вэ.
  const unlinked = (catalogue.data ?? []).filter((e) => !links.some((l) => l.evidence_id === e.id));

  return (
    <>
      {err && <div className="alert alert--danger" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="alert alert--success" role="status" style={{ marginBottom: 12 }}>{msg}</div>}

      {/* Толгой */}
      <section className="card">
        <div className="card__head">
          <div className="card__title">
            <FileText size={18} style={{ color: 'var(--dan-blue-text)' }} />
            <h2>{s.name}</h2>
          </div>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ProactivityChip level={s.proactivity} labels={proactivityLabels} />
            <StatusChip status={s.status} labels={statusLabels} />
            {s.version > 0 && <span className="chip chip--neutral mono">v{s.version}</span>}
          </span>
        </div>
        <div className="defrow">
          <span className="defrow__label">{T('registry.field.code')}</span>
          <span className="defrow__value mono">{s.code}</span>
        </div>
        <div className="defrow">
          <span className="defrow__label">{T('registry.field.publishedAt')}</span>
          <span className="defrow__value">{fmtDate(s.published_at)}</span>
        </div>
      </section>

      {/* Once-only шалгалт */}
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card__head">
          <div className="card__title">
            {report.data?.compliant ? (
              <ShieldCheck size={18} style={{ color: 'var(--success,#16a34a)' }} />
            ) : (
              <ShieldAlert size={18} style={{ color: 'var(--danger,#dc2626)' }} />
            )}
            <h2>{T('registry.detail.onceOnly')}</h2>
          </div>
        </div>
        {report.isPending ? (
          <Loading label={T('registry.loading')} />
        ) : report.data ? (
          <>
            <div className="defrow">
              <span className="defrow__label">{T('registry.onceOnly.citizenDocs')}</span>
              <span className="defrow__value mono">{report.data.citizen_documents}</span>
            </div>
            <div className="defrow">
              <span className="defrow__label">{T('registry.onceOnly.violations')}</span>
              <span className="defrow__value mono" style={{ color: report.data.compliant ? 'var(--success,#16a34a)' : 'var(--danger,#dc2626)' }}>
                {report.data.violations.length}
              </span>
            </div>
            <div className="defrow">
              <span className="defrow__label">{T('registry.onceOnly.eligible')}</span>
              <span className="defrow__value">
                <ProactivityChip level={report.data.eligible_proactivity} labels={proactivityLabels} />
              </span>
            </div>
            {!report.data.compliant && (
              <div className="alert alert--warning" role="status" style={{ marginTop: 12 }}>
                {T('registry.onceOnly.blockHint')}
              </div>
            )}
          </>
        ) : null}
      </section>

      {/* Шаардах нотолгоо */}
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card__head">
          <div className="card__title">
            <Paperclip size={18} style={{ color: 'var(--dan-blue-text)' }} />
            <h2>{T('registry.detail.evidences')}</h2>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>{T('registry.detail.evidencesHint')}</p>

        {links.length === 0 ? (
          <div className="muted" style={{ padding: 12 }}>{T('registry.noData')}</div>
        ) : (
          <div>
            {links.map((e) => (
              <div className="defrow" key={e.evidence_id}>
                <span className="defrow__label" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>
                    {e.name}
                    {e.once_only_violation && (
                      <span className="chip chip--danger" style={{ marginLeft: 8, fontSize: 11 }}>
                        {T('registry.onceOnly.badge')}
                      </span>
                    )}
                  </span>
                  <span className="muted mono" style={{ fontSize: 12 }}>{e.code}</span>
                </span>
                <span className="defrow__value" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" checked={e.required} disabled={busy} onChange={() => toggleLink(e.evidence_id, 'required')} />
                    {T('registry.evidence.required')}
                  </label>
                  {/* Энэ тэмдгийг унтраах нь once-only зөрчлийг арилгах гол үйлдэл. */}
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" checked={e.from_citizen} disabled={busy} onChange={() => toggleLink(e.evidence_id, 'from_citizen')} />
                    {T('registry.evidence.fromCitizen')}
                  </label>
                  {e.in_khur && <span className="chip chip--primary" style={{ fontSize: 11 }}>{T('registry.evidence.inKhur')}</span>}
                  <button className="btn btn--ghost btn--sm" onClick={() => removeLink(e.evidence_id)} disabled={busy} aria-label={T('registry.action.delete')}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="form-row" style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <select className="input" value={pickEvidence} onChange={(e) => setPickEvidence(e.target.value)} aria-label={T('registry.evidence.pick')}>
            <option value="">{T('registry.evidence.pick')}</option>
            {unlinked.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} {e.in_khur ? '· ХУР' : ''}
              </option>
            ))}
          </select>
          <button className="btn btn--primary" onClick={addLink} disabled={busy || !pickEvidence}>
            <Plus size={15} /> {T('registry.action.add')}
          </button>
        </div>
      </section>

      {/* Паспортын талбарууд */}
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card__head">
          <div className="card__title">
            <FileText size={18} style={{ color: 'var(--dan-blue-text)' }} />
            <h2>{T('registry.detail.passport')}</h2>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <Field label={T('registry.field.name')}>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={T('registry.field.nameEn')}>
            <input className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
          </Field>
          <Field label={T('registry.field.authority')}>
            <input className="input" value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })} />
          </Field>
          <Field label={T('registry.field.legalBasis')}>
            <input className="input" value={form.legal_basis} onChange={(e) => setForm({ ...form, legal_basis: e.target.value })} />
          </Field>
          <Field label={T('registry.field.targetGroup')}>
            <input className="input" value={form.target_group} onChange={(e) => setForm({ ...form, target_group: e.target.value })} />
          </Field>
          <Field label={T('registry.field.output')}>
            <input className="input" value={form.output} onChange={(e) => setForm({ ...form, output: e.target.value })} />
          </Field>
          <Field label={T('registry.field.description')}>
            <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>

          <Field label={T('registry.field.channels')}>
            <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {CHANNELS.map((ch) => (
                <label key={ch} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={form.channels.includes(ch)} onChange={() => toggleChannel(ch)} />
                  {ch}
                </label>
              ))}
            </span>
          </Field>

          <Field label={T('registry.field.fee')}>
            <input className="input" type="number" min={0} style={{ maxWidth: 160 }} value={form.fee} onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })} />
          </Field>
          <Field label={T('registry.field.maxDays')}>
            <input className="input" type="number" min={0} style={{ maxWidth: 160 }} value={form.max_days} onChange={(e) => setForm({ ...form, max_days: Number(e.target.value) })} />
          </Field>
          <Field label={T('registry.field.steps')}>
            <input className="input" type="number" min={0} style={{ maxWidth: 160 }} value={form.steps_count} onChange={(e) => setForm({ ...form, steps_count: Number(e.target.value) })} />
          </Field>
          <Field label={T('registry.field.volume')}>
            <input className="input" type="number" min={0} style={{ maxWidth: 200 }} value={form.annual_volume} onChange={(e) => setForm({ ...form, annual_volume: Number(e.target.value) })} />
          </Field>

          <Field label={T('registry.field.proactivity')}>
            <select className="input" style={{ maxWidth: 240 }} value={form.proactivity} onChange={(e) => setForm({ ...form, proactivity: e.target.value as Proactivity })}>
              {PROACTIVITY_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>{proactivityLabels[lvl]}</option>
              ))}
            </select>
          </Field>
          {/* ── Үйл ажиллагаа: иргэн юу хүлээхийг тодорхойлдог хэсэг ──
              Энэ бүлэг нь паспорт нийтлэгдэхэд иргэний порталын ажлын каталог
              руу шууд буудаг. Өмнө нь эдгээрийг тусад нь тохируулдаг байсан. */}
          <Field label="Биелүүлэх горим">
            <span>
              <select
                className="input"
                style={{ maxWidth: 260 }}
                value={form.fulfilment}
                onChange={(e) => setForm({ ...form, fulfilment: e.target.value as Fulfilment })}
              >
                <option value="manual">Менежер хянаж шийдвэрлэнэ</option>
                <option value="auto">Бүртгэлээс шууд олгоно</option>
              </select>
              {form.fulfilment === 'auto' && (form.has_discretion || form.has_assessment) && (
                <div className="alert alert--danger" style={{ marginTop: 8, fontSize: 13 }}>
                  Үнэлэх эрх эсвэл үнэлгээний зайтай үйлчилгээг автоматаар олгож болохгүй.
                  Доорх хоёр тэмдэглэгээг арилгасны дараа хадгалагдана.
                </div>
              )}
            </span>
          </Field>

          {/* Автоматжуулалтын эрх зүйн шалгуур — аль нэг нь тэмдэглэгдсэн бол
              шийдвэрийг хүн гаргах ёстой. */}
          <Field label="Үнэлэх эрх (Ermessen)">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={form.has_discretion}
                onChange={(e) => setForm({ ...form, has_discretion: e.target.checked })} />
              Албан тушаалтан үнэлж шийдэх эрхтэй
            </label>
          </Field>
          <Field label="Үнэлгээний зай">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={form.has_assessment}
                onChange={(e) => setForm({ ...form, has_assessment: e.target.checked })} />
              Урьдчилсан нөхцөлийг үнэлэх шаардлагатай
            </label>
          </Field>

          <Field label="Үйлчилгээний норм (цаг)">
            <input className="input" type="number" min={0} style={{ maxWidth: 160 }}
              disabled={form.fulfilment === 'auto'}
              value={form.sla_hours}
              onChange={(e) => setForm({ ...form, sla_hours: Number(e.target.value) })} />
          </Field>
          <Field label="Чимээгүй зөвшөөрөл">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={form.tacit_approval}
                onChange={(e) => setForm({ ...form, tacit_approval: e.target.checked })} />
              Хугацаанд шийдвэрлээгүй бол зөвшөөрсөнд тооцно
            </label>
          </Field>

          <Field label="Гаралтын төрөл (CPSV-AP)">
            <select className="input" style={{ maxWidth: 260 }} value={form.output_type}
              onChange={(e) => setForm({ ...form, output_type: e.target.value as OutputType })}>
              {OUTPUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Лавлагааны төрөл">
            <input className="input" style={{ maxWidth: 260 }} value={form.output_ref_type}
              placeholder="residence, tax, birth…"
              onChange={(e) => setForm({ ...form, output_ref_type: e.target.value })} />
          </Field>
          <Field label="Баталгаажилтын түвшин (eIDAS)">
            <select className="input" style={{ maxWidth: 200 }} value={form.assurance_level}
              onChange={(e) => setForm({ ...form, assurance_level: e.target.value as AssuranceLevel })}>
              <option value="low">low</option>
              <option value="substantial">substantial</option>
              <option value="high">high</option>
            </select>
          </Field>

          <Field label="COFOG код">
            <input className="input" style={{ maxWidth: 160 }} value={form.cofog_code}
              placeholder="01.3.3" onChange={(e) => setForm({ ...form, cofog_code: e.target.value })} />
          </Field>
          <Field label="SDG процедур">
            <input className="input" style={{ maxWidth: 160 }} value={form.sdg_code}
              placeholder="S1" onChange={(e) => setForm({ ...form, sdg_code: e.target.value })} />
          </Field>

          <Field label={T('registry.field.lifeEvent')}>
            <select className="input" style={{ maxWidth: 240 }} value={form.life_event_id ?? ''} onChange={(e) => setForm({ ...form, life_event_id: e.target.value || null })}>
              <option value="">—</option>
              {(lifeEvents.data ?? []).map((le) => (
                <option key={le.id} value={le.id}>{le.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button className="btn btn--primary" onClick={save} disabled={busy}>
            <Save size={15} /> {T('registry.action.save')}
          </button>
          {s.status !== 'archived' && (
            <button className="btn btn--ghost" onClick={archive} disabled={busy}>
              <Archive size={15} /> {T('registry.action.archive')}
            </button>
          )}
          {/* Нийтлэгдсэн паспортыг устгах боломжгүй — түүхэн мөр тасарна. */}
          {s.status === 'draft' && (
            <button className="btn btn--ghost" onClick={remove} disabled={busy}>
              <Trash2 size={15} /> {T('registry.action.delete')}
            </button>
          )}
        </div>
      </section>

      {/* Нийтлэх */}
      {s.status !== 'archived' && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card__head">
            <div className="card__title">
              <Send size={18} style={{ color: 'var(--dan-blue-text)' }} />
              <h2>{T('registry.publish.title')}</h2>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>{T('registry.publish.hint')}</p>
          <div className="form-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="input"
              placeholder={T('registry.publish.note')}
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
            />
            <button className="btn btn--primary" onClick={publish} disabled={busy}>
              <Send size={15} /> {T('registry.action.publish')}
            </button>
          </div>
        </section>
      )}

      {/* Хувилбарын түүх */}
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card__head">
          <div className="card__title">
            <History size={18} style={{ color: 'var(--dan-blue-text)' }} />
            <h2>{T('registry.detail.versions')}</h2>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>{T('registry.detail.versionsHint')}</p>

        {versions.isPending ? (
          <Loading label={T('registry.loading')} />
        ) : (versions.data ?? []).length === 0 ? (
          <div className="muted" style={{ padding: 12 }}>{T('registry.noData')}</div>
        ) : (
          <div>
            {versions.data!.map((v) => (
              <div className="defrow" key={v.id}>
                <span className="defrow__label" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>
                    <span className="mono">v{v.version}</span>
                    {v.is_baseline && (
                      <span className="chip chip--neutral" style={{ marginLeft: 8, fontSize: 11 }}>
                        {T('registry.version.baseline')}
                      </span>
                    )}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {fmtDate(v.published_at)}
                    {v.change_note ? ` · ${v.change_note}` : ''}
                  </span>
                </span>
                <span className="defrow__value" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                  <span title={T('registry.field.steps')}>
                    {T('registry.version.steps')}: <span className="mono">{v.steps_count}</span> <Delta value={v.delta_steps} />
                  </span>
                  <span title={T('registry.version.docs')}>
                    {T('registry.version.docs')}: <span className="mono">{v.documents_count}</span> <Delta value={v.delta_documents} />
                  </span>
                  <span title={T('registry.field.maxDays')}>
                    {T('registry.version.days')}: <span className="mono">{v.max_days}</span> <Delta value={v.delta_days} />
                  </span>
                  <span title={T('registry.field.fee')}>
                    {T('registry.version.fee')}: <span className="mono">{fmtNum(v.fee)}</span> <Delta value={v.delta_fee} />
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

/** Нэг талбарын мөр (шошго + оролт). */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span className="muted" style={{ fontSize: 13 }}>{label}</span>
      {children}
    </label>
  );
}
