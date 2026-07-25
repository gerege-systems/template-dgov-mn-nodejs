import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import DashboardCards from '@/components/DashboardCards';
import { fetchMe, fetchMyPermissions } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Админ — Хяналтын самбар' };

export default async function AdminDashboardPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/admin/dashboard');
  const perms = await fetchMyPermissions();
  if (!perms.includes('dashboard.view')) redirect('/');

  return (
    <>
      <PageHead eyebrowKey="sys.admin" titleKey="nav.dashboard" subKey="admin.dashboard.sub" />
      <DashboardCards set="admin" perms={perms} />
    </>
  );
}
