import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import GovQueueView from '@/components/gov/GovQueueView';
import { fetchMe, fetchMyPermissions } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Менежер — Иргэний хүсэлт' };

export default async function ManagerRequestsPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/manager/requests');
  const perms = await fetchMyPermissions();
  // Backend мөн адил gov.review эрхийг шаарддаг — энэ нь UI түвшний хаалт.
  if (!perms.includes('gov.review')) redirect('/');

  return (
    <>
      <PageHead eyebrowKey="sys.manager" titleKey="nav.govQueue" subKey="gov.queue.sub" />
      <GovQueueView />
    </>
  );
}
