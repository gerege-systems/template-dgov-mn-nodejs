"use client";

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useT } from '@/lib/lang';
import { getJSON } from '@/lib/client';
import { formatTS } from '@/lib/format';

interface SecurityEvent {
  id: number;
  received_at: string;
  user_id?: string;
  kind: string;
  severity?: string;
  source?: string;
  user_agent?: string;
  ip?: string;
  detail?: Record<string, unknown>;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

export default function SecurityViewer() {
  const { T } = useT();
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ['security-events', limit, offset],
    queryFn: () => getJSON<SecurityEvent[]>(`/api/security/events?limit=${limit}&offset=${offset}`),
  });

  const rows = query.data ?? null;
  const error = query.isError ? (query.error as Error).message || T('security.loadError') : '';

  return (
    <div>
      {error && <div className="alert alert--danger" role="alert">{error}</div>}

      <div className="users__head" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="muted" htmlFor="sec-limit">{T('common.page')}</label>
          <select
            id="sec-limit"
            className="input"
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setOffset(0); }}
            style={{ width: 'auto' }}
          >
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {rows === null ? (
        <div className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 16 }}>
          <Loader2 size={16} strokeWidth={2} className="spin" />
          <span>{T('users.loading')}</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="muted" style={{ padding: 16 }}>{T('common.empty')}</div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="rbac-matrix">
            <thead>
              <tr>
                <th>{T('security.when')}</th>
                <th>{T('security.kind')}</th>
                <th>{T('security.severity')}</th>
                <th>{T('security.source')}</th>
                <th>{T('security.user')}</th>
                <th>{T('security.ip')}</th>
                <th>{T('security.userAgent')}</th>
                <th>{T('security.detail')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const hasDetail = row.detail && Object.keys(row.detail).length > 0;
                const isOpen = expanded === row.id;
                return (
                  <tr key={row.id}>
                    <td className="mono">{formatTS(row.received_at)}</td>
                    <td className="mono">{row.kind}</td>
                    <td>{row.severity || '—'}</td>
                    <td>{row.source || '—'}</td>
                    <td className="mono">{row.user_id || '—'}</td>
                    <td className="mono">{row.ip || '—'}</td>
                    <td className="mono" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.user_agent}>
                      {row.user_agent || '—'}
                    </td>
                    <td>
                      {hasDetail ? (
                        <>
                          <button
                            className="btn btn--ghost btn--sm"
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : row.id)}
                          >
                            {isOpen ? T('audit.hide') : T('audit.show')}
                          </button>
                          {isOpen && (
                            <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0', fontSize: '0.8em' }}>
                              {JSON.stringify(row.detail, null, 2)}
                            </pre>
                          )}
                        </>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button
          className="btn btn--secondary"
          type="button"
          onClick={() => setOffset((o) => Math.max(0, o - limit))}
          disabled={offset === 0 || query.isFetching}
        >
          {T('common.prev')}
        </button>
        <button
          className="btn btn--secondary"
          type="button"
          onClick={() => setOffset((o) => o + limit)}
          disabled={(rows?.length ?? 0) < limit || query.isFetching}
        >
          {T('common.next')}
        </button>
      </div>
    </div>
  );
}
