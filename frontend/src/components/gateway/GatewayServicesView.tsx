"use client";

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Power, Inbox, X, Pencil } from 'lucide-react';
import { getJSON, sendJSON } from '@/lib/client';
import type { GwService } from '@/lib/gatewayTypes';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loading, EnabledChip, Tags, splitList } from './gwShared';

const empty = { name: '', protocol: 'https', host: '', port: 443, path: '/', tags: '' };

// upstreamURL нь default портыг (https→443, http→80) харуулахгүй — эдгээр нь
// протоколын анхдагч тул илүүц.
function upstreamURL(protocol: string, host: string, port: number, path: string): string {
  const isDefault = (protocol === 'https' && port === 443) || (protocol === 'http' && port === 80);
  return `${protocol}://${host}${isDefault ? '' : `:${port}`}${path}`;
}

export default function GatewayServicesView() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editSvc, setEditSvc] = useState<GwService | null>(null);
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState('');

  const q = useQuery({ queryKey: ['gw-services'], queryFn: () => getJSON<GwService[]>('/api/gateway/services') });
  const items = q.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['gw-services'] });

  const closeForm = () => { setAdding(false); setEditSvc(null); setForm(empty); };

  const openEdit = (s: GwService) => {
    setEditSvc(s);
    setForm({ name: s.name, protocol: s.protocol, host: s.host, port: s.port, path: s.path, tags: s.tags.join(', ') });
    setAdding(true);
  };

  // save нь editSvc байвал PUT (засах), эс бөгөөс POST (үүсгэх). retries/timeout-ыг
  // засварын үед хадгална (формд байхгүй тул анхны утгаас).
  const save = async () => {
    setErr('');
    const body = {
      name: form.name, protocol: form.protocol, host: form.host,
      port: Number(form.port) || 0, path: form.path, tags: splitList(form.tags),
      retries: editSvc?.retries, connect_timeout_ms: editSvc?.connect_timeout_ms,
      enabled: editSvc ? editSvc.enabled : true,
    };
    const res = editSvc
      ? await sendJSON(`/api/gateway/services/${editSvc.id}`, 'PUT', body)
      : await sendJSON('/api/gateway/services', 'POST', body);
    if (res.ok) { closeForm(); await refresh(); }
    else setErr(res.message || (editSvc ? 'Шинэчлэхэд алдаа гарлаа.' : 'Үүсгэхэд алдаа гарлаа.'));
  };

  const toggle = async (s: GwService) => {
    setErr('');
    const res = await sendJSON(`/api/gateway/services/${s.id}`, 'PUT', {
      name: s.name, protocol: s.protocol, host: s.host, port: s.port, path: s.path,
      retries: s.retries, connect_timeout_ms: s.connect_timeout_ms, tags: s.tags, enabled: !s.enabled,
    });
    if (res.ok) await refresh(); else setErr(res.message || 'Шинэчлэхэд алдаа гарлаа.');
  };

  const remove = async (s: GwService) => {
    if (!window.confirm(`"${s.name}" сервисийг устгах уу? Холбоотой маршрутууд мөн устана.`)) return;
    setErr('');
    const res = await sendJSON(`/api/gateway/services/${s.id}`, 'DELETE');
    if (res.ok) await refresh(); else setErr(res.message || 'Устгахад алдаа гарлаа.');
  };

  return (
    <>
      {err && <div className="alert alert--danger" role="alert">{err}</div>}

      <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => { setEditSvc(null); setForm(empty); setAdding(true); }}>
          <Plus size={14} /> Сервис нэмэх
        </button>
      </div>

      {/* Нэмэх/засах форм нь popup — editSvc-ээс хамаарч гарчиг болон POST/PUT шийдэгдэнэ. */}
      <Dialog open={adding} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent style={{ maxWidth: 720 }}>
          <DialogHeader><DialogTitle>{editSvc ? 'Сервис засах' : 'Шинэ сервис'}</DialogTitle></DialogHeader>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12 }}>
            <label>Нэр<input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="payments" /></label>
            <label>Протокол
              <select className="input" value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })}>
                <option value="https">https</option><option value="http">http</option>
              </select>
            </label>
            <label>Host<input className="input" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="api.example.com" /></label>
            <label>Port<input className="input" type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} /></label>
            <label>Зам<input className="input" value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} placeholder="/v1" /></label>
            <label>Tag (зай/таслалаар)<input className="input" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="billing, core" /></label>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--primary btn--sm" type="button" onClick={save} disabled={!form.name || !form.host}>Хадгалах</button>
            <button className="btn btn--ghost btn--sm" type="button" onClick={closeForm}><X size={14} /> Болих</button>
          </div>
        </DialogContent>
      </Dialog>

      {q.isPending && <Loading />}
      {!q.isPending && items.length === 0 && (
        <div className="card" style={{ padding: 24 }}><p className="muted"><Inbox size={15} /> Сервис алга. Эхний сервисээ нэмнэ үү.</p></div>
      )}

      {items.length > 0 && (
        <div className="card users-table-wrap">
          <table className="users-table">
            <thead><tr><th>Нэр</th><th>Upstream</th><th>Tag</th><th>Төлөв</th><th aria-label="actions" /></tr></thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td data-label="Нэр">{s.name}</td>
                  <td className="mono" data-label="Upstream">{upstreamURL(s.protocol, s.host, s.port, s.path)}</td>
                  <td data-label="Tag"><Tags tags={s.tags} /></td>
                  <td data-label="Төлөв"><EnabledChip enabled={s.enabled} /></td>
                  <td className="users-table__actions">
                    <button className="btn btn--ghost btn--sm" type="button" title="Засах" onClick={() => openEdit(s)}><Pencil size={14} /></button>
                    <button className="btn btn--ghost btn--sm" type="button" title={s.enabled ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'} onClick={() => toggle(s)}><Power size={14} /></button>
                    <button className="btn btn--ghost btn--sm" type="button" title="Устгах" onClick={() => remove(s)}><Trash2 size={14} /></button>
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
