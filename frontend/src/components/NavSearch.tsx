"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

// Дээд талын хайлт — command-palette маягаар цэсний зүйлсийг (эрхийн дагуу
// шүүгдсэн) шүүж, dropdown-оор харуулна. Сонгоход тухайн хуудас руу шилжинэ.
export interface SearchItem {
  label: string;
  href: string;
  group: string;
}

export default function NavSearch({ items, placeholder, emptyText }: { items: SearchItem[]; placeholder: string; emptyText: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const query = q.trim().toLowerCase();
  const matches = query
    ? items
        .filter((i) => i.label.toLowerCase().includes(query) || i.group.toLowerCase().includes(query))
        .slice(0, 8)
    : [];

  // Гадна дарах / Escape дээр хаах.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  const go = (href: string) => {
    setQ('');
    setOpen(false);
    router.push(href);
  };

  return (
    <div className="topbar2__search navsearch" ref={wrapRef}>
      <Search size={16} strokeWidth={2} />
      <input
        className="topbar2__search-input"
        type="search"
        value={q}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-expanded={open && !!query}
        role="combobox"
        aria-controls="navsearch-results"
        autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); go(matches[active].href); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
      />
      {open && query && (
        <div className="navsearch__results" id="navsearch-results" role="listbox">
          {matches.length === 0 ? (
            <div className="navsearch__empty">{emptyText}</div>
          ) : (
            matches.map((m, i) => (
              <button
                key={m.href}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`navsearch__item${i === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(m.href)}
              >
                <span className="navsearch__label">{m.label}</span>
                <span className="navsearch__group">{m.group}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
