"use client";

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Inbox } from 'lucide-react';
import { getJSON } from '@/lib/client';
import type { GwLog } from '@/lib/gatewayTypes';
import { Loading, StatusChip, fmtDateTime } from './gwShared';

export default function GatewayLogsView() {
  const q = useQuery({ queryKey: ['gw-logs'], queryFn: () => getJSON<GwLog[]>('/api/gateway/logs?limit=100') });
  const logs = q.data ?? [];

  return (
    <section className="card users-table-wrap">
      <div className="card__head card__head--with-sub">
        <div className="card__title"><h2>Сүүлийн хүсэлтүүд</h2></div>
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw size={14} strokeWidth={2} className={q.isFetching ? 'spin' : undefined} /> Шинэчлэх
        </button>
      </div>

      {q.isPending && <Loading />}
      {q.isError && <div className="alert alert--danger" role="alert">{(q.error as Error).message}</div>}

      {!q.isPending && !q.isError && logs.length === 0 && (
        <div className="defrow"><span className="defrow__value muted"><Inbox size={15} /> Бүртгэл алга.</span></div>
      )}

      {logs.length > 0 && (
        <table className="users-table">
          <thead>
            <tr>
              <th>Статус</th><th>Method</th><th>Зам</th><th>Латент</th><th>IP</th><th>Огноо</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td data-label="Статус"><StatusChip status={l.status} /></td>
                <td data-label="Method"><span className="badge badge--primary mono" style={{ fontSize: 11 }}>{l.method}</span></td>
                <td className="mono" data-label="Зам">{l.path}</td>
                <td className="mono" data-label="Латент">{l.latency_ms}ms</td>
                <td className="mono muted" data-label="IP">{l.client_ip || '—'}</td>
                <td className="mono muted" data-label="Огноо">{fmtDateTime(l.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
