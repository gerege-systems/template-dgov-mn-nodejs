"use client";

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Plus, X, Inbox, Loader2 } from 'lucide-react';
import { getJSON, postJSON } from '@/lib/client';
import type { GovAppointment, GovService } from '@/lib/govTypes';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loading, fmtDateTime } from './govShared';

const STATUS_LABEL: Record<string, string> = {
  booked: 'Захиалсан', confirmed: 'Баталгаажсан', cancelled: 'Цуцалсан', completed: 'Дууссан',
};

export default function GovAppointmentsView() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [serviceId, setServiceId] = useState('');
  const [when, setWhen] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const apptQ = useQuery({ queryKey: ['gov-appointments'], queryFn: () => getJSON<GovAppointment[]>('/api/gov/appointments') });
  const svcQ = useQuery({ queryKey: ['gov-services'], queryFn: () => getJSON<GovService[]>('/api/gov/services') });
  const items = apptQ.data ?? [];
  const services = svcQ.data ?? [];

  const book = async () => {
    if (!when) { setErr('Огноо цагаа сонгоно уу.'); return; }
    setBusy(true); setErr('');
    const res = await postJSON('/api/gov/appointments', {
      service_id: serviceId || undefined,
      scheduled_at: new Date(when).toISOString(),
      location,
    });
    setBusy(false);
    if (res.ok) {
      setAdding(false); setServiceId(''); setWhen(''); setLocation('');
      await qc.invalidateQueries({ queryKey: ['gov-appointments'] });
    } else setErr(res.message || 'Цаг захиалахад алдаа гарлаа.');
  };

  const cancel = async (a: GovAppointment) => {
    if (!window.confirm('Цаг захиалгыг цуцлах уу?')) return;
    setErr('');
    const res = await postJSON(`/api/gov/appointments/${a.id}/cancel`, {});
    if (res.ok) await qc.invalidateQueries({ queryKey: ['gov-appointments'] });
    else setErr(res.message || 'Цуцлахад алдаа гарлаа.');
  };

  return (
    <>
      {err && <div className="alert alert--danger" role="alert" style={{ marginBottom: 14 }}>{err}</div>}

      <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'flex-end' }}>
        {/* Товч нь toggle биш — үргэлж "Цаг захиалах" бөгөөд popup нээнэ. */}
        <button className="btn btn--primary" type="button" onClick={() => setAdding(true)}>
          <Plus size={16} /> Цаг захиалах
        </button>
      </div>

      {/* Шинэ цаг захиалгын форм нь popup дотор. */}
      <Dialog open={adding} onOpenChange={(o) => { if (!o) setAdding(false); }}>
        <DialogContent style={{ maxWidth: 720 }}>
          <DialogHeader>
            <DialogTitle>
              <CalendarClock size={18} style={{ color: 'var(--dan-blue-text)' }} /> Шинэ цаг захиалга
            </DialogTitle>
          </DialogHeader>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 12 }}>
            <label>Үйлчилгээ (сонголттой)
              <select className="input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">— Сонгох —</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>Огноо, цаг<input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
            <label>Байршил<input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Дүүрэг, хороо" /></label>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--primary" type="button" onClick={book} disabled={busy || !when}>
              {busy ? <><Loader2 size={16} className="spin" /> Захиалж буй…</> : 'Захиалах'}
            </button>
            <button className="btn btn--secondary" type="button" onClick={() => setAdding(false)}>
              <X size={16} /> Болих
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {apptQ.isPending && <Loading />}
      {!apptQ.isPending && items.length === 0 && (
        <div className="card" style={{ padding: 24 }}><p className="muted"><Inbox size={15} /> Цаг захиалга алга.</p></div>
      )}
      {items.length > 0 && (
        <div className="card users-table-wrap" style={{ margin: 0 }}>
          <table className="users-table">
            <thead><tr><th>Үйлчилгээ</th><th>Байгууллага</th><th>Огноо, цаг</th><th>Төлөв</th><th aria-label="actions" /></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td data-label="Үйлчилгээ">{a.service_name || '—'}</td>
                  <td data-label="Байгууллага">{a.agency || '—'}<div className="muted" style={{ fontSize: 12 }}>{a.location}</div></td>
                  <td className="mono" data-label="Огноо, цаг">{fmtDateTime(a.scheduled_at)}</td>
                  <td data-label="Төлөв">
                    <span className={`chip ${a.status === 'cancelled' ? 'chip--danger' : a.status === 'completed' ? 'chip--neutral' : 'chip--success'}`}>
                      {STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </td>
                  <td className="users-table__actions">
                    {(a.status === 'booked' || a.status === 'confirmed') && (
                      <button className="btn btn--ghost btn--sm" type="button" title="Цуцлах" onClick={() => cancel(a)}><X size={14} /></button>
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
