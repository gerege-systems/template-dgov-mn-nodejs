import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import GovNotificationsView from '@/components/gov/GovNotificationsView';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Мэдэгдэл — Government Template Platform V3.0' };

export default async function MeNotificationsPage() {
  const me = await fetchMe();
  if (!me) redirect('/');
  return (
    <>
      <PageHead eyebrowKey="group.govServices" titleKey="nav.govNotifications" subKey="gov.notifications.sub" />
      <GovNotificationsView />
    </>
  );
}
