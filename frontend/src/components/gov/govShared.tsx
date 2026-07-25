"use client";

import React from 'react';
import { Loader2 } from 'lucide-react';
import type { GovStatus } from '@/lib/govTypes';

// Иргэний Төрийн үйлчилгээний view-уудын хуваалцсан туслахууд. UI мөрүүд (eid
// view-уудын адил) монголоор; gerege-theme классуудыг ашиглана.

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('mn-MN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function money(n: number, currency = 'MNT'): string {
  const formatted = new Intl.NumberFormat('mn-MN').format(n);
  return currency === 'MNT' ? `${formatted}₮` : `${formatted} ${currency}`;
}

const STATUS_LABEL: Record<GovStatus, string> = {
  submitted: 'Илгээсэн',
  registered: 'Бүртгэгдсэн',
  in_review: 'Хянагдаж буй',
  info_required: 'Мэдээлэл дутуу',
  approved: 'Зөвшөөрсөн',
  rejected: 'Татгалзсан',
  completed: 'Дууссан',
  cancelled: 'Цуцалсан',
  expired: 'Хугацаа дууссан',
};

export function ApplicationStatus({ status }: { status: GovStatus }) {
  const klass =
    status === 'approved' || status === 'completed' ? 'chip--success'
      : status === 'rejected' || status === 'cancelled' || status === 'expired' ? 'chip--danger'
        : status === 'info_required' ? 'chip--warning'
          : 'chip--neutral';
  return <span className={`chip ${klass}`}>{STATUS_LABEL[status] ?? status}</span>;
}

// Хугацааны үлдэгдлийг харуулна. Хэтэрсэн бол улаанаар, 24 цагаас бага бол
// шаргалаар — менежер юуг эхлүүлэхээ шууд харна.
export function DueChip({ dueAt, suspended }: { dueAt: string | null; suspended?: boolean }) {
  if (suspended) return <span className="chip chip--warning">Хугацаа зогссон</span>;
  if (!dueAt) return <span className="muted">—</span>;

  const ms = new Date(dueAt).getTime() - Date.now();
  const hours = Math.round(ms / 3_600_000);
  if (ms < 0) return <span className="chip chip--danger">{Math.abs(hours)}ц хэтэрсэн</span>;
  if (hours < 24) return <span className="chip chip--warning">{hours}ц үлдсэн</span>;
  return <span className="chip chip--neutral">{Math.round(hours / 24)} хоног</span>;
}

export function Loading({ label = 'Ачаалж байна…' }: { label?: string }) {
  return (
    <div className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 16 }}>
      <Loader2 size={16} strokeWidth={2} className="spin" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyRow({ text }: { text: string }) {
  return (
    <div className="defrow"><span className="defrow__value muted">{text}</span></div>
  );
}
