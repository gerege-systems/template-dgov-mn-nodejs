"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Save, X, Building2, ChevronRight } from 'lucide-react';
import { useT } from '@/lib/lang';
import type { DictKey } from '@/lib/i18n';
import { getJSON, postJSON } from '@/lib/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Дүрийн орчуулгын түлхүүр: owner → org.roleOwner г.м.
function roleKey(role: string): DictKey {
  switch (role) {
    case 'owner': return 'org.roleOwner';
    case 'admin': return 'org.roleAdmin';
    default: return 'org.roleMember';
  }
}

interface Organization {
  id: string;
  reg_no: string;
  name: string;
  name_latin?: string;
  role?: string;
  created_at: string;
}

export default function OrgList() {
  const { T, lang } = useT();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ reg_no: '', name: '', name_latin: '' });
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);

  const orgsQuery = useQuery({
    queryKey: ['orgs'],
    queryFn: () => getJSON<Organization[]>('/api/org'),
  });

  const items = orgsQuery.data ?? null;
  const error = actionError || (orgsQuery.isError ? (orgsQuery.error as Error).message || T('org.loadError') : '');

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'mn-MN', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const create = async () => {
    if (!form.reg_no.trim() || !form.name.trim()) return;
    setSaving(true);
    setActionError('');
    const res = await postJSON('/api/org', {
      reg_no: form.reg_no.trim(),
      name: form.name.trim(),
      name_latin: form.name_latin.trim() || undefined,
    });
    if (res.ok) {
      setAdding(false);
      setForm({ reg_no: '', name: '', name_latin: '' });
      await queryClient.invalidateQueries({ queryKey: ['orgs'] });
    } else {
      setActionError(res.message || T('org.createError'));
    }
    setSaving(false);
  };

  return (
    <div className="orgs">
      {error && <div className="alert alert--danger" role="alert">{error}</div>}

      {/* Товч нь toggle биш — үргэлж харагдаж, popup нээнэ. */}
      <div className="users__head">
        <button className="btn btn--primary" type="button" onClick={() => { setAdding(true); setActionError(''); }}>
          <Plus size={16} strokeWidth={2} />
          <span>{T('org.create')}</span>
        </button>
      </div>

      {/* Байгууллага нэмэх форм нь popup дотор. */}
      <Dialog open={adding} onOpenChange={(o) => { if (!o) setAdding(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{T('org.create')}</DialogTitle></DialogHeader>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="field">
              <label className="field__label" htmlFor="o-reg">{T('org.regNo')}</label>
              <input id="o-reg" className="input mono" value={form.reg_no} onChange={(e) => setForm({ ...form, reg_no: e.target.value })} placeholder={T('org.regNoPh')} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="o-name">{T('org.name')}</label>
              <input id="o-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={T('org.namePh')} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="o-name-latin">{T('org.nameLatin')}</label>
              <input id="o-name-latin" className="input" value={form.name_latin} onChange={(e) => setForm({ ...form, name_latin: e.target.value })} placeholder={T('org.nameLatinPh')} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary" type="button" onClick={create} disabled={saving}>
                {saving ? <Loader2 size={16} strokeWidth={2} className="spin" /> : <Save size={16} strokeWidth={2} />}
                <span>{T('common.create')}</span>
              </button>
              <button className="btn btn--secondary" type="button" onClick={() => setAdding(false)}>
                <X size={16} strokeWidth={2} /><span>{T('common.cancel')}</span>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {orgsQuery.isPending && (
        <div className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 16 }}>
          <Loader2 size={16} strokeWidth={2} className="spin" />
          <span>{T('users.loading')}</span>
        </div>
      )}

      {items !== null && items.length === 0 && !error && (
        <div className="card" style={{ padding: 24 }}><p className="muted">{T('org.empty')}</p></div>
      )}

      {items !== null && items.length > 0 && (
        <div className="card users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>{T('org.name')}</th>
                <th>{T('org.regNo')}</th>
                <th>{T('org.role')}</th>
                <th>{T('org.created')}</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <td data-label={T('org.name')}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Building2 size={16} strokeWidth={2} />
                      {lang === 'en' ? (o.name_latin?.trim() || o.name) : o.name}
                    </span>
                  </td>
                  <td className="mono" data-label={T('org.regNo')}>{o.reg_no}</td>
                  <td data-label={T('org.role')}>{o.role ? T(roleKey(o.role)) : '—'}</td>
                  <td className="mono" data-label={T('org.created')}>{fmtDate(o.created_at)}</td>
                  <td className="users-table__actions">
                    <Link className="btn btn--ghost btn--sm" href={`/me/organizations/${o.id}`} title={T('org.detail')}>
                      <ChevronRight size={14} strokeWidth={2} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
