"use client";

import React from 'react';
import { Loader2 } from 'lucide-react';

// API Gateway view-уудын хуваалцсан жижиг туслахууд. UI мөрүүд (eid view-уудын
// нэгэн адил) шууд монголоор бичигдсэн — template-ийн gerege-theme классуудыг
// (card / defrow / chip / badge / btn) ашиглана.

/** ISO огноог товч орон нутгийн форматаар. */
export function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('mn-MN', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** HTTP статусыг өнгөтэй chip болгож харуулна (2xx ногоон, 3xx саарал, 4xx/5xx улаан). */
export function StatusChip({ status }: { status: number }) {
  const klass = status < 300 ? 'chip--success' : status < 400 ? 'chip--neutral' : 'chip--danger';
  return <span className={`chip ${klass} mono`}>{status}</span>;
}

/** enabled төлвийн chip. */
export function EnabledChip({ enabled }: { enabled: boolean }) {
  return enabled
    ? <span className="chip chip--success">Идэвхтэй</span>
    : <span className="chip chip--neutral">Идэвхгүй</span>;
}

/** HTTP method-уудыг жижиг mono badge-аар. */
export function Methods({ methods }: { methods: string[] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {methods.map((m) => (
        <span key={m} className="badge badge--primary mono" style={{ fontSize: 11 }}>{m}</span>
      ))}
    </span>
  );
}

/** Tag-уудыг саарал chip-ээр. */
export function Tags({ tags }: { tags: string[] }) {
  if (!tags?.length) return <span className="muted">—</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {tags.map((t) => <span key={t} className="chip chip--neutral" style={{ fontSize: 11 }}>{t}</span>)}
    </span>
  );
}

/** Ачаалж буй индикатор. */
export function Loading({ label = 'Ачаалж байна…' }: { label?: string }) {
  return (
    <div className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 16 }}>
      <Loader2 size={16} strokeWidth={2} className="spin" />
      <span>{label}</span>
    </div>
  );
}

/** Comma/зайгаар тусгаарласан мөрийг trimmed массив болгоно. */
export function splitList(s: string): string[] {
  return s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
}
