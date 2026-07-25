"use client";

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useT } from '@/lib/lang';
import { getJSON } from '@/lib/client';
import { formatTS } from '@/lib/format';

interface AuditEntry {
  id: number;
  occurred_at: string;
  actor_user_id?: string;
  action: string;
  category?: string;
  target?: string;
  request_id?: string;
  metadata?: Record<string, unknown>;
  prev_hash?: string;
  chain_hash: string;
}

interface VerifyResult {
  ok: boolean;
  broken_id?: number;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

export default function AuditViewer() {
  const { T } = useT();
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  const query = useQuery({
    queryKey: ['audit', limit, offset],
    queryFn: () => getJSON<AuditEntry[]>(`/api/audit?limit=${limit}&offset=${offset}`),
  });

  const rows = query.data ?? null;
  const error = query.isError ? (query.error as Error).message || T('audit.loadError') : '';

  const runVerify = async () => {
    setVerifying(true);
    setVerifyError('');
    setVerify(null);
    try {
      const res = await getJSON<VerifyResult>('/api/audit/verify');
      setVerify(res);
    } catch (e) {
      setVerifyError((e as Error).message || T('audit.loadError'));
    }
    setVerifying(false);
  };

  return (
    <div>
      {error && <div className="alert alert--danger" role="alert">{error}</div>}

      <div className="users__head" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn--primary" type="button" onClick={runVerify} disabled={verifying}>
          {verifying ? <Loader2 size={16} strokeWidth={2} className="spin" /> : <ShieldCheck size={16} strokeWidth={2} />}
          <span>{T('audit.verify')}</span>
        </button>

        {verify && (
          verify.ok ? (
            <span className="badge badge--ok" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <ShieldCheck size={14} strokeWidth={2} />
              {T('audit.chainOk')}
            </span>
          ) : (
            <span className="badge badge--danger" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <ShieldAlert size={14} strokeWidth={2} />
              {T('audit.chainBroken')}{verify.broken_id ? ` (#${verify.broken_id})` : ''}
            </span>
          )
        )}
        {verifyError && <span className="muted" style={{ color: 'var(--danger, #c00)' }}>{verifyError}</span>}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="muted" htmlFor="audit-limit">{T('common.page')}</label>
          <select
            id="audit-limit"
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
                <th>{T('audit.when')}</th>
                <th>{T('audit.action')}</th>
                <th>{T('audit.category')}</th>
                <th>{T('audit.actor')}</th>
                <th>{T('audit.target')}</th>
                <th>{T('audit.requestId')}</th>
                <th>{T('audit.metadata')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const hasMeta = row.metadata && Object.keys(row.metadata).length > 0;
                const isOpen = expanded === row.id;
                return (
                  <tr key={row.id}>
                    <td className="mono">{formatTS(row.occurred_at)}</td>
                    <td className="mono">{row.action}</td>
                    <td>{row.category || '—'}</td>
                    <td className="mono">{row.actor_user_id || '—'}</td>
                    <td>{row.target || '—'}</td>
                    <td className="mono">{row.request_id || '—'}</td>
                    <td>
                      {hasMeta ? (
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
                              {JSON.stringify(row.metadata, null, 2)}
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
