"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, UserPlus, Unlink, User, Send } from 'lucide-react';
import { useT } from '@/lib/lang';
import { getJSON, postJSON, sendJSON } from '@/lib/client';
import Alert from '@/components/Alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface Signer {
  person_etsi: string;
  reg_no?: string;
  name?: string;
  name_en?: string;
  role?: string;
  right_type: string;
  status: string; // ACTIVE | PENDING
  source: string;
  self: boolean;
}

interface AddSignerResult {
  signers: Signer[];
  pending_confirmation?: { signer_etsi: string; signer_reg_no?: string; session_id: string };
}

/**
 * OrgManagePanel нь нэвтэрсэн иргэний төлөөлдөг НЭГ байгууллагын гарын үсэг зурах
 * эрхтэй хүмүүсийг удирдах (жагсаах / РД-гээр нэмэх / хасах) ба тухайн байгууллагаас
 * өөрийгөө салгах (unlink) UI. Гарын үсэг зурагч нэмэх/хасах нь баруун дээд товч →
 * pop-up-аар; зөвхөн ADMIN эрхтэй хэрэглэгчид (eidmongolia талд бас шалгагдана).
 */
export default function OrgManagePanel({
  regNo,
  onUnlinked,
}: {
  regNo: string;
  onUnlinked: () => void;
}) {
  const { T, lang } = useT();
  const qc = useQueryClient();
  const [signerReg, setSignerReg] = useState('');
  const [role, setRole] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const base = `/api/me/eid/organizations/${encodeURIComponent(regNo)}`;
  const signersKey = ['eid-org-signers', regNo];

  const q = useQuery({
    queryKey: signersKey,
    queryFn: () => getJSON<Signer[]>(`${base}/signers`),
  });

  // Зөвхөн ADMIN эрхтэй хэрэглэгч гарын үсэг зурагч нэмж/хасаж чадна.
  const isAdmin = !!q.data?.some((s) => s.self && s.right_type === 'ADMIN');

  const add = useMutation({
    mutationFn: async () => {
      const res = await postJSON<AddSignerResult>(`${base}/signers`, {
        signer_reg_no: signerReg.trim(),
        role: role.trim(),
      });
      if (!res.ok) throw new Error(res.message || T('me.orgs.signers.add.error'));
      return res.data ?? { signers: [] };
    },
    onSuccess: (data) => {
      qc.setQueryData(signersKey, data.signers ?? []);
      setSignerReg('');
      setRole('');
      setAddOpen(false);
      // Sign-push илгээгдсэн бол тэр хүн PIN-ээрээ баталгаажуулах хүртэл PENDING.
      setOkMsg(data.pending_confirmation ? T('me.orgs.signers.add.pushSent') : T('me.orgs.signers.add.success'));
    },
  });

  const remove = useMutation({
    mutationFn: async (reg: string) => {
      const res = await sendJSON<Signer[]>(`${base}/signers?signer=${encodeURIComponent(reg)}`, 'DELETE');
      if (!res.ok) throw new Error(res.message || T('me.orgs.signers.remove.error'));
      return res.data ?? [];
    },
    onSuccess: (data) => qc.setQueryData(signersKey, data),
  });

  const resend = useMutation({
    mutationFn: async (reg: string) => {
      const res = await sendJSON<AddSignerResult>(`${base}/signers/resend?signer=${encodeURIComponent(reg)}`, 'POST');
      if (!res.ok) throw new Error(res.message || T('me.orgs.signers.resend.error'));
      return res.data ?? { signers: [] };
    },
    onSuccess: (data) => {
      qc.setQueryData(signersKey, data.signers ?? []);
      setOkMsg(T('me.orgs.signers.resend.success'));
    },
  });

  const unlink = useMutation({
    mutationFn: async () => {
      const res = await sendJSON(`${base}`, 'DELETE');
      if (!res.ok) throw new Error(res.message || T('me.orgs.unlink.error'));
      return true;
    },
    onSuccess: () => onUnlinked(),
  });

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (signerReg.trim().length >= 8) add.mutate();
  };

  return (
    <div className="org-manage" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <h3 style={{ fontSize: '0.95rem', margin: 0 }}>{T('me.orgs.signers.title')}</h3>
        {isAdmin && (
          <button type="button" className="btn btn--primary" style={{ flex: 'none' }} onClick={() => { setOkMsg(''); add.reset(); setAddOpen(true); }}>
            <UserPlus size={16} strokeWidth={2} />
            <span>{T('me.orgs.signers.add.button')}</span>
          </button>
        )}
      </div>

      {okMsg && <div style={{ marginBottom: 8 }}><Alert kind="success">{okMsg}</Alert></div>}

      {q.isPending ? (
        <p className="muted" style={{ fontSize: 13 }}>{T('me.orgs.signers.loading')}</p>
      ) : q.isError ? (
        <p className="muted" style={{ fontSize: 13 }}>{(q.error as Error).message}</p>
      ) : !q.data || q.data.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>{T('me.orgs.signers.none')}</p>
      ) : (
        <div className="org-signers">
          {q.data.map((s) => (
            <div key={s.person_etsi} className="org-signer">
              <div className="org-signer__avatar" aria-hidden="true"><User size={17} /></div>
              <div className="org-signer__body">
                <div className="org-signer__name">
                  <span className="org-signer__nm">{(lang === 'en' && s.name_en) ? s.name_en : (s.name || s.reg_no)}</span>
                  {s.self && <span className="chip chip--neutral">{T('me.orgs.signers.you')}</span>}
                  <span className={`chip ${s.right_type === 'ADMIN' ? 'chip--admin' : 'chip--neutral'}`}>{s.right_type}</span>
                  {s.status === 'PENDING' && <span className="chip chip--pending">{T('me.orgs.signers.pending')}</span>}
                </div>
                <div className="org-signer__meta mono">
                  {s.reg_no}{s.role ? ` · ${s.role}` : ''}
                </div>
              </div>
              {isAdmin && s.status === 'PENDING' && s.reg_no && (
                <button
                  type="button"
                  className="btn btn--ghost btn--icon"
                  aria-label={T('me.orgs.signers.resend.button')}
                  title={T('me.orgs.signers.resend.button')}
                  disabled={resend.isPending}
                  onClick={() => resend.mutate(s.reg_no as string)}
                >
                  <Send size={15} />
                </button>
              )}
              {isAdmin && !s.self && s.reg_no && (
                <button
                  type="button"
                  className="btn btn--ghost btn--icon"
                  aria-label={T('me.orgs.signers.remove.button')}
                  disabled={remove.isPending}
                  onClick={() => { if (window.confirm(T('me.orgs.signers.remove.confirm'))) remove.mutate(s.reg_no as string); }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {remove.isError && <div style={{ marginTop: 6 }}><Alert kind="danger">{(remove.error as Error).message}</Alert></div>}
      {resend.isError && <div style={{ marginTop: 6 }}><Alert kind="danger">{(resend.error as Error).message}</Alert></div>}

      {/* Байгууллага салгах — зөвхөн ADMIN (MANAGER өөрийгөө салгаж чадахгүй). */}
      {isAdmin && (
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ color: 'var(--danger, #b91c1c)' }}
            disabled={unlink.isPending}
            onClick={() => { if (window.confirm(T('me.orgs.unlink.confirm'))) unlink.mutate(); }}
          >
            <Unlink size={15} strokeWidth={2} />
            <span>{T('me.orgs.unlink.button')}</span>
          </button>
          {unlink.isError && <div style={{ marginTop: 6 }}><Alert kind="danger">{(unlink.error as Error).message}</Alert></div>}
        </div>
      )}

      {/* Гарын үсэг зурагч нэмэх — pop-up */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) add.reset(); }}>
        <DialogContent className="dlg-content--narrow">
          <DialogHeader>
            <DialogTitle>{T('me.orgs.signers.add.title')}</DialogTitle>
            <DialogDescription>{T('me.orgs.signers.add.hint')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitAdd}>
            <label className="org-add__label">{T('me.orgs.signers.add.regno')}</label>
            <input
              className="input mono"
              style={{ marginTop: 6 }}
              autoFocus
              autoComplete="off"
              placeholder={T('me.orgs.signers.add.regno')}
              value={signerReg}
              onChange={(e) => { setSignerReg(e.target.value); if (add.isError) add.reset(); }}
              disabled={add.isPending}
              maxLength={20}
            />
            <label className="org-add__label" style={{ marginTop: 10, display: 'block' }}>{T('me.orgs.signers.add.role')}</label>
            <input
              className="input"
              style={{ marginTop: 6 }}
              placeholder={T('me.orgs.signers.add.role')}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={add.isPending}
              maxLength={100}
            />
            {add.isError && <div style={{ marginTop: 10 }}><Alert kind="danger">{(add.error as Error).message}</Alert></div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button type="button" className="btn btn--ghost" onClick={() => setAddOpen(false)} disabled={add.isPending}>{T('common.cancel')}</button>
              <button type="submit" className="btn btn--primary" disabled={add.isPending || signerReg.trim().length < 8}>
                <UserPlus size={16} strokeWidth={2} />
                <span>{add.isPending ? T('me.orgs.signers.add.submitting') : T('me.orgs.signers.add.button')}</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
