"use client";

import React, { useRef } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label?: string;
  icon?: React.ReactNode;
  ariaLabel?: string;
}

interface Props<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

/**
 * Загвар & хэл сонгоход хэрэглэдэг хоёр/гурван төлөвт segmented control.
 * Arrow-Left / Arrow-Right фокус шилжүүлж утгыг сольдог.
 */
export default function SegmentedControl<T extends string>({
  options, value, onChange, ariaLabel,
}: Props<T>) {
  const groupRef = useRef<HTMLDivElement>(null);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const items = Array.from(groupRef.current?.querySelectorAll<HTMLButtonElement>('.segmented__item') ?? []);
    const active = document.activeElement as HTMLElement | null;
    const idx = items.findIndex((b) => b === active);
    if (idx === -1) return;
    e.preventDefault();
    const next = items[(idx + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
    next.focus();
    next.click();
  };

  return (
    <div
      ref={groupRef}
      className="segmented"
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKey}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.ariaLabel}
            className={`segmented__item${active ? ' is-active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
