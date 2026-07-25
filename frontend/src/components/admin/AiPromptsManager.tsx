"use client";

import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Loader2, Save } from 'lucide-react';
import { useT } from '@/lib/lang';
import { getJSON, sendJSON } from '@/lib/client';

interface PromptItem {
  key: string;
  content: string;
  updated_at?: string;
}

/**
 * AI prompt давхаргын тохиргоо — scope (хамрах хүрээ) ба instructions
 * (нэмэлт заавар)-ийг ажиллаж байх үед нь өөрчилнө. Suurь хамгаалалтын
 * дүрэм backend кодод хатуу бичигдсэн тул эндээс өөрчлөгдөхгүй; AI зөвхөн
 * scope-д заасан хүрээнд ажиллана.
 */
export default function AiPromptsManager() {
  const { T } = useT();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const promptsQuery = useQuery({
    queryKey: ['admin-ai-prompts'],
    queryFn: () => getJSON<PromptItem[]>('/api/admin/ai/prompts'),
  });

  useEffect(() => {
    if (!promptsQuery.data) return;
    const d: Record<string, string> = {};
    for (const p of promptsQuery.data) d[p.key] = p.content;
    setDrafts(d);
  }, [promptsQuery.data]);

  const save = async (key: string) => {
    setSavingKey(key);
    setError('');
    setSavedKey(null);
    const res = await sendJSON(`/api/admin/ai/prompts/${key}`, 'PUT', { content: drafts[key] ?? '' });
    if (res.ok) {
      setSavedKey(key);
      await queryClient.invalidateQueries({ queryKey: ['admin-ai-prompts'] });
    } else {
      setError(res.message || T('aiPrompts.saveError'));
    }
    setSavingKey(null);
  };

  if (promptsQuery.isPending) {
    return (
      <div className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 16 }}>
        <Loader2 size={16} strokeWidth={2} className="spin" />
        <span>{T('users.loading')}</span>
      </div>
    );
  }

  const items = promptsQuery.data ?? [];

  return (
    <div className="card" style={{ padding: 22, display: 'grid', gap: 18 }}>
      <div className="card__head card__head--with-sub" style={{ padding: 0 }}>
        <span className="card__title"><Bot size={18} strokeWidth={2} /> {T('aiPrompts.title')}</span>
        <span className="card__sub">{T('aiPrompts.sub')}</span>
      </div>

      {error && <div className="alert alert--danger" role="alert">{error}</div>}
      {promptsQuery.isError && (
        <div className="alert alert--danger" role="alert">{T('aiPrompts.loadError')}</div>
      )}

      {items.map((p) => (
        <div key={p.key} className="field">
          <label className="field__label" htmlFor={`prompt-${p.key}`}>
            {p.key === 'scope' ? T('aiPrompts.scope') : T('aiPrompts.instructions')}
            <span className="muted mono" style={{ marginLeft: 8, fontSize: 12 }}>{p.key}</span>
          </label>
          <p className="muted" style={{ margin: '2px 0 6px', fontSize: 13 }}>
            {p.key === 'scope' ? T('aiPrompts.scopeHint') : T('aiPrompts.instructionsHint')}
          </p>
          <textarea
            id={`prompt-${p.key}`}
            className="input"
            rows={4}
            maxLength={4000}
            value={drafts[p.key] ?? ''}
            onChange={(e) => setDrafts((d) => ({ ...d, [p.key]: e.target.value }))}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <button
              className="btn btn--primary btn--sm"
              type="button"
              disabled={savingKey !== null || (drafts[p.key] ?? '') === p.content}
              onClick={() => save(p.key)}
            >
              {savingKey === p.key
                ? <Loader2 size={14} strokeWidth={2} className="spin" />
                : <Save size={14} strokeWidth={2} />}
              <span>{T('common.save')}</span>
            </button>
            {savedKey === p.key && <span className="muted" style={{ fontSize: 13 }}>{T('aiPrompts.saved')}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
