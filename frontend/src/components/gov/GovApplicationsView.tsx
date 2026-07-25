"use client";

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Inbox, History, Send } from 'lucide-react';
import { getJSON, postJSON } from '@/lib/client';
import type { GovApplication, GovApplicationEvent } from '@/lib/govTypes';
import { Loading, ApplicationStatus, DueChip, fmtDate, fmtDateTime, EmptyRow } from './govShared';

// Timeline дэх үйл явдлын төрлийг иргэнд ойлгомжтой өгүүлбэр болгоно. Кодыг
// шууд харуулбал ("auto_fulfilled") иргэнд утгагүй.
const EVENT_LABEL: Record<string, string> = {
  created: 'Хүсэлт илгээгдэв',
  auto_fulfilled: 'Бүртгэлээс шууд олгогдов',
  assigned: 'Менежер хянахаар авав',
  info_requested: 'Нэмэлт мэдээлэл хүссэн',
  info_provided: 'Нэмэлт мэдээлэл ирүүлэв',
  info_note: 'Иргэний тайлбар',
  decided: 'Шийдвэр гарав',
  delivered: 'Гаралт хүргэгдэв',
  sla_breached: 'Хугацаа хэтэрлээ',
  tacit_approved: 'Хугацаа хэтэрсэн тул зөвшөөрсөнд тооцов',
};

function Timeline({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ['gov-application-timeline', id],
    queryFn: () => getJSON<GovApplicationEvent[]>(`/api/gov/applications/${id}/timeline`),
  });

  if (q.isPending) return <Loading />;
  if (q.isError) return <div className="alert alert--danger">{(q.error as Error).message}</div>;

  const events = q.data ?? [];
  if (events.length === 0) return <EmptyRow text="Бичлэг алга." />;

  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {events.map((e) => (
        <li key={e.id} style={{ marginBottom: 6 }}>
          <strong>{EVENT_LABEL[e.type] ?? e.type}</strong>
          <span className="muted" style={{ fontSize: 12 }}> · {fmtDateTime(e.created_at)}</span>
          {e.detail && <div className="muted" style={{ fontSize: 13 }}>{e.detail}</div>}
        </li>
      ))}
    </ul>
  );
}

export default function GovApplicationsView() {
  const qc = useQueryClient();
  const [err, setErr] = useState('');
  const [openID, setOpenID] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['gov-applications'], queryFn: () => getJSON<GovApplication[]>('/api/gov/applications') });
  const items = q.data ?? [];

  const cancel = async (a: GovApplication) => {
    if (!window.confirm(`"${a.service_name}" хүсэлтийг цуцлах уу?`)) return;
    setErr('');
    const res = await postJSON(`/api/gov/applications/${a.id}/cancel`, {});
    if (res.ok) await qc.invalidateQueries({ queryKey: ['gov-applications'] });
    else setErr(res.message || 'Цуцлахад алдаа гарлаа.');
  };

  // Менежер нэмэлт мэдээлэл хүссэн үед иргэн хариу өгнө — үүнээр SLA цаг
  // дахин үргэлжилнэ (backend талд due_at нь зогссон хугацаагаар хойшилно).
  const provideInfo = async (a: GovApplication) => {
    const note = window.prompt('Шаардсан мэдээллийг бичнэ үү:') ?? '';
    if (!note.trim()) return;
    setErr('');
    const res = await postJSON(`/api/gov/applications/${a.id}/provide-info`, { note });
    if (res.ok) {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['gov-applications'] }),
        qc.invalidateQueries({ queryKey: ['gov-application-timeline', a.id] }),
      ]);
    } else {
      setErr(res.message || 'Илгээхэд алдаа гарлаа.');
    }
  };

  // Цуцлах боломжит төлвүүд — backend-ийн шилжилтийн хүснэгттэй нийцнэ.
  const canCancel = (s: string) =>
    s === 'submitted' || s === 'registered' || s === 'in_review' || s === 'info_required';

  return (
    <>
      {err && <div className="alert alert--danger" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      {q.isPending && <Loading />}
      {!q.isPending && items.length === 0 && (
        <div className="card" style={{ padding: 24 }}><p className="muted"><Inbox size={15} /> Хүсэлт алга. «Үйлчилгээ» хэсгээс хүсэлт гаргана уу.</p></div>
      )}
      {items.length > 0 && (
        <div className="card users-table-wrap" style={{ margin: 0 }}>
          <table className="users-table">
            <thead>
              <tr>
                <th>Үйлчилгээ</th><th>Лавлах №</th><th>Төлөв</th><th>Хугацаа</th><th>Огноо</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <React.Fragment key={a.id}>
                  <tr>
                    <td data-label="Үйлчилгээ">
                      {a.service_name}
                      {a.note && <div className="muted" style={{ fontSize: 12 }}>{a.note}</div>}
                      {/* Татгалзсан/нэмэлт мэдээлэл хүссэн үндэслэлийг иргэн
                          ЗААВАЛ харах ёстой — гомдол гаргах эрхийнх нь үндэс. */}
                      {a.decision_note && (
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          <strong>Тайлбар:</strong> {a.decision_note}
                        </div>
                      )}
                      {a.tacit && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          Энэ шийдвэр хугацаа хэтэрсний улмаас автоматаар гарсан.
                        </div>
                      )}
                    </td>
                    <td className="mono" data-label="Лавлах №">{a.reference_no}</td>
                    <td data-label="Төлөв"><ApplicationStatus status={a.status} /></td>
                    <td data-label="Хугацаа"><DueChip dueAt={a.due_at} suspended={a.suspended} /></td>
                    <td className="mono muted" data-label="Огноо">{fmtDate(a.submitted_at)}</td>
                    <td className="users-table__actions">
                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        title="Явцын түүх"
                        aria-expanded={openID === a.id}
                        onClick={() => setOpenID(openID === a.id ? null : a.id)}
                      >
                        <History size={14} />
                      </button>
                      {a.status === 'info_required' && (
                        <button className="btn btn--primary btn--sm" type="button" title="Мэдээлэл илгээх"
                          onClick={() => provideInfo(a)}>
                          <Send size={14} />
                        </button>
                      )}
                      {canCancel(a.status) && (
                        <button className="btn btn--ghost btn--sm" type="button" title="Цуцлах" onClick={() => cancel(a)}><X size={14} /></button>
                      )}
                    </td>
                  </tr>
                  {openID === a.id && (
                    <tr>
                      <td colSpan={6} style={{ background: 'var(--surface-2,#f9fafb)' }}>
                        <Timeline id={a.id} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
