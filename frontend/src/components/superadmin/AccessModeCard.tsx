"use client";

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Globe, Lock } from 'lucide-react';
import { useT } from '@/lib/lang';
import { getJSON, sendJSON } from '@/lib/client';

type AccessMode = 'public' | 'private';

// Платформын хандалтын горим — super admin public ↔ private хооронд сольдог.
// public: SSO-оор хэн ч нэвтэрнэ. private: зөвхөн урьдчилан бүртгүүлсэн иргэн.
export default function AccessModeCard() {
  const { T } = useT();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const modeQuery = useQuery({
    queryKey: ['access-mode'],
    queryFn: () => getJSON<{ mode: AccessMode }>('/api/superadmin/access-mode'),
  });
  const mode = modeQuery.data?.mode;

  const setMode = async (next: AccessMode) => {
    if (saving || next === mode) return;
    setError('');
    setSaving(true);
    const res = await sendJSON('/api/superadmin/access-mode', 'PUT', { mode: next });
    setSaving(false);
    if (res.ok) {
      await queryClient.invalidateQueries({ queryKey: ['access-mode'] });
    } else {
      setError(res.message || T('accessMode.updateError'));
    }
  };

  const loadError = modeQuery.isError ? (modeQuery.error as Error).message || T('accessMode.loadError') : '';

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16, display: 'grid', gap: 10 }}>
      <div>
        <label className="field__label">{T('accessMode.title')}</label>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{T('accessMode.hint')}</p>
      </div>

      {(error || loadError) && <div className="alert alert--danger" role="alert">{error || loadError}</div>}

      {modeQuery.isPending ? (
        <div className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Loader2 size={16} strokeWidth={2} className="spin" /><span>{T('accessMode.loading')}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className={mode === 'public' ? 'btn btn--primary' : 'btn btn--secondary'}
            type="button"
            onClick={() => setMode('public')}
            disabled={saving}
            aria-pressed={mode === 'public'}
          >
            <Globe size={16} strokeWidth={2} /><span>{T('accessMode.public')}</span>
          </button>
          <button
            className={mode === 'private' ? 'btn btn--primary' : 'btn btn--secondary'}
            type="button"
            onClick={() => setMode('private')}
            disabled={saving}
            aria-pressed={mode === 'private'}
          >
            <Lock size={16} strokeWidth={2} /><span>{T('accessMode.private')}</span>
          </button>
          {saving && <Loader2 size={16} strokeWidth={2} className="spin" style={{ alignSelf: 'center' }} />}
        </div>
      )}
    </div>
  );
}
