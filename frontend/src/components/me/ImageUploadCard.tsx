
// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Upload, Trash2 } from 'lucide-react';
import { useT } from '@/lib/lang';
import type { DictKey } from '@/lib/i18n';
import { getJSON, sendJSON } from '@/lib/client';
import { uploadFile } from '@/lib/upload';
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

/**
 * ImageUploadCard нь зураг (гарын үсэг / тамга) оруулж, урьдчилан харж, устгах карт.
 *
 * ХОЁР АЛХАМТ ХАДГАЛАЛТ: зураг нь хэрэглэгчийн Google Drive-д байрлаж, DB-д
 * зөвхөн URL хадгалагддаг. SPA нь Drive руу ШУУД хандаж чадахгүй (токен зөвхөн
 * сервер талд) тул:
 *   1) `POST /integrations/google-drive/image` — API нь Drive-д хуулж URL өгнө;
 *   2) `PUT <path>` — тэр URL-ийг assets endpoint-д хадгална.
 * Ингэснээр assets-ийн HTTP гэрээ (URL хадгалдаг) 1:1 хэвээр үлдэнэ.
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
      // 1) Drive-д хуулна (токен сервер талд) → нийтэд харагдах URL.
      const up = await uploadFile<{ url: string }>('/integrations/google-drive/image', file);
      if (!up.ok || !up.data?.url) {
        throw new Error(up.message || T('me.assets.uploadError'));
      }
      // 2) URL-ийг хадгална (assets гэрээ өөрчлөгдөөгүй).
      const saved = await sendJSON<{ url: string }>(path, 'PUT', { url: up.data.url });
      if (!saved.ok) throw new Error(saved.message || T('me.assets.uploadError'));
      return saved.data ?? { url: up.data.url };
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
