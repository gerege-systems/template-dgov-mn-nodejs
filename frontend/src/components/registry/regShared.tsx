"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Ring R1 регистрийн view-уудын хуваалцсан жижиг компонентууд. Template-ийн
// gerege-theme классуудыг (card / defrow / chip / badge / btn / stat-card)
// ашиглана.

import React from 'react';
import { Loader2 } from 'lucide-react';
import type { Proactivity, RegistryStatus } from '@/lib/registryTypes';

/** Ачаалж буй индикатор. */
export function Loading({ label }: { label: string }) {
  return (
    <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Loader2 size={16} strokeWidth={2} className="spin" />
      <span className="muted">{label}</span>
    </div>
  );
}

/** KPI хайрцаг. */
export function StatCard({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  tone?: string;
}) {
  return (
    <div className="card stat-card" style={{ margin: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: tone ?? 'var(--dan-blue-text)' }}>
        {icon}
      </div>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  );
}

/** Паспортын статусын chip. */
export function StatusChip({ status, labels }: { status: RegistryStatus; labels: Record<string, string> }) {
  const klass =
    status === 'published' ? 'chip--success' : status === 'archived' ? 'chip--neutral' : 'chip--warning';
  return <span className={`chip ${klass}`}>{labels[status] ?? status}</span>;
}

/**
 * Проактив байдлын шатны chip. Шат ахих тусам "ногоон" болно — самбар дээр
 * аль үйлчилгээ хоцорч байгаа нь шууд харагдана.
 */
export function ProactivityChip({
  level,
  labels,
}: {
  level: Proactivity;
  labels: Record<string, string>;
}) {
  const klass =
    level === 'proactive'
      ? 'chip--success'
      : level === 'once_only'
        ? 'chip--primary'
        : level === 'online'
          ? 'chip--neutral'
          : 'chip--warning';
  return <span className={`chip ${klass}`}>{labels[level] ?? level}</span>;
}

/**
 * Baseline-тай харьцуулсан ялгааг харуулна. СӨРӨГ утга = сайжралт тул ногоон;
 * эерэг = ухарсан тул улаан. Тэг бол зурааснаас өөр юу ч харуулахгүй.
 */
export function Delta({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="muted">—</span>;
  const improved = value < 0;
  return (
    <span
      className="mono"
      style={{ color: improved ? 'var(--success,#16a34a)' : 'var(--danger,#dc2626)' }}
    >
      {improved ? '' : '+'}
      {value}
      {suffix}
    </span>
  );
}

/** Огноог товч орон нутгийн форматаар. */
export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

/** Мянгатын тусгаарлагчтай тоо. */
export function fmtNum(n: number): string {
  return n.toLocaleString('mn-MN');
}
