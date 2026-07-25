"use client";

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Plus, Trash2, X } from 'lucide-react';
import { useT } from '@/lib/lang';
import { getJSON, sendJSON } from '@/lib/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Role {
  id: number;
  key: string;
  name: string;
  description: string;
  is_system: boolean;
  permissions: string[];
}
interface Permission {
  key: string;
  label: string;
  category: string;
}

const ADMIN_KEY = 'admin';
// superadmin нь RBAC матрицаас гадуур удирддаг дээд эрх (бүх зүйлийг автоматаар
// авдаг, энэ дэлгэцээс permission онооход хамаарахгүй) тул баганаас нь нуудаг.
const SUPERADMIN_KEY = 'superadmin';

export default function RolesManager() {
  const { T, tRole, tPerm } = useT();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<number, Set<string>>>({});
  const [actionError, setActionError] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', key: '' });

  const rolesQuery = useQuery({
    queryKey: ['rbac-roles-full'],
    queryFn: () => getJSON<Role[]>('/api/rbac/roles'),
  });
  const permsQuery = useQuery({
    queryKey: ['rbac-permissions'],
    queryFn: () => getJSON<Permission[]>('/api/rbac/permissions'),
  });

  const roles = rolesQuery.data ?? null;
  const perms = permsQuery.data ?? [];
  const error = actionError || (rolesQuery.isError ? (rolesQuery.error as Error).message || T('roles.loadError') : '');

  // Draft checkbox төлвийг сервер дээрх жагсаалтаас (дахин) угсарна.
  useEffect(() => {
    if (!rolesQuery.data) return;
    const d: Record<number, Set<string>> = {};
    for (const r of rolesQuery.data) d[r.id] = new Set(r.permissions);
    setDraft(d);
  }, [rolesQuery.data]);

  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: ['rbac-roles-full'] });
    await queryClient.invalidateQueries({ queryKey: ['rbac-roles'] });
  };

  const toggle = (roleId: number, key: string) => {
    setDraft((prev) => {
      const next = new Set(prev[roleId] ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, [roleId]: next };
    });
  };

  const save = async (role: Role) => {
    setSavingId(role.id);
    setActionError('');
    const res = await sendJSON(`/api/rbac/roles/${role.id}/permissions`, 'PUT', {
      permissions: Array.from(draft[role.id] ?? []),
    });
    if (res.ok) await reload();
    else setActionError(res.message || T('roles.saveError'));
    setSavingId(null);
  };

  const createRole = async () => {
    if (!form.name.trim()) return;
    setActionError('');
    const res = await sendJSON('/api/rbac/roles', 'POST', { name: form.name, key: form.key });
    if (res.ok) {
      setAdding(false);
      setForm({ name: '', key: '' });
      await reload();
    } else setActionError(res.message || T('roles.createError'));
  };

  const remove = async (role: Role) => {
    if (!window.confirm(`${role.name} — ${T('roles.deleteConfirm')}`)) return;
    setActionError('');
    const res = await sendJSON(`/api/rbac/roles/${role.id}`, 'DELETE');
    if (res.ok) await reload();
    else setActionError(res.message || T('roles.deleteError'));
  };

  // superadmin баганыг матрицаас хасна (permission нь энэ дэлгэцээр удирддаггүй).
  const visibleRoles = (roles ?? []).filter((r) => r.key !== SUPERADMIN_KEY);

  if (roles === null) {
    return (
      <div className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 16 }}>
        <Loader2 size={16} strokeWidth={2} className="spin" />
        <span>{T('users.loading')}</span>
      </div>
    );
  }

  return (
    <div>
      {error && <div className="alert alert--danger" role="alert">{error}</div>}

      <div className="users__head">
        <button className="btn btn--primary" type="button" onClick={() => { setAdding(true); setActionError(''); }}>
          <Plus size={16} strokeWidth={2} />
          <span>{T('roles.add')}</span>
        </button>
      </div>

      {/* Дүр нэмэх форм нь popup болов — товч нь зөвхөн нээх үүрэгтэй. */}
      <Dialog open={adding} onOpenChange={(o) => { if (!o) setAdding(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{T('roles.add')}</DialogTitle></DialogHeader>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="field">
              <label className="field__label" htmlFor="r-name">{T('roles.name')}</label>
              <input id="r-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={T('roles.namePh')} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="r-key">{T('roles.key')}</label>
              <input id="r-key" className="input mono" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="sales_manager" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary" type="button" onClick={createRole}><Save size={16} strokeWidth={2} /><span>{T('common.create')}</span></button>
              <button className="btn btn--secondary" type="button" onClick={() => setAdding(false)}><X size={16} strokeWidth={2} /><span>{T('common.cancel')}</span></button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="rbac-matrix">
          <thead>
            <tr>
              <th>{T('roles.col.permission')}</th>
              {visibleRoles.map((r) => <th key={r.id}>{tRole(r.key, r.name)}</th>)}
            </tr>
          </thead>
          <tbody>
            {perms.map((p) => (
              <tr key={p.key}>
                <td>
                  <span className="rbac-perm-label">
                    {tPerm(p.key, p.label)}
                    <small className="mono">{p.key}</small>
                  </span>
                </td>
                {visibleRoles.map((r) => {
                  const isAdmin = r.key === ADMIN_KEY;
                  const checked = isAdmin || (draft[r.id]?.has(p.key) ?? false);
                  return (
                    <td key={r.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isAdmin}
                        onChange={() => toggle(r.id, p.key)}
                        aria-label={`${tRole(r.key, r.name)}: ${tPerm(p.key, p.label)}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td />
              {visibleRoles.map((r) => (
                <td key={r.id}>
                  {r.key !== ADMIN_KEY && (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button className="btn btn--primary btn--sm" type="button" onClick={() => save(r)} disabled={savingId === r.id} title={T('common.save')}>
                        {savingId === r.id ? <Loader2 size={13} strokeWidth={2} className="spin" /> : <Save size={13} strokeWidth={2} />}
                      </button>
                      {!r.is_system && (
                        <button className="btn btn--ghost btn--sm" type="button" onClick={() => remove(r)} title={T('common.delete')}>
                          <Trash2 size={13} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
