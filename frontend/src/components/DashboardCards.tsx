"use client";

import React from 'react';
import Link from 'next/link';
import { Users, ShieldHalf, ShieldCheck } from 'lucide-react';
import { useT } from '@/lib/lang';
import type { DictKey } from '@/lib/i18n';

type Card = { href: string; titleKey: DictKey; descKey: DictKey; icon: typeof Users; perm: string };

const SETS: Record<string, Card[]> = {
  admin: [
    { href: '/admin/users', titleKey: 'nav.users', descKey: 'card.users.desc', icon: Users, perm: 'users.manage' },
    { href: '/admin/roles', titleKey: 'nav.roles', descKey: 'card.roles.desc', icon: ShieldHalf, perm: 'roles.manage' },
    { href: '/admin/settings', titleKey: 'nav.settings', descKey: 'card.settings.desc', icon: ShieldCheck, perm: 'settings.manage' },
  ],
  manager: [
    { href: '/manager/users', titleKey: 'nav.users', descKey: 'card.managerUsers.desc', icon: Users, perm: 'users.manage' },
  ],
};

/** Эрхээр шүүсэн, орчуулагддаг dashboard карт grid (admin/manager). */
export default function DashboardCards({ set, perms }: { set: 'admin' | 'manager'; perms: string[] }) {
  const { T } = useT();
  const cards = (SETS[set] ?? []).filter((c) => perms.includes(c.perm));
  if (cards.length === 0) return null;
  return (
    <div className="card-grid">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Link key={c.href} href={c.href} className="card" style={{ padding: 20, textDecoration: 'none' }}>
            <Icon size={22} strokeWidth={2} />
            <h3>{T(c.titleKey)}</h3>
            <p className="muted">{T(c.descKey)}</p>
          </Link>
        );
      })}
    </div>
  );
}
