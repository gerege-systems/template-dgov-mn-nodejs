"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PenLine, Upload, FileText, ShieldCheck, Download, RotateCcw, Clock, Smartphone, Building2 } from 'lucide-react';
import { CSRF_HEADER, getJSON } from '@/lib/client';
import { useT } from '@/lib/lang';

type Phase =
  | { kind: 'idle' }
  | { kind: 'uploading'; filename: string; orgName?: string }
  | { kind: 'waiting'; sessionID: string; filename: string; documentHash: string; verificationCode: string; orgName?: string }
  | { kind: 'completed'; sessionID: string; filename: string; orgName?: string }
  | { kind: 'error'; msg: string };

// Нэвтэрсэн иргэний eidmongolia.mn төлөөлдөг байгууллагууд (OrgRepsCard-тай ижил хэлбэр).
interface OrgRep {
  org_etsi: string;
  org_name: string;
  org_name_en?: string;
  right_type?: string;
}

// Иргэний PDF гарын үсэг (PIN2): файл сонгох → (сонголтоор) байгууллага сонгох →
// баталгаажуулах код → eID Mongolia App-аас PIN2 → poll → гарын үсэгтэй PDF татах.
// Байгууллагын нэрийн өмнөөс зурвал (onBehalfOf) гарын үсэг иргэний PIN2 cert-ээр
// зурагдах ба eidmongolia төлөөллийн эрхийг шалгана (тамга биш).
export default function EidSignView() {
  const { T, lang } = useT();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [orgEtsi, setOrgEtsi] = useState<string>(''); // '' = хувь хүнийхээрээ
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Төлөөлдөг байгууллагууд — байгаа бол "нэрийн өмнөөс зурах" сонголт харуулна.
  const orgsQ = useQuery({
    queryKey: ['eid-organizations'],
    queryFn: () => getJSON<OrgRep[]>('/api/me/eid/organizations'),
  });
  const orgs = orgsQ.data ?? [];
  const orgLabel = (o: OrgRep) => (lang === 'en' && o.org_name_en ? o.org_name_en : o.org_name);
  const selectedOrg = orgs.find((o) => o.org_etsi === orgEtsi);

  // Poll /api/sign/[id] until completed.
  useEffect(() => {
    if (phase.kind !== 'waiting') return;
    const sid = phase.sessionID;
    const fname = phase.filename;
    const orgName = phase.orgName;
    pollTimer.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/sign/${encodeURIComponent(sid)}`, { cache: 'no-store' });
        const data = await r.json();
        if (data.state === 'completed') {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setPhase({ kind: 'completed', sessionID: sid, filename: fname, orgName });
        } else if (data.state === 'failed' || data.state === 'expired' || data.state === 'rejected') {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setPhase({ kind: 'error', msg: data.state === 'expired' ? 'Хугацаа дууссан' : 'Гарын үсэг зурахаас татгалзлаа' });
        }
      } catch {
        /* transient — keep polling */
      }
    }, 1500);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [phase]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setPhase({ kind: 'error', msg: 'PDF файл оруулна уу' });
      return;
    }
    // Сонгосон байгууллагын нэрийн өмнөөс зурах бол etsi/нэрийг phase дундуур зөөнө.
    const orgName = selectedOrg ? orgLabel(selectedOrg) : undefined;
    setPhase({ kind: 'uploading', filename: f.name, orgName });
    try {
      const fd = new FormData();
      fd.set('file', f, f.name);
      if (orgEtsi) fd.set('onBehalfOf', orgEtsi);
      // Multipart body postJSON-оор явуулж болохгүй тул CSRF header-г шууд тавина
      // (lib/bff.ts checkOrigin шаарддаг; lib/client.ts-тэй ижил header).
      const r = await fetch('/api/sign/init', { method: 'POST', headers: { [CSRF_HEADER]: '1' }, body: fd });
      const data = await r.json();
      if (!r.ok) {
        setPhase({ kind: 'error', msg: data?.error ?? data?.message ?? 'Илгээж чадсангүй' });
        return;
      }
      setPhase({
        kind: 'waiting',
        sessionID: data.session_id,
        filename: data.filename ?? f.name,
        documentHash: data.document_hash ?? '',
        verificationCode: data.verification_code ?? '',
        orgName,
      });
    } catch (err) {
      setPhase({ kind: 'error', msg: String(err) });
    }
  }

  function reset() {
    if (pollTimer.current) clearInterval(pollTimer.current);
    setPhase({ kind: 'idle' });
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={onFile} />

      {/* IDLE — file pick */}
      {phase.kind === 'idle' && (
        <section className="card">
          <div className="card__head card__head--with-sub">
            <div className="card__title"><PenLine size={18} strokeWidth={2} style={{ color: 'var(--dan-blue-text)' }} /><h2>Баримт сонгох</h2></div>
          </div>
          <div style={{ padding: '20px 16px 28px', textAlign: 'center' }}>
            {/* Хэний нэрийн өмнөөс зурах: хувь хүн эсвэл төлөөлдөг байгууллага.
                Байгууллага байхгүй ч сонголтыг үргэлж card дээр харуулна. */}
            <div style={{ maxWidth: 380, margin: '0 auto 20px', textAlign: 'left' }}>
              <label htmlFor="sign-onbehalf" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
                <Building2 size={13} /> {T('eid.sign.as.label')}
              </label>
              <select
                id="sign-onbehalf"
                className="input"
                style={{ width: '100%', marginTop: 6 }}
                value={orgEtsi}
                onChange={(e) => setOrgEtsi(e.target.value)}
                disabled={orgsQ.isPending}
              >
                <option value="">{T('eid.sign.as.self')}</option>
                {orgs.map((o) => (
                  <option key={o.org_etsi} value={o.org_etsi}>
                    {orgLabel(o)}{o.right_type ? ` (${o.right_type})` : ''}
                  </option>
                ))}
              </select>
              {orgEtsi ? (
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{T('eid.sign.as.orgHint')}</p>
              ) : !orgsQ.isPending && orgs.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{T('eid.sign.as.none')}</p>
              ) : null}
            </div>
            <button type="button" className="btn btn--primary" onClick={() => fileRef.current?.click()}>
              <Upload size={16} style={{ marginRight: 8 }} /> PDF файл сонгох
            </button>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12 }}>Зөвхөн PDF, дээд тал нь 25 MB.</p>
          </div>
        </section>
      )}

      {/* UPLOADING */}
      {phase.kind === 'uploading' && (
        <section className="card" style={{ textAlign: 'center', padding: 32 }}>
          <Clock size={28} style={{ color: 'var(--dan-blue-text)' }} />
          <p style={{ fontWeight: 600, color: 'var(--fg)', marginTop: 12 }}>Илгээж байна…</p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileText size={14} /> {phase.filename}</p>
        </section>
      )}

      {/* WAITING — verification code + confirm in app */}
      {phase.kind === 'waiting' && (
        <section className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--dan-blue-soft)', color: 'var(--dan-blue-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Smartphone size={28} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', marginTop: 14 }}>Утсаараа баталгаажуулна уу</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileText size={14} /> {phase.filename}</p>
          {phase.orgName && (
            <p style={{ fontSize: 13, color: 'var(--dan-blue-text)', marginTop: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}><Building2 size={14} /> {phase.orgName} {T('eid.sign.onBehalfOf')}</p>
          )}
          {phase.verificationCode && (
            <>
              <p style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 18 }}>Баталгаажуулах код</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 8 }}>
                {phase.verificationCode.split('').map((c, i) => (
                  <span key={i} className="mono" style={{ width: 46, height: 56, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: 'var(--dan-blue-text)', background: 'var(--surface-2)', borderRadius: 12 }}>{c}</span>
                ))}
              </div>
            </>
          )}
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 18, maxWidth: 360, marginInline: 'auto', lineHeight: 1.6 }}>
            eID Mongolia App-даа энэ кодыг шалгаад <strong>PIN2</strong>-оор гарын үсэг зурна уу.
          </p>
          <button type="button" className="btn btn--secondary" onClick={reset} style={{ marginTop: 18 }}>
            <RotateCcw size={15} style={{ marginRight: 6 }} /> Болих
          </button>
        </section>
      )}

      {/* COMPLETED — download */}
      {phase.kind === 'completed' && (
        <section className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--dan-blue-soft)', color: 'var(--dan-blue-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={28} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', marginTop: 14 }}>Гарын үсэг амжилттай зурлаа</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{phase.filename}</p>
          {phase.orgName && (
            <p style={{ fontSize: 13, color: 'var(--dan-blue-text)', marginTop: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}><Building2 size={14} /> {phase.orgName} {T('eid.sign.onBehalfOf')}</p>
          )}
          <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a className="btn btn--primary" href={`/api/sign/${encodeURIComponent(phase.sessionID)}/download`}>
              <Download size={16} style={{ marginRight: 8 }} /> Татаж авах
            </a>
            <button type="button" className="btn btn--secondary" onClick={reset}>
              <RotateCcw size={15} style={{ marginRight: 6 }} /> Шинээр зурах
            </button>
          </div>
        </section>
      )}

      {/* ERROR */}
      {phase.kind === 'error' && (
        <section className="card" style={{ textAlign: 'center', padding: 32 }}>
          <p style={{ fontWeight: 600, color: 'var(--danger, #dc2626)' }}>{phase.msg}</p>
          <button type="button" className="btn btn--secondary" onClick={reset} style={{ marginTop: 16 }}>
            <RotateCcw size={15} style={{ marginRight: 6 }} /> Дахин оролдох
          </button>
        </section>
      )}
    </>
  );
}
