"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React, { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Upload, Trash2 } from 'lucide-react';
import { useT } from '@/lib/lang';
import type { DictKey } from '@/lib/i18n';
import { getJSON, postJSON, sendJSON } from '@/lib/client';
import Alert from '@/components/Alert';

// driveImgSrc нь хадгалсан Google Drive URL-ийг <img>-д найдвартай харагдах
// lh3.googleusercontent.com/d/<id> хэлбэрт хөрвүүлнэ (хуучин drive.google.com/uc
// хэлбэрийг ч зөв харуулна). Drive-ийн бус URL-ийг хэвээр буцаана.
function driveImgSrc(url: string): string {
  if (!url) return url;
  const byParam = url.match(/[?&]id=([^&]+)/);
  if (byParam) return `https://lh3.googleusercontent.com/d/${byParam[1]}`;
  const byPath = url.match(/\/d\/([^/?]+)/);
  if (byPath) return `https://lh3.googleusercontent.com/d/${byPath[1]}`;
  return url;
}

// file → base64 (data: угтварыг хассан).
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onload = () => {
      const s = String(rd.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    rd.onerror = () => reject(new Error('read'));
    rd.readAsDataURL(file);
  });
}

/**
 * ImageUploadCard нь зураг (гарын үсэг / тамга) оруулж, урьдчилан харж, устгах карт.
 * Зураг нь BFF талд хэрэглэгчийн Google Drive-д байршиж, DB-д зөвхөн URL хадгалагдана.
 */
export default function ImageUploadCard({
  titleKey,
  hintKey,
  path,
  queryKey,
  canEdit,
  aspect = '3 / 1',
}: {
  titleKey: DictKey;
  hintKey?: DictKey;
  path: string;
  queryKey: QueryKey;
  canEdit: boolean;
  aspect?: string;
}) {
  const { T } = useT();
  const title = T(titleKey);
  const hint = hintKey ? T(hintKey) : '';
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');

  const q = useQuery({ queryKey, queryFn: () => getJSON<{ url: string }>(path) });
  const url = q.data?.url || '';

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const data = await fileToBase64(file);
      const res = await postJSON<{ url: string }>(path, { data, mime: file.type, name: file.name });
      if (!res.ok) throw new Error(res.message || T('me.assets.uploadError'));
      return res.data ?? { url: '' };
    },
    onSuccess: (d) => qc.setQueryData(queryKey, d),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const res = await sendJSON(path, 'DELETE');
      if (!res.ok) throw new Error(res.message || T('me.assets.deleteError'));
    },
    onSuccess: () => qc.setQueryData(queryKey, { url: '' }),
  });

  const pick = (f?: File | null) => {
    setErr('');
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErr(T('me.assets.imgOnly')); return; }
    if (f.size > 1_000_000) { setErr(T('me.assets.tooBig')); return; }
    upload.mutate(f);
  };

  return (
    <section className="card" aria-label={title}>
      <div className="card__head card__head--with-sub" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="card__title"><h2>{title}</h2></div>
          {hint && <span className="card__sub">{hint}</span>}
        </div>
        {canEdit && (
          <button type="button" className="btn btn--primary" style={{ flex: 'none' }} disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
            <Upload size={16} strokeWidth={2} />
            <span>{upload.isPending ? T('me.assets.uploading') : (url ? T('me.assets.change') : T('me.assets.upload'))}</span>
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }}
      />

      {q.isPending ? (
        <p className="muted" style={{ padding: '4px 2px' }}>{T('me.assets.loading')}</p>
      ) : url ? (
        <div className="asset-preview" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, aspectRatio: aspect, maxWidth: 320, border: '1px solid var(--border)', borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={driveImgSrc(url)} alt={title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          {canEdit && (
            <button type="button" className="btn btn--ghost btn--icon" aria-label={T('me.assets.delete')} disabled={remove.isPending}
              onClick={() => { if (window.confirm(T('me.assets.deleteConfirm'))) remove.mutate(); }}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ) : (
        <p className="muted" style={{ padding: '4px 2px' }}>{canEdit ? T('me.assets.none') : T('me.assets.noneReadonly')}</p>
      )}

      {err && <div style={{ marginTop: 8 }}><Alert kind="danger">{err}</Alert></div>}
      {upload.isError && <div style={{ marginTop: 8 }}><Alert kind="danger">{(upload.error as Error).message}</Alert></div>}
      {remove.isError && <div style={{ marginTop: 8 }}><Alert kind="danger">{(remove.error as Error).message}</Alert></div>}
    </section>
  );
}
