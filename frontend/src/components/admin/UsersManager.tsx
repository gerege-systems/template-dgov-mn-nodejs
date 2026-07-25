"use client";

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Loader2, Check, Ban, ChevronLeft, ChevronRight, UserPlus, X, Search } from 'lucide-react';
import { useT } from '@/lib/lang';
import { getJSON, sendJSON } from '@/lib/client';
import { ROLE_SUPERADMIN, ROLE_ADMIN, ROLE_USER, isSuperAdmin } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

interface AdminUser {
  id: string;
  username: string;
  full_name?: string;
  full_name_en?: string;
  email: string;
  role_id: number;
  active: boolean;
  created_at: string;
}
interface RoleItem {
  id: number;
  key: string;
  name: string;
}

// Core (core.gerege.mn) /api/user/find-ийн хариу (шаардлагатай талбарууд).
interface CoreCitizen {
  id?: string | number;
  reg_no?: string;
  last_name?: string;
  first_name?: string;
  family_name?: string;
  message?: string;
}

interface Props {
  currentUserId: string;
  /** Нэвтэрсэн хэрэглэгчийн role — admin эрхийг зөвхөн super admin олгоно. */
  currentUserRoleId: number;
  /** readOnly бол зөвхөн харах горим. */
  readOnly?: boolean;
}

// Server-side pagination — backend /admin/users нь offset/limit дэмждэг
// (хамгийн ихдээ 200). total тоо буцаадаггүй тул "дараах" товчийг буцсан
// мөрийн тоо хуудасны хэмжээнээс бага үед идэвхгүй болгоно.
const PAGE_SIZE = 50;

export default function UsersManager({ currentUserId, currentUserRoleId, readOnly = false }: Props) {
  const { T, lang, tRole } = useT();
  // Admin эрхийг зөвхөн super admin олгож/хасна (backend users.UpdateRole ч
  // хаадаг) — энгийн admin нь зөвхөн manager ↔ user л сольж чадна.
  const callerIsSuperAdmin = isSuperAdmin(currentUserRoleId);
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [actionError, setActionError] = useState('');

  // "Хэрэглэгч нэмэх" модал — регистрийн дугаараар Core (core.gerege.mn)-оос
  // иргэнийг татаж (нэрийг гараар оруулахгүй), role оноож урьдчилан бүртгэнэ.
  const [adding, setAdding] = useState(false);
  const [register, setRegister] = useState('');
  const [roleId, setRoleId] = useState<number>(ROLE_USER);
  const [citizen, setCitizen] = useState<CoreCitizen | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);

  const usersQuery = useQuery({
    queryKey: ['admin-users', page],
    queryFn: () => getJSON<AdminUser[]>(`/api/admin/users?offset=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`),
  });
  const rolesQuery = useQuery({
    queryKey: ['rbac-roles'],
    queryFn: () => getJSON<RoleItem[]>('/api/rbac/roles'),
  });

  const items = usersQuery.data ?? null;
  const roles = rolesQuery.data ?? [];
  const loadError = usersQuery.isError ? (usersQuery.error as Error).message || T('users.loadError') : '';
  const error = actionError || loadError;

  const mutate = async (url: string, method: 'PUT' | 'DELETE', body?: unknown) => {
    setActionError('');
    const res = await sendJSON(url, method, body);
    if (res.ok) {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } else {
      setActionError(res.message || T('users.actionError'));
    }
  };

  const openAdd = () => {
    setRegister(''); setRoleId(ROLE_USER); setCitizen(null); setAddError(''); setAdding(true);
  };

  // Регистрийн дугаараар Core-оос иргэнийг татна (нэрийг гараар оруулахгүй).
  const lookup = async () => {
    const text = register.trim();
    if (!text) return;
    setLookingUp(true); setAddError(''); setCitizen(null);
    try {
      const data = await getJSON<CoreCitizen>(`/api/core/users?search_text=${encodeURIComponent(text)}`);
      if (data && data.id != null) setCitizen(data);
      else setAddError((data && typeof data.message === 'string' ? data.message : '') || T('users.notFound'));
    } catch (e) {
      setAddError((e as Error).message || T('users.lookupError'));
    } finally {
      setLookingUp(false);
    }
  };

  const submitAdd = async () => {
    if (!citizen) return;
    setAddError('');
    setSaving(true);
    // Нэр нь Core-оос ирнэ; иргэн эхлээд SSO-оор нэвтэрхэд SSO-гийн нэрээр
    // шинэчлэгдэнэ. register нь Core-ийн reg_no (эрх бүхий эх сурвалж).
    const res = await sendJSON('/api/admin/users', 'POST', {
      register: String(citizen.reg_no ?? register).trim(),
      first_name: citizen.first_name ? String(citizen.first_name) : undefined,
      last_name: citizen.last_name ? String(citizen.last_name) : undefined,
      role_id: roleId,
    });
    setSaving(false);
    if (res.ok) {
      setAdding(false);
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } else {
      setAddError(res.message || T('users.addError'));
    }
  };

  const changeRole = (id: string, roleId: number) => mutate(`/api/admin/users/${id}/role`, 'PUT', { role_id: roleId });
  const toggleActive = (u: AdminUser) => mutate(`/api/admin/users/${u.id}/active`, 'PUT', { active: !u.active });
  const remove = (id: string) => {
    if (!window.confirm(T('users.deleteConfirm'))) return;
    void mutate(`/api/admin/users/${id}`, 'DELETE');
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'mn-MN', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const hasPrev = page > 0;
  const hasNext = (items?.length ?? 0) === PAGE_SIZE;

  return (
    <div className="users">
      {error && <div className="alert alert--danger" role="alert">{error}</div>}

      {!readOnly && (
        <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn--primary btn--sm" type="button" onClick={openAdd}>
            <UserPlus size={14} strokeWidth={2} /> {T('users.add')}
          </button>
        </div>
      )}

      {/* Иргэнийг регистрээр урьдчилан бүртгэх — хаалттай горимд нэвтрэх
          боломжтой болгоно. */}
      <Dialog open={adding} onOpenChange={(o) => { if (!o) setAdding(false); }}>
        <DialogContent style={{ maxWidth: 560 }}>
          <DialogHeader><DialogTitle>{T('users.addTitle')}</DialogTitle></DialogHeader>

          {addError && <div className="alert alert--danger" role="alert">{addError}</div>}

          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{T('users.addHint')}</p>

          <label style={{ display: 'block' }}>{T('users.register')}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input
                className="input mono"
                value={register}
                onChange={(e) => { setRegister(e.target.value); setCitizen(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void lookup(); } }}
                placeholder={T('users.registerPlaceholder')}
                style={{ flex: 1 }}
              />
              <button className="btn btn--secondary btn--sm" type="button" onClick={lookup} disabled={lookingUp || !register.trim()}>
                {lookingUp ? <Loader2 size={14} strokeWidth={2} className="spin" /> : <Search size={14} strokeWidth={2} />}
                <span>{T('users.lookup')}</span>
              </button>
            </div>
          </label>

          {/* Core-оос татсан иргэн — нэрийг гараар оруулахгүй, зөвхөн батламжлана. */}
          {citizen && (
            <div className="card" style={{ padding: 14, marginTop: 12, background: 'var(--surface-2)' }}>
              <div style={{ fontWeight: 600 }}>{String(citizen.last_name ?? '')} {String(citizen.first_name ?? '')}</div>
              <div className="muted mono" style={{ fontSize: 12, marginTop: 2 }}>
                {String(citizen.reg_no ?? register).toUpperCase()}
                {citizen.family_name ? ` · ${T('users.familyName')}: ${String(citizen.family_name)}` : ''}
              </div>
            </div>
          )}

          <label style={{ display: 'block', marginTop: 12 }}>{T('users.col.role')}
            <select
              className="input"
              value={roleId}
              onChange={(e) => setRoleId(Number(e.target.value))}
            >
              {roles
                // superadmin-ыг хэзээ ч санал болгохгүй; admin-ыг зөвхөн super
                // admin-д (backend 403 өгдөгтэй нийцүүлэв).
                .filter((r) => r.id !== ROLE_SUPERADMIN)
                .filter((r) => r.id !== ROLE_ADMIN || callerIsSuperAdmin)
                .map((r) => <option key={r.id} value={r.id}>{tRole(r.key, r.name)}</option>)}
            </select>
          </label>

          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--primary btn--sm" type="button" onClick={submitAdd} disabled={saving || !citizen}>
              {saving ? <Loader2 size={14} strokeWidth={2} className="spin" /> : <UserPlus size={14} strokeWidth={2} />}
              <span>{T('users.addConfirm')}</span>
            </button>
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => setAdding(false)}>
              <X size={14} strokeWidth={2} /> {T('common.cancel')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {usersQuery.isPending && (
        <div className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 16 }}>
          <Loader2 size={16} strokeWidth={2} className="spin" />
          <span>{T('users.loading')}</span>
        </div>
      )}

      {items !== null && items.length === 0 && !error && (
        <div className="card" style={{ padding: 24 }}><p className="muted">{T('users.empty')}</p></div>
      )}

      {items !== null && items.length > 0 && (
        <div className="card users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>{T('users.col.name')}</th>
                <th>{T('users.col.email')}</th>
                <th>{T('users.col.role')}</th>
                <th>{T('users.col.status')}</th>
                <th>{T('users.col.created')}</th>
                {!readOnly && <th aria-label="actions" />}
              </tr>
            </thead>
            <tbody>
              {items.map((u) => {
                const isSelf = u.id === currentUserId;
                // Super admin бүртгэлийг энэ хуудаснаас өөрчлөхгүй (backend ч
                // хаадаг) — зөвхөн /admin/superadmin-аар удирдана. Мөн ADMIN
                // бүртгэлийг зөвхөн super admin өөрчилнө.
                const isProtected =
                  isSelf ||
                  u.role_id === ROLE_SUPERADMIN ||
                  (u.role_id === ROLE_ADMIN && !callerIsSuperAdmin);
                return (
                  <tr key={u.id}>
                    <td data-label={T('users.col.name')}>
                      {(() => {
                        const name = (lang === 'en' ? (u.full_name_en?.trim() || u.full_name?.trim()) : u.full_name?.trim());
                        return (
                          <>
                            {name || u.username}
                            {isSelf && <span className="chip chip--neutral" style={{ marginLeft: 8 }}>{T('users.you')}</span>}
                            {name && <div className="muted mono" style={{ fontSize: 12 }}>@{u.username}</div>}
                          </>
                        );
                      })()}
                    </td>
                    <td className="mono" data-label={T('users.col.email')}>{u.email}</td>
                    <td data-label={T('users.col.role')}>
                      {readOnly || isProtected ? (
                        <span>{(() => {
                          const r = roles.find((x) => x.id === u.role_id);
                          return r ? tRole(r.key, r.name) : u.role_id;
                        })()}</span>
                      ) : (
                        <select
                          className="input users-table__role"
                          value={u.role_id}
                          onChange={(e) => changeRole(u.id, Number(e.target.value))}
                        >
                          {roles
                            // superadmin-ыг хэзээ ч санал болгохгүй; admin-ыг
                            // зөвхөн super admin-д (backend 403 өгдөгтэй нийцүүлэв).
                            .filter((r) => r.id !== ROLE_SUPERADMIN)
                            .filter((r) => r.id !== ROLE_ADMIN || callerIsSuperAdmin)
                            .map((r) => <option key={r.id} value={r.id}>{tRole(r.key, r.name)}</option>)}
                        </select>
                      )}
                    </td>
                    <td data-label={T('users.col.status')}>
                      {u.active
                        ? <span className="chip chip--success">{T('users.active')}</span>
                        : <span className="chip chip--neutral">{T('users.inactive')}</span>}
                    </td>
                    <td className="mono" data-label={T('users.col.created')}>{fmtDate(u.created_at)}</td>
                    {!readOnly && (
                      <td className="users-table__actions">
                        {!isProtected && (
                          <>
                            <button
                              className="btn btn--ghost btn--sm"
                              type="button"
                              onClick={() => toggleActive(u)}
                              title={u.active ? T('users.deactivate') : T('users.activate')}
                            >
                              {u.active ? <Ban size={14} strokeWidth={2} /> : <Check size={14} strokeWidth={2} />}
                            </button>
                            <button className="btn btn--ghost btn--sm" type="button" onClick={() => remove(u.id)} title={T('common.delete')}>
                              <Trash2 size={14} strokeWidth={2} />
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {items !== null && (hasPrev || hasNext) && (
        <div className="pager">
          <button
            className="btn btn--secondary btn--sm"
            type="button"
            disabled={!hasPrev || usersQuery.isFetching}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft size={14} strokeWidth={2} />
            <span>{T('common.prev')}</span>
          </button>
          <span className="pager__page">{T('common.page')} {page + 1}</span>
          <button
            className="btn btn--secondary btn--sm"
            type="button"
            disabled={!hasNext || usersQuery.isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            <span>{T('common.next')}</span>
            <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}
