"use client";

import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Cloud, Upload, Download, Trash2, Inbox, Loader2, RefreshCw, FolderOpen, CheckCircle2,
} from 'lucide-react';
import { getJSON, sendJSON, postJSON } from '@/lib/client';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

interface GSpaceFile {
  name: string;
  size: number;
  mod_time: string;
}
interface GSpaceOverview {
  files: GSpaceFile[];
  used: number;
  limit: number;
}

function fmtSize(b: number): string {
  if (!b) return '0B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)}${u[i]}`;
}

function fmtDate(iso?: string): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('mn-MN', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ''; }
}

// Файлыг base64 болгон уншина (data: URL-ийн толгойг хасна).
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      const comma = s.indexOf(',');
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.onerror = () => reject(new Error('Файл унших алдаа'));
    reader.readAsDataURL(file);
  });
}

export default function GSpaceCard() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyName, setBusyName] = useState('');
  const [err, setErr] = useState('');

  // Ашиглалтын самбарыг картан дээр шууд харуулна (нэг SFTP list дуудлага).
  const q = useQuery({
    queryKey: ['gspace'],
    queryFn: () => getJSON<GSpaceOverview>('/api/gspace'),
  });
  const ov = q.data;
  const files = ov?.files ?? [];
  const used = ov?.used ?? 0;
  const limit = ov?.limit ?? 2 << 20;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  const onPick = () => inputRef.current?.click();

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true); setErr('');
    try {
      if (file.size > limit) {
        setErr(`Файл хэт том — квот ${fmtSize(limit)}.`);
        return;
      }
      const data = await fileToBase64(file);
      const res = await postJSON('/api/gspace/upload', { name: file.name, data });
      if (res.ok) await qc.invalidateQueries({ queryKey: ['gspace'] });
      else setErr(res.message || 'Хуулахад алдаа гарлаа.');
    } catch {
      setErr('Файл боловсруулахад алдаа гарлаа.');
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (name: string) => {
    if (!window.confirm(`«${name}»-г устгах уу?`)) return;
    setBusyName(name); setErr('');
    const res = await sendJSON(`/api/gspace?name=${encodeURIComponent(name)}`, 'DELETE');
    setBusyName('');
    if (res.ok) await qc.invalidateQueries({ queryKey: ['gspace'] });
    else setErr(res.message || 'Устгахад алдаа гарлаа.');
  };

  return (
    <div className="card int-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, margin: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span aria-hidden style={{ flex: '0 0 auto', width: 40, height: 40, borderRadius: 10, background: 'var(--surface-2, #f3f4f6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dan-blue-text, #2563eb)' }}>
          <Cloud size={20} strokeWidth={2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div translate="no" style={{ fontWeight: 700, fontSize: 15, color: 'var(--fg)' }}>Gerege Space</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Файл хадгалалт · {fmtSize(limit)}</div>
        </div>
        {/* Үргэлж холбогдсон (OAuth-гүй, апп-ын өөрийн хадгалалт) — идэвхгүй ✓. */}
        <span title="Холбогдсон" aria-label="Холбогдсон"
          style={{ flex: '0 0 auto', width: 32, height: 32, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--success, #16a34a)', background: 'var(--card, #fff)', color: 'var(--success, #16a34a)' }}>
          <CheckCircle2 size={16} strokeWidth={2.5} />
        </span>
      </div>

      <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
        Gerege-ийн өөрийн аюулгүй хадгалалт. Хэрэглэгч бүрт {fmtSize(limit)} зай — шууд холбогдсон, тохиргоо шаардахгүй.
      </p>

      {/* Ашиглалтын самбар. */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
          <span>{fmtSize(used)} / {fmtSize(limit)}</span>
          <span>{pct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2, #f3f4f6)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 90 ? 'var(--danger, #dc2626)' : 'var(--dan-blue-text, #2563eb)', transition: 'width .3s' }} />
        </div>
      </div>

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--success, #16a34a)', fontWeight: 600 }}>
        <CheckCircle2 size={13} /> Холбогдсон
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button className="btn btn--secondary btn--sm" type="button" style={{ width: '100%', justifyContent: 'center' }}>
            <FolderOpen size={14} /> Файл нээх
          </button>
        </DialogTrigger>
        <DialogContent className="gerege-theme" style={{ maxWidth: 'min(760px, 96vw)', background: 'var(--surface)', color: 'var(--fg)', padding: 24 }}>
          <DialogHeader>
            <DialogTitle style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Cloud size={18} style={{ color: 'var(--dan-blue-text)' }} /> Gerege Space
            </DialogTitle>
            <DialogDescription>Файлаа хадгалах, татах, устгах. Нийт {fmtSize(limit)} зай.</DialogDescription>
          </DialogHeader>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtSize(used)} / {fmtSize(limit)} ({pct}%)</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => q.refetch()} disabled={q.isFetching}>
                <RefreshCw size={14} className={q.isFetching ? 'spin' : undefined} /> Шинэчлэх
              </button>
              <button className="btn btn--primary btn--sm" type="button" onClick={onPick} disabled={uploading}>
                {uploading ? <><Loader2 size={14} className="spin" /> Хуулж буй…</> : <><Upload size={14} /> Файл хуулах</>}
              </button>
              <input ref={inputRef} type="file" hidden onChange={onUpload} />
            </div>
          </div>

          {err && <div className="alert alert--danger" role="alert" style={{ margin: 0 }}>{err}</div>}

          <div style={{ maxHeight: '56vh', overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
            {q.isPending && (
              <div className="defrow"><span className="defrow__value muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Loader2 size={15} className="spin" /> Ачаалж байна…</span></div>
            )}
            {q.isError && <div className="alert alert--danger" role="alert">{(q.error as Error).message}</div>}
            {!q.isPending && !q.isError && files.length === 0 && (
              <div className="defrow"><span className="defrow__value muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Inbox size={15} /> Файл алга. «Файл хуулах»-аар нэмнэ үү.</span></div>
            )}

            {files.map((f) => (
              <div className="defrow defrow--wide" key={f.name}>
                <span className="defrow__label" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Cloud size={16} style={{ color: 'var(--dan-blue-text)', flex: '0 0 auto' }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600, color: 'var(--fg)', wordBreak: 'break-all' }}>{f.name}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{fmtSize(f.size)}{f.mod_time ? ' · ' : ''}{fmtDate(f.mod_time)}</span>
                  </span>
                </span>
                <span className="defrow__value" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <a className="btn btn--ghost btn--sm" href={`/api/gspace/download?name=${encodeURIComponent(f.name)}`} title="Татах"><Download size={14} /></a>
                  <button className="btn btn--ghost btn--sm" type="button" title="Устгах" onClick={() => onDelete(f.name)} disabled={busyName === f.name}>
                    {busyName === f.name ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
