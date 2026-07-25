"use client";

import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HardDrive, Upload, Eye, ExternalLink, Inbox, Loader2, RefreshCw, FolderOpen, Folder } from 'lucide-react';
import { getJSON } from '@/lib/client';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  iconLink?: string;
  webViewLink?: string;
}

function fmtSize(n?: string): string {
  if (!n) return '';
  const b = Number(n);
  if (!b) return '';
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

export default function DriveFiles() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<DriveFile | null>(null);

  // Файлуудыг зөвхөн popup нээгдсэн үед татна (хэрэггүй хүсэлт хийхгүй).
  const q = useQuery({
    queryKey: ['drive-files'],
    queryFn: () => getJSON<DriveFile[]>('/api/integrations/google-drive/files'),
    enabled: open,
  });
  const files = q.data ?? [];

  const FOLDER_MIME = 'application/vnd.google-apps.folder';

  const onPick = () => inputRef.current?.click();

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/integrations/google-drive/upload', {
        method: 'POST',
        headers: { 'x-dgov-csrf': '1' },
        body: fd,
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) await qc.invalidateQueries({ queryKey: ['drive-files'] });
      else setErr(body?.message || 'Хуулахад алдаа гарлаа.');
    } catch {
      setErr('Сүлжээний алдаа. Дахин оролдоно уу.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button className="btn btn--secondary btn--sm" type="button" style={{ width: '100%', justifyContent: 'center' }}>
            <FolderOpen size={14} /> Файл нээх
          </button>
        </DialogTrigger>
        <DialogContent className="gerege-theme" style={{ maxWidth: 'min(840px, 96vw)', background: 'var(--surface)', color: 'var(--fg)', padding: 24 }}>
          <DialogHeader>
            <DialogTitle style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Folder size={18} style={{ color: 'var(--dan-blue-text)' }} /> Gerege хавтас
            </DialogTitle>
            <DialogDescription>Google Drive дахь «Gerege» хавтасны файлаа харах, хуулах, нэр солих, устгах.</DialogDescription>
          </DialogHeader>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => q.refetch()} disabled={q.isFetching}>
              <RefreshCw size={14} className={q.isFetching ? 'spin' : undefined} /> Шинэчлэх
            </button>
            <button className="btn btn--primary btn--sm" type="button" onClick={onPick} disabled={uploading}>
              {uploading ? <><Loader2 size={14} className="spin" /> Хуулж буй…</> : <><Upload size={14} /> Файл хуулах</>}
            </button>
            <input ref={inputRef} type="file" hidden onChange={onUpload} />
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

            {files.map((f) => {
              const isFolder = f.mimeType === FOLDER_MIME;
              return (
                <div className="defrow defrow--wide" key={f.id}>
                  <span className="defrow__label" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    {isFolder
                      ? <Folder size={16} style={{ color: 'var(--dan-blue-text)' }} />
                      : f.iconLink
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={f.iconLink} alt="" width={16} height={16} />
                        : <HardDrive size={16} />}
                    <span>
                      <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{f.name}</span>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{fmtSize(f.size)}{f.size && f.modifiedTime ? ' · ' : ''}{fmtDate(f.modifiedTime)}</span>
                    </span>
                  </span>
                  <span className="defrow__value" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {!isFolder && <button className="btn btn--ghost btn--sm" type="button" title="Урьдчилан харах" onClick={() => setPreview(f)}><Eye size={14} /></button>}
                    {f.webViewLink && (
                      <a className="btn btn--ghost btn--sm" href={f.webViewLink} target="_blank" rel="noreferrer" title="Drive дээр нээх"><ExternalLink size={14} /></a>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="gerege-theme" style={{ maxWidth: 'min(960px, 96vw)', background: 'var(--surface)', color: 'var(--fg)', padding: 24 }}>
          <DialogHeader>
            <DialogTitle style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Eye size={16} style={{ color: 'var(--dan-blue-text)' }} /> {preview?.name}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <iframe
              title={preview.name}
              src={`https://drive.google.com/file/d/${preview.id}/preview`}
              style={{ width: '100%', height: '70vh', border: 0, borderRadius: 8 }}
              allow="autoplay"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
