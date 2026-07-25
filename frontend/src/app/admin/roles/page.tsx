import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import RolesManager from '@/components/admin/RolesManager';
import { fetchMe, fetchMyPermissions } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Эрх (RBAC) — Админ' };

export default async function AdminRolesPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/admin/roles');
  const perms = await fetchMyPermissions();
  if (!perms.includes('roles.manage')) redirect('/');

  return (
    <>
      <PageHead eyebrowKey="sys.admin" titleKey="nav.roles" subKey="admin.roles.sub" />
      <RolesManager />
    </>
  );
}
