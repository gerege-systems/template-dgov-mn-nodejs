import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import SecurityViewer from '@/components/admin/SecurityViewer';
import { fetchMe } from '@/lib/api';
import { isAdminLevel } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Аюулгүй байдал — Админ' };

export default async function AdminSecurityPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/admin/security');
  if (!isAdminLevel(me.roleId)) redirect('/');

  return (
    <>
      <PageHead eyebrowKey="sys.admin" titleKey="security.title" subKey="security.sub" />
      <SecurityViewer />
    </>
  );
}
