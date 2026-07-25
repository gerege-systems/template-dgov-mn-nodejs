import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import CoreSearchView from '@/components/admin/CoreSearchView';
import { fetchMe, fetchMyPermissions } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Core хайлт — Админ' };

export default async function AdminCorePage() {
  const me = await fetchMe();
  if (!me) redirect('/');
  const perms = await fetchMyPermissions();
  if (!perms.includes('users.manage')) redirect('/');
  return (
    <>
      <PageHead eyebrowKey="sys.admin" titleKey="nav.coreSearch" subKey="core.search.sub" />
      <CoreSearchView />
    </>
  );
}
