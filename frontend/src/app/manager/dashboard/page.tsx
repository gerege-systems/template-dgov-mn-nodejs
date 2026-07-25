import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import DashboardCards from '@/components/DashboardCards';
import { fetchMe, fetchMyPermissions } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Менежер — Хяналтын самбар' };

export default async function ManagerDashboardPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/manager/dashboard');
  const perms = await fetchMyPermissions();
  if (!perms.includes('manager.view')) redirect('/');

  return (
    <>
      <PageHead eyebrowKey="sys.manager" titleKey="nav.managerDashboard" subKey="manager.dashboard.sub" />
      <DashboardCards set="manager" perms={perms} />
    </>
  );
}
