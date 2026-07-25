import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import AuditViewer from '@/components/admin/AuditViewer';
import { fetchMe } from '@/lib/api';
import { isAdminLevel } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Аудит лог — Админ' };

export default async function AdminAuditPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/admin/audit');
  if (!isAdminLevel(me.roleId)) redirect('/');

  return (
    <>
      <PageHead eyebrowKey="sys.admin" titleKey="audit.title" subKey="audit.sub" />
      <AuditViewer />
    </>
  );
}
