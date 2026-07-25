import React from 'react';
import { redirect } from 'next/navigation';
import AppShell from './AppShell';
import BackendUnavailable from './BackendUnavailable';
import { getMe } from '@/lib/api';
import { initialsOf } from '@/lib/format';

/**
 * AreaShell нь /admin, /manager бүлгийн нийтлэг server layout — session-г нэг
 * удаа шалгаж, AppShell-ийг render хийнэ (тус бүрийн нарийн эрхийн шалгалт
 * хуудсууддаа хэвээр). next нь нэвтрээгүй үед буцах зам.
 */
export default async function AreaShell({ next, children }: { next: string; children: React.ReactNode }) {
  const r = await getMe();
  if (!r.ok) {
    // Сесси үхсэн (401/403): stale refresh cookie-г цэвэрлэдэг route handler руу
    // чиглүүлнэ. Шууд /login руу шидвэл middleware refresh cookie-г "нэвтэрсэн"
    // гэж андуурч буцаах тул хязгааргүй redirect давталт (ERR_TOO_MANY_REDIRECTS)
    // үүсдэг — RSC cookie устгаж чаддаггүй нь гол шалтгаан. Backend түр унтарсан
    // (503/5xx): session-г хадгалж, алдаа харуулна (тэнд ч /login руу шидвэл
    // мөн давталтад орно).
    if (r.status === 401 || r.status === 403) {
      redirect(`/api/auth/expired?next=${encodeURIComponent(next)}`);
    }
    return <BackendUnavailable />;
  }
  const me = r.user;
  return (
    <AppShell user={{ username: me.username, fullName: me.fullName, fullNameEn: me.fullNameEn, email: me.email, initials: initialsOf(me.fullName || me.username), picture: me.google?.picture, roleId: me.roleId }}>
      {children}
    </AppShell>
  );
}
