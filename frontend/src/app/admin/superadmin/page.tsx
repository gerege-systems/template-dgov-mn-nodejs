import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import SuperadminManager from '@/components/admin/SuperadminManager';
import AccessModeCard from '@/components/superadmin/AccessModeCard';
import { fetchMe } from '@/lib/api';
import { isSuperAdmin } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Супер админ — Админуудыг удирдах' };

export default async function SuperadminPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/admin/superadmin');
  // Зөвхөн super admin — энгийн admin ч хандахгүй (least-privilege).
  if (!isSuperAdmin(me.roleId)) redirect('/');

  return (
    <>
      <PageHead eyebrowKey="sys.admin" titleKey="nav.superadmin" subKey="superadmin.sub" />
      <AccessModeCard />
      <SuperadminManager currentUserId={me.id} />
    </>
  );
}
