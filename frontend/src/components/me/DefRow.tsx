"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * DefRow нь профайлын нэг "шошго → утга" мөр. ProfileView дахь давтагдсан
 * defrow markup-ийг нэг дор төвлөрүүлж, секц бүр ижилхэн харагдана.
 */
export function DefRow({
  icon: Icon,
  label,
  children,
  mono = false,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="defrow">
      <span className="defrow__label">
        <Icon size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        {label}
      </span>
      <span className={`defrow__value${mono ? ' mono' : ''}`}>{children}</span>
    </div>
  );
}
