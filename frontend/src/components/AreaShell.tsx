// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React from 'react';

import { initialsOf } from '@/lib/format';
import { useSession } from '@/lib/session';
import AppShell from './AppShell';
import BackendUnavailable from './BackendUnavailable';

/**
 * AreaShell нь /me, /admin, /manager бүлгийн нийтлэг бүрхүүл. Нэвтрэлтийн
 * шалгалт нь route давхаргад (RequireAuth) — энд зөвхөн session-ий өгөгдлөөр
 * AppShell-ийг дүүргэнэ.
 *
 * `next` нь маршрутын гэрээг хадгалахаар үлдсэн (нэвтрээгүй үед RequireAuth
 * буцах замыг өөрөө байгуулна).
 */
export default function AreaShell({
  next: _next,
  children,
}: {
  next: string;
  children: React.ReactNode;
}): React.ReactElement | null {
  const { me, loading } = useSession();

  if (loading) return null;
  // RequireAuth нэвтрээгүйг аль хэдийн шүүсэн байх ёстой; энд `me` алга гэдэг
  // нь API-тай холбогдож чадаагүйг л илэрхийлнэ.
  if (!me) return <BackendUnavailable />;

  return (
    <AppShell
      user={{
        username: me.username,
        fullName: me.fullName,
        fullNameEn: me.fullNameEn,
        email: me.email,
        initials: initialsOf(me.fullName || me.username),
        picture: me.google?.picture,
        roleId: me.roleId,
      }}
    >
      {children}
    </AppShell>
  );
}
