"use client";

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Loader2, ShieldPlus, Search, IdCard, Mail, Link2, Check } from 'lucide-react';
import { useT } from '@/lib/lang';
import { getJSON, sendJSON } from '@/lib/client';
import { ROLE_SUPERADMIN, roleLabel } from '@/lib/types';

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

interface Invite {
  email: string;
  invited_by?: string;
  created_at: string;
  accepted_at?: string | null;
  pending: boolean;
}

interface Props {
  currentUserId: string;
}

export default function SuperadminManager({ currentUserId }: Props) {
  const { T, lang } = useT();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');

  // Register-ээр админ болгох (DAN-д бүртгэлтэй байгаа хэрэглэгч).
  const [register, setRegister] = useState('');
  const [preview, setPreview] = useState<{ name: string } | null>(null);
  // registerNote — олдоогүй үеийн НАЙРСАГ мэдэгдэл (улаан алдаа биш).
  const [registerNote, setRegisterNote] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [promoting, setPromoting] = useState(false);

  // Superadmin онбординг урилга (и-мэйл).
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);

  // Админ түвшний бүртгэлүүд (super admin + admin).
  const adminsQuery = useQuery({
    queryKey: ['superadmin-admins'],
    queryFn: () => getJSON<AdminUser[]>('/api/superadmin/admins'),
  });
  // Superadmin онбординг урилгууд (pending/accepted).
  const invitesQuery = useQuery({
    queryKey: ['superadmin-invites'],
    queryFn: () => getJSON<Invite[]>('/api/superadmin/invites'),
  });

  const admins = adminsQuery.data ?? null;
  const loadError = adminsQuery.isError ? (adminsQuery.error as Error).message || T('superadmin.loadError') : '';
  const error = actionError || loadError;

  const invites = invitesQuery.data ?? null;
  // origin-ыг mount-ийн ДАРАА тавина: SSR болон client-ийн эхний render хоёул
  // relative зам гаргаж hydration зөрүү (React #418)-аас сэргийлнэ; дараа нь
  // useEffect бүтэн URL-ыг тавьна.
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const onboardLink = `${origin}/superadmin/onboard`;

  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: ['superadmin-admins'] });
  };

  // Register-ээр DAN-д БАЙГАА хэрэглэгчийг (eID-ээр нэвтэрсэн) урьдчилан харуулна.
  // Core (үндэсний бүртгэл) БИШ — эрх олгох нь local DAN хэрэглэгч дээр ажилладаг тул.
  const lookupRegister = async () => {
    const reg = register.trim();
    if (!reg) return;
    setPreview(null);
    setRegisterNote('');
    setActionError('');
    setPreviewLoading(true);
    try {
      const rec = await getJSON<{ id?: string; first_name?: string; last_name?: string; full_name?: string }>(
        `/api/superadmin/admins/by-register?register=${encodeURIComponent(reg)}`,
      );
      const name = (rec?.full_name || `${rec?.last_name ?? ''} ${rec?.first_name ?? ''}`).trim();
      if (rec && rec.id) setPreview({ name: name || rec.id });
      else setRegisterNote(T('superadmin.registerNotFound'));
    } catch {
      // Олдсонгүй (404) эсвэл түр саатал — АЛДАА биш, найрсаг мэдэгдэл харуулна.
      setRegisterNote(T('superadmin.registerNotFound'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const promoteByRegister = async () => {
    const reg = register.trim();
    if (!reg) return;
    setActionError('');
    setPromoting(true);
    const res = await sendJSON('/api/superadmin/admins/by-register', 'POST', { register: reg });
    setPromoting(false);
    if (res.ok) {
      setRegister('');
      setPreview(null);
      await reload();
    } else {
      setActionError(res.message || T('superadmin.actionError'));
    }
  };

  const reloadInvites = async () => {
    await queryClient.invalidateQueries({ queryKey: ['superadmin-invites'] });
  };

  const addInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setActionError('');
    setInviting(true);
    const res = await sendJSON('/api/superadmin/invites', 'POST', { email });
    setInviting(false);
    if (res.ok) {
      setInviteEmail('');
      await reloadInvites();
    } else {
      setActionError(res.message || T('superadmin.actionError'));
    }
  };

  const deleteInvite = async (email: string) => {
    if (!window.confirm(T('superadmin.inviteDeleteConfirm'))) return;
    setActionError('');
    const res = await sendJSON(`/api/superadmin/invites/${encodeURIComponent(email)}`, 'DELETE');
    if (res.ok) await reloadInvites();
    else setActionError(res.message || T('superadmin.actionError'));
  };

  const copyOnboardLink = async () => {
    try {
      await navigator.clipboard.writeText(onboardLink);
      setInviteLinkCopied(true);
      setTimeout(() => setInviteLinkCopied(false), 1500);
    } catch { /* clipboard байхгүй */ }
  };

  const revokeAdmin = async (u: AdminUser) => {
    if (!window.confirm(T('superadmin.revokeConfirm'))) return;
    setActionError('');
    const res = await sendJSON(`/api/superadmin/admins/${u.id}`, 'DELETE');
    if (res.ok) await reload();
    else setActionError(res.message || T('superadmin.actionError'));
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

  return (
    <div className="users">
      {error && <div className="alert alert--danger" role="alert">{error}</div>}

      {/* Регистрээр админ болгох — DAN-д бүртгэлтэй байгаа (eID-ээр нэвтэрсэн)
          хэрэглэгчийг регистрээр нь хайж, нэрийг баталгаажуулаад админ эрх олгоно.
          Core (үндэсний бүртгэл) руу ХАНДАХГҮЙ — зөвхөн local DAN хэрэглэгч. */}
      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'grid', gap: 10 }}>
        <label className="field__label">{T('superadmin.byRegisterTitle')}</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input mono"
            value={register}
            onChange={(e) => { setRegister(e.target.value); setPreview(null); setRegisterNote(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') lookupRegister(); }}
            placeholder={T('superadmin.registerPlaceholder')}
            style={{ minWidth: 220, flex: 1 }}
          />
          <button className="btn btn--secondary" type="button" onClick={lookupRegister} disabled={previewLoading || !register.trim()}>
            {previewLoading ? <Loader2 size={16} strokeWidth={2} className="spin" /> : <Search size={16} strokeWidth={2} />}
            <span>{T('superadmin.lookup')}</span>
          </button>
        </div>
        {preview && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="chip chip--neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <IdCard size={14} strokeWidth={2} /><span translate="no">{preview.name}</span>
            </span>
            <button className="btn btn--primary" type="button" onClick={promoteByRegister} disabled={promoting}>
              {promoting ? <Loader2 size={16} strokeWidth={2} className="spin" /> : <ShieldPlus size={16} strokeWidth={2} />}
              <span>{T('superadmin.makeAdmin')}</span>
            </button>
          </div>
        )}
        {registerNote && (
          <p className="muted" style={{ fontSize: 13, margin: 0 }} role="status">{registerNote}</p>
        )}
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>{T('superadmin.byRegisterHint')}</p>
      </div>

      {adminsQuery.isPending && (
        <div className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 16 }}>
          <Loader2 size={16} strokeWidth={2} className="spin" />
          <span>{T('superadmin.loading')}</span>
        </div>
      )}

      {admins !== null && admins.length === 0 && !error && (
        <div className="card" style={{ padding: 24 }}><p className="muted">{T('superadmin.empty')}</p></div>
      )}

      {admins !== null && admins.length > 0 && (
        <div className="card users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>{T('users.col.name')}</th>
                <th>{T('users.col.email')}</th>
                <th>{T('users.col.role')}</th>
                <th>{T('users.col.status')}</th>
                <th>{T('users.col.created')}</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {admins.map((u) => {
                const isSelf = u.id === currentUserId;
                const isSuper = u.role_id === ROLE_SUPERADMIN;
                const name = (lang === 'en' ? (u.full_name_en?.trim() || u.full_name?.trim()) : u.full_name?.trim());
                return (
                  <tr key={u.id}>
                    <td data-label={T('users.col.name')}>
                      {name || u.username}
                      {isSelf && <span className="chip chip--neutral" style={{ marginLeft: 8 }}>{T('users.you')}</span>}
                      {name && <div className="muted mono" style={{ fontSize: 12 }}>@{u.username}</div>}
                    </td>
                    <td className="mono" data-label={T('users.col.email')}>{u.email}</td>
                    <td data-label={T('users.col.role')}>
                      <span className={isSuper ? 'chip chip--success' : 'chip chip--neutral'}>{roleLabel(u.role_id, lang)}</span>
                    </td>
                    <td data-label={T('users.col.status')}>
                      {u.active
                        ? <span className="chip chip--success">{T('users.active')}</span>
                        : <span className="chip chip--neutral">{T('users.inactive')}</span>}
                    </td>
                    <td className="mono" data-label={T('users.col.created')}>{fmtDate(u.created_at)}</td>
                    <td className="users-table__actions">
                      {/* Super admin-г болон өөрийгөө хасахгүй. */}
                      {!isSuper && !isSelf && (
                        <button className="btn btn--ghost btn--sm" type="button" onClick={() => revokeAdmin(u)} title={T('superadmin.revoke')}>
                          <Trash2 size={14} strokeWidth={2} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Superadmin онбординг урилга — и-мэйлээр урьж, тухайн хүн /superadmin/onboard
          дээр Google + eID + 2FA-аар өөрийгөө бүртгэнэ. */}
      <div className="card" style={{ padding: 16, marginTop: 24, display: 'grid', gap: 12 }}>
        <div>
          <label className="field__label">{T('superadmin.inviteTitle')}</label>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{T('superadmin.inviteSub')}</p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addInvite(); }}
            placeholder={T('superadmin.inviteEmailPlaceholder')}
            style={{ minWidth: 240, flex: 1 }}
          />
          <button className="btn btn--primary" type="button" onClick={addInvite} disabled={inviting || !inviteEmail.trim()}>
            {inviting ? <Loader2 size={16} strokeWidth={2} className="spin" /> : <Mail size={16} strokeWidth={2} />}
            <span>{T('superadmin.invite')}</span>
          </button>
        </div>

        {/* Хуваалцах онбординг холбоос */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
          <Link2 size={14} strokeWidth={2} className="muted" />
          <code className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{onboardLink}</code>
          <button className="btn btn--ghost btn--sm" type="button" onClick={copyOnboardLink} title={T('superadmin.copyLink')}>
            {inviteLinkCopied ? <Check size={14} strokeWidth={2} /> : <Link2 size={14} strokeWidth={2} />}
            <span>{T('superadmin.copyLink')}</span>
          </button>
        </div>

        {invitesQuery.isPending && (
          <div className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Loader2 size={16} strokeWidth={2} className="spin" /><span>{T('superadmin.loading')}</span>
          </div>
        )}

        {invites !== null && invites.length === 0 && (
          <p className="muted" style={{ margin: 0 }}>{T('superadmin.invitesEmpty')}</p>
        )}

        {invites !== null && invites.length > 0 && (
          <div className="users-table-wrap" style={{ marginTop: 4 }}>
            <table className="users-table">
              <thead>
                <tr>
                  <th>{T('superadmin.email')}</th>
                  <th>{T('users.col.status')}</th>
                  <th>{T('users.col.created')}</th>
                  <th aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.email}>
                    <td className="mono" data-label={T('superadmin.email')}>{inv.email}</td>
                    <td data-label={T('users.col.status')}>
                      {inv.pending
                        ? <span className="chip chip--pending">{T('superadmin.invitePending')}</span>
                        : <span className="chip chip--success">{T('superadmin.inviteAccepted')}</span>}
                    </td>
                    <td className="mono" data-label={T('users.col.created')}>{fmtDate(inv.created_at)}</td>
                    <td className="users-table__actions">
                      <button className="btn btn--ghost btn--sm" type="button" onClick={() => deleteInvite(inv.email)} title={T('superadmin.inviteDelete')}>
                        <Trash2 size={14} strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
