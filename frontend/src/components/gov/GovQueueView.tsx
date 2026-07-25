"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Inbox, AlertTriangle, Timer, UserCheck, CheckCircle2, XCircle,
  HelpCircle, PackageCheck, Scale, FileText,
} from 'lucide-react';
import { getJSON, postJSON } from '@/lib/client';
import type { GovQueueStats, GovQueueItem, GovQueueDetail } from '@/lib/govTypes';
import { ApplicationStatus, DueChip, Loading, EmptyRow, fmtDateTime } from './govShared';

const POLL_MS = 10_000;

type Tab = 'unassigned' | 'mine' | 'overdue' | 'all';

const TABS: { key: Tab; label: string }[] = [
  { key: 'unassigned', label: 'Хуваарилаагүй' },
  { key: 'mine', label: 'Миний' },
  { key: 'overdue', label: 'Хугацаа хэтэрсэн' },
  { key: 'all', label: 'Бүгд' },
];

function StatCard({ icon, value, label, tone }: { icon: React.ReactNode; value: React.ReactNode; label: string; tone?: string }) {
  return (
    <div className="card stat-card" style={{ margin: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: tone ?? 'var(--dan-blue-text)' }}>{icon}</div>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  );
}

// queryFor нь табыг backend-ийн шүүлтүүр болгоно. 'unassigned' нь backend-д
// тусдаа шүүлтгүй тул клиент талд ялгана (нээлттэй + хариуцагчгүй).
function queryFor(tab: Tab): string {
  switch (tab) {
    case 'mine': return '?assigned_to=me';
    case 'overdue': return '?overdue=true';
    default: return '';
  }
}

export default function GovQueueView() {
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<Tab>('unassigned');
  const [openID, setOpenID] = React.useState<string | null>(null);
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const stats = useQuery({
    queryKey: ['gov-queue-stats'],
    queryFn: () => getJSON<GovQueueStats>('/api/gov/officer/stats'),
    refetchInterval: POLL_MS,
  });

  const queue = useQuery({
    queryKey: ['gov-queue', tab],
    queryFn: () => getJSON<GovQueueItem[]>(`/api/gov/officer/queue${queryFor(tab)}`),
    refetchInterval: POLL_MS,
  });

  const detail = useQuery({
    queryKey: ['gov-queue-item', openID],
    queryFn: () => getJSON<GovQueueDetail>(`/api/gov/officer/queue/${openID}`),
    enabled: !!openID,
  });

  const rows = React.useMemo(() => {
    const list = queue.data ?? [];
    return tab === 'unassigned' ? list.filter((a) => !a.assigned) : list;
  }, [queue.data, tab]);

  // act нь дарааллын үйлдлүүдийг нэг замаар гүйцэтгэнэ: алдааг харуулж,
  // амжилттай бол холбогдох бүх query-г шинэчилнэ.
  async function act(id: string, action: string, body?: unknown) {
    setBusy(true);
    setErr('');
    // postJSON нь throw хийдэггүй, ok=false буцаадаг — тиймээс ЗААВАЛ шалгана.
    // Эс тэгвээс 409 (өөр менежер аль хэдийн авсан) чимээгүй өнгөрч, UI
    // амжилттай мэт харагдана.
    const res = await postJSON(`/api/gov/officer/queue/${id}/${action}`, body ?? {});
    if (!res.ok) {
      setErr(res.message || 'Үйлдэл амжилтгүй боллоо.');
      setBusy(false);
      // Зөрчил гарсан бол дараалал хуучирсан байх магадлалтай — сэргээнэ.
      await qc.invalidateQueries({ queryKey: ['gov-queue'] });
      return;
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['gov-queue'] }),
      qc.invalidateQueries({ queryKey: ['gov-queue-stats'] }),
      qc.invalidateQueries({ queryKey: ['gov-queue-item', id] }),
    ]);
    setBusy(false);
  }

  async function decide(id: string, approve: boolean) {
    // Татгалзах үндэслэлийг backend ЗААВАЛ шаарддаг — иргэн юунд татгалзсаныг
    // мэдэж, гомдол гаргах эрхтэй. Тиймээс хоосон бол илгээхгүй.
    let note = '';
    if (!approve) {
      note = window.prompt('Татгалзах үндэслэлийг бичнэ үү (заавал):') ?? '';
      if (!note.trim()) return;
    }
    await act(id, 'decide', { approve, note });
  }

  async function requestInfo(id: string) {
    const note = window.prompt('Ямар мэдээлэл дутуу байгааг бичнэ үү:') ?? '';
    if (!note.trim()) return;
    await act(id, 'request-info', { note });
  }

  const s = stats.data;

  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <StatCard icon={<Inbox size={16} />} value={s?.open ?? '—'} label="Нээлттэй" />
        <StatCard icon={<Timer size={16} />} value={s?.unassigned ?? '—'} label="Хуваарилаагүй" />
        <StatCard icon={<UserCheck size={16} />} value={s?.mine ?? '—'} label="Миний хариуцсан" />
        <StatCard
          icon={<AlertTriangle size={16} />}
          value={s?.overdue ?? '—'}
          label="Хугацаа хэтэрсэн"
          tone="var(--danger,#dc2626)"
        />
        <StatCard
          icon={<Timer size={16} />}
          value={s?.due_soon ?? '—'}
          label="24 цагт дуусах"
          tone="var(--warning,#d97706)"
        />
      </div>

      <div className="card">
        <div className="tabs" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`btn ${tab === t.key ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => { setTab(t.key); setOpenID(null); }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {err && <div className="alert alert--danger" style={{ marginBottom: 12 }}>{err}</div>}

        {queue.isLoading ? <Loading /> : rows.length === 0 ? (
          <EmptyRow text="Энэ ангилалд хүсэлт байхгүй байна." />
        ) : (
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Лавлах №</th>
                  <th>Үйлчилгээ</th>
                  <th>Төлөв</th>
                  <th>Хугацаа</th>
                  <th>Илгээсэн</th>
                  <th style={{ textAlign: 'right' }}>Үйлдэл</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <button
                        type="button"
                        className="btn btn--link"
                        onClick={() => setOpenID(openID === a.id ? null : a.id)}
                      >
                        {a.reference_no}
                      </button>
                    </td>
                    <td>
                      <div>{a.service_name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{a.service_code}</div>
                    </td>
                    <td><ApplicationStatus status={a.status} /></td>
                    <td><DueChip dueAt={a.due_at} suspended={a.suspended} /></td>
                    <td className="muted">{fmtDateTime(a.submitted_at)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {!a.assigned && (
                        <button type="button" className="btn btn--ghost" disabled={busy}
                          onClick={() => act(a.id, 'assign')}>
                          <UserCheck size={14} /> Авах
                        </button>
                      )}
                      {a.status === 'approved' && (
                        <button type="button" className="btn btn--primary" disabled={busy}
                          onClick={() => act(a.id, 'complete')}>
                          <PackageCheck size={14} /> Хүргэсэн
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openID && (
        <div className="card" style={{ marginTop: 16 }}>
          {detail.isLoading || !detail.data ? <Loading /> : (
            <QueueDetail
              detail={detail.data}
              busy={busy}
              onDecide={(ok) => decide(openID, ok)}
              onRequestInfo={() => requestInfo(openID)}
            />
          )}
        </div>
      )}
    </>
  );
}

function QueueDetail({
  detail, busy, onDecide, onRequestInfo,
}: {
  detail: GovQueueDetail;
  busy: boolean;
  onDecide: (approve: boolean) => void;
  onRequestInfo: () => void;
}) {
  const { application: a, service: svc, events } = detail;
  const decidable = ['registered', 'in_review', 'info_required'].includes(a.status);

  return (
    <>
      <h3 style={{ marginTop: 0 }}>{a.service_name}</h3>

      <div className="defrow"><span className="defrow__key">Лавлах №</span><span className="defrow__value">{a.reference_no}</span></div>
      <div className="defrow"><span className="defrow__key">Төлөв</span><span className="defrow__value"><ApplicationStatus status={a.status} /></span></div>
      <div className="defrow"><span className="defrow__key">Хугацаа</span><span className="defrow__value"><DueChip dueAt={a.due_at} suspended={a.suspended} /></span></div>
      {a.note && <div className="defrow"><span className="defrow__key">Иргэний тайлбар</span><span className="defrow__value">{a.note}</span></div>}
      {a.decision_note && <div className="defrow"><span className="defrow__key">Шийдвэрийн тэмдэглэл</span><span className="defrow__value">{a.decision_note}</span></div>}

      {svc && (
        <>
          <h4 style={{ marginTop: 20 }}><Scale size={15} /> Үйлчилгээний үндэслэл</h4>
          <div className="defrow"><span className="defrow__key">Код</span><span className="defrow__value">{svc.code}</span></div>
          <div className="defrow"><span className="defrow__key">COFOG</span><span className="defrow__value">{svc.cofog_code} — {svc.cofog_label}</span></div>
          {svc.sdg_code && <div className="defrow"><span className="defrow__key">SDG процедур</span><span className="defrow__value">{svc.sdg_code}</span></div>}
          <div className="defrow"><span className="defrow__key">Гаралт</span><span className="defrow__value">{svc.output_type}</span></div>
          <div className="defrow"><span className="defrow__key">Эрх зүйн үндэслэл</span><span className="defrow__value">{svc.legal_basis || '—'}</span></div>
          {svc.evidence.length > 0 && (
            <div className="defrow">
              <span className="defrow__key"><FileText size={14} /> Шаардах баримт</span>
              <span className="defrow__value">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {svc.evidence.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </span>
            </div>
          )}
        </>
      )}

      <h4 style={{ marginTop: 20 }}>Явцын түүх</h4>
      {events.length === 0 ? <EmptyRow text="Бичлэг алга." /> : (
        <ul className="timeline" style={{ margin: 0, paddingLeft: 18 }}>
          {events.map((e) => (
            <li key={e.id} style={{ marginBottom: 6 }}>
              <span className="muted" style={{ fontSize: 12 }}>{fmtDateTime(e.created_at)}</span>
              {' — '}
              <strong>{e.type}</strong>
              {e.detail && <> · {e.detail}</>}
              <span className="muted" style={{ fontSize: 12 }}> ({e.actor_role})</span>
            </li>
          ))}
        </ul>
      )}

      {decidable && (
        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => onDecide(true)}>
            <CheckCircle2 size={15} /> Зөвшөөрөх
          </button>
          <button type="button" className="btn btn--danger" disabled={busy} onClick={() => onDecide(false)}>
            <XCircle size={15} /> Татгалзах
          </button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onRequestInfo}>
            <HelpCircle size={15} /> Нэмэлт мэдээлэл хүсэх
          </button>
        </div>
      )}
    </>
  );
}
