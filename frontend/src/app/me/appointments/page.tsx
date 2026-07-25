import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import GovAppointmentsView from '@/components/gov/GovAppointmentsView';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Цаг захиалга — Government Template Platform V3.0' };

export default async function MeAppointmentsPage() {
  const me = await fetchMe();
  if (!me) redirect('/');
  return (
    <>
      <PageHead eyebrowKey="group.govServices" titleKey="nav.govAppointments" subKey="gov.appointments.sub" />
      <GovAppointmentsView />
    </>
  );
}
