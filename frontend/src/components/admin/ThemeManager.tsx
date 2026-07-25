"use client";

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Palette, Plus, Copy, Trash2, CheckCircle2, Pencil } from 'lucide-react';
import Alert from '@/components/Alert';
import ThemeEditor from '@/components/admin/ThemeEditor';
import { getJSON, sendJSON } from '@/lib/client';
import { useT, useLang } from '@/lib/lang';
import type { Theme } from '@/lib/theme';

type View = { kind: 'list' } | { kind: 'edit'; theme: Theme | null };

/**
 * ThemeManager — landing theme-үүдийг удирдана: жагсаалт, шинээр үүсгэх/хуулах,
 * идэвхтэй (default) болгох, устгах, засах. Идэвхтэй theme-ийг нэвтрээгүй зочин
 * landing-д харна.
 */
export default function ThemeManager() {
  const { T } = useT();
  const { lang } = useLang();
  const L = (mn: string, en: string) => (lang === 'en' ? en : mn);
  const qc = useQueryClient();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [error, setError] = useState('');

  const q = useQuery({ queryKey: ['admin-themes'], queryFn: () => getJSON<Theme[]>('/api/admin/themes') });

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-themes'] });

  const activate = async (t: Theme) => {
    setError('');
    const res = await sendJSON(`/api/admin/themes/${t.id}/active`, 'PUT');
    if (res.ok) refresh(); else setError(res.message || L('Идэвхжүүлэхэд алдаа.', 'Failed to activate.'));
  };
  const remove = async (t: Theme) => {
    setError('');
    if (!confirm(L(`"${t.name}" theme-ийг устгах уу?`, `Delete theme "${t.name}"?`))) return;
    const res = await sendJSON(`/api/admin/themes/${t.id}`, 'DELETE');
    if (res.ok) refresh(); else setError(res.message || L('Устгахад алдаа.', 'Failed to delete.'));
  };
  const clone = (t: Theme): Theme => ({
    ...t, id: '', name: `${t.name} (${L('хуулбар', 'copy')})`, is_active: false,
  });

  if (view.kind === 'edit') {
    return (
      <ThemeEditor
        theme={view.theme}
        onDone={() => { refresh(); setView({ kind: 'list' }); }}
      />
    );
  }

  return (
    <section className="card" aria-label={T('themes.title')}>
      <div className="card__head card__head--with-sub">
        <div className="card__title">
          <Palette size={18} strokeWidth={2} style={{ color: 'var(--dan-blue-text)' }} />
          <h2>{T('themes.title')}</h2>
        </div>
        <span className="card__sub">{T('themes.sub')}</span>
      </div>

      {error && <Alert kind="danger">{error}</Alert>}
      {q.isError && <Alert kind="danger">{T('themes.loadError')}</Alert>}

      <div style={{ marginBottom: 14 }}>
        <button className="btn btn--primary btn--sm" type="button"
          onClick={() => setView({ kind: 'edit', theme: null })}>
          <Plus size={16} strokeWidth={2} /><span>{T('themes.create')}</span>
        </button>
      </div>

      <div className="theme-list">
        {(q.data ?? []).map((t) => (
          <div key={t.id} className={`theme-row${t.is_active ? ' is-active' : ''}`}>
            <div className="theme-row__main">
              <span className="theme-row__name">{t.name}</span>
              {t.is_active && (
                <span className="theme-row__badge">
                  <CheckCircle2 size={13} strokeWidth={2.5} /> {T('themes.active')}
                </span>
              )}
            </div>
            <div className="theme-row__actions">
              {!t.is_active && (
                <button className="btn btn--secondary btn--sm" type="button" onClick={() => activate(t)}>
                  {T('themes.activate')}
                </button>
              )}
              <button className="icon-btn" type="button" aria-label={T('themes.edit')} title={T('themes.edit')}
                onClick={() => setView({ kind: 'edit', theme: t })}>
                <Pencil size={15} />
              </button>
              <button className="icon-btn" type="button" aria-label={T('themes.clone')} title={T('themes.clone')}
                onClick={() => setView({ kind: 'edit', theme: clone(t) })}>
                <Copy size={15} />
              </button>
              {!t.is_active && (
                <button className="icon-btn icon-btn--danger" type="button" aria-label={T('themes.delete')} title={T('themes.delete')}
                  onClick={() => remove(t)}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        ))}
        {q.data && q.data.length === 0 && <p className="muted">{T('themes.empty')}</p>}
      </div>
    </section>
  );
}
