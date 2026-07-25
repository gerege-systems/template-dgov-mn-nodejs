"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Save, X, Trash2, ArrowLeft, Building2 } from 'lucide-react';
import { useT } from '@/lib/lang';
import type { DictKey } from '@/lib/i18n';
import { getJSON, postJSON, sendJSON } from '@/lib/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Organization {
  id: string;
  reg_no: string;
  name: string;
  name_latin?: string;
  created_at: string;
}
interface Member {
  org_id: string;
  user_id: string;
  role: string;
  created_at: string;
}

const ORG_ROLES = ['owner', 'admin', 'member'] as const;

// Дүрийн орчуулгын түлхүүр: owner → org.roleOwner г.м.
function roleKey(role: string): DictKey {
  switch (role) {
    case 'owner': return 'org.roleOwner';
    case 'admin': return 'org.roleAdmin';
    default: return 'org.roleMember';
  }
}

interface Props {
  orgId: string;
  currentUserId: string;
}

export default function OrgDetail({ orgId, currentUserId }: Props) {
  const { T, lang } = useT();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ user_id: '', role: 'member' as string });
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);

  const orgQuery = useQuery({
    queryKey: ['org', orgId],
    queryFn: () => getJSON<Organization>(`/api/org/${orgId}`),
  });
  const membersQuery = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => getJSON<Member[]>(`/api/org/${orgId}/members`),
  });

  const org = orgQuery.data ?? null;
  const members = membersQuery.data ?? null;

  // Дуудагчийн өөрийн дүрээс удирдах эрхтэй эсэхийг тодорхойлно (owner/admin).
  const myRole = members?.find((m) => m.user_id === currentUserId)?.role;
  const canManage = myRole === 'owner' || myRole === 'admin';

  const loadError = orgQuery.isError ? (orgQuery.error as Error).message || T('org.notFound') : '';
  const membersError = membersQuery.isError ? (membersQuery.error as Error).message || T('org.membersLoadError') : '';
  const error = actionError || loadError || membersError;

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'mn-MN', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const reload = () => queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });

  const addMember = async () => {
    if (!form.user_id.trim()) return;
    setSaving(true);
    setActionError('');
    const res = await postJSON(`/api/org/${orgId}/members`, { user_id: form.user_id.trim(), role: form.role });
    if (res.ok) {
      setAdding(false);
      setForm({ user_id: '', role: 'member' });
      await reload();
    } else {
      setActionError(res.message || T('org.actionError'));
    }
    setSaving(false);
  };

  const changeRole = async (userId: string, role: string) => {
    setActionError('');
    const res = await sendJSON(`/api/org/${orgId}/members/${userId}`, 'PUT', { role });
    if (res.ok) await reload();
    else setActionError(res.message || T('org.actionError'));
  };

  const removeMember = async (userId: string) => {
    if (!window.confirm(T('org.removeConfirm'))) return;
    setActionError('');
    const res = await sendJSON(`/api/org/${orgId}/members/${userId}`, 'DELETE');
    if (res.ok) await reload();
    else setActionError(res.message || T('org.actionError'));
  };

  return (
    <div className="orgs">
      <div style={{ marginBottom: 16 }}>
        <Link className="btn btn--ghost btn--sm" href="/me/organizations">
          <ArrowLeft size={14} strokeWidth={2} /><span>{T('org.back')}</span>
        </Link>
      </div>

      {error && <div className="alert alert--danger" role="alert">{error}</div>}

      {orgQuery.isPending && (
        <div className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 16 }}>
          <Loader2 size={16} strokeWidth={2} className="spin" />
          <span>{T('users.loading')}</span>
        </div>
      )}

      {org && (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: 'grid', gap: 8 }}>
          <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <Building2 size={18} strokeWidth={2} />
            {lang === 'en' ? (org.name_latin?.trim() || org.name) : org.name}
          </h2>
          <div className="muted mono" style={{ fontSize: 13 }}>{T('org.regNo')}: {org.reg_no}</div>
          <div className="muted mono" style={{ fontSize: 13 }}>{T('org.created')}: {fmtDate(org.created_at)}</div>
        </div>
      )}

      <div className="users__head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{T('org.members')}</h3>
        {/* Товч нь toggle биш — эрхтэй хэрэглэгчид үргэлж харагдаж, popup нээнэ. */}
        {canManage && (
          <button className="btn btn--primary btn--sm" type="button" onClick={() => { setAdding(true); setActionError(''); }}>
            <Plus size={14} strokeWidth={2} />
            <span>{T('org.addMember')}</span>
          </button>
        )}
      </div>

      {/* Гишүүн нэмэх форм нь popup дотор — зөвхөн удирдах эрхтэйд. */}
      <Dialog open={canManage && adding} onOpenChange={(o) => { if (!o) setAdding(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{T('org.addMember')}</DialogTitle></DialogHeader>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="field">
              <label className="field__label" htmlFor="m-uid">{T('org.userId')}</label>
              <input id="m-uid" className="input mono" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} placeholder="00000000-0000-0000-0000-000000000000" />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="m-role">{T('org.role')}</label>
              <select id="m-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ORG_ROLES.map((r) => <option key={r} value={r}>{T(roleKey(r))}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary" type="button" onClick={addMember} disabled={saving}>
                {saving ? <Loader2 size={16} strokeWidth={2} className="spin" /> : <Save size={16} strokeWidth={2} />}
                <span>{T('org.addMember')}</span>
              </button>
              <button className="btn btn--secondary" type="button" onClick={() => setAdding(false)}>
                <X size={16} strokeWidth={2} /><span>{T('common.cancel')}</span>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {members !== null && members.length > 0 && (
        <div className="card users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>{T('org.userId')}</th>
                <th>{T('org.role')}</th>
                <th>{T('org.created')}</th>
                {canManage && <th aria-label="actions" />}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.user_id === currentUserId;
                const isOwner = m.role === 'owner';
                return (
                  <tr key={m.user_id}>
                    <td className="mono" data-label={T('org.userId')}>
                      {m.user_id}
                      {isSelf && <span className="chip chip--neutral" style={{ marginLeft: 8 }}>{T('org.you')}</span>}
                    </td>
                    <td data-label={T('org.role')}>
                      {canManage && !isOwner ? (
                        <select
                          className="input users-table__role"
                          value={m.role}
                          onChange={(e) => changeRole(m.user_id, e.target.value)}
                        >
                          {ORG_ROLES.filter((r) => r !== 'owner').map((r) => (
                            <option key={r} value={r}>{T(roleKey(r))}</option>
                          ))}
                        </select>
                      ) : (
                        <span>{T(roleKey(m.role))}</span>
                      )}
                    </td>
                    <td className="mono" data-label={T('org.created')}>{fmtDate(m.created_at)}</td>
                    {canManage && (
                      <td className="users-table__actions">
                        {!isOwner && (
                          <button className="btn btn--ghost btn--sm" type="button" onClick={() => removeMember(m.user_id)} title={T('org.removeMember')}>
                            <Trash2 size={14} strokeWidth={2} />
                          </button>
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
    </div>
  );
}
