import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import GovApplicationsView from '@/components/gov/GovApplicationsView';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Миний хүсэлт — Government Template Platform V3.0' };

export default async function MeApplicationsPage() {
  const me = await fetchMe();
  if (!me) redirect('/');
  return (
    <>
      <PageHead eyebrowKey="group.govServices" titleKey="nav.govApplications" subKey="gov.applications.sub" />
      <GovApplicationsView />
    </>
  );
}
