import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import GovServicesView from '@/components/gov/GovServicesView';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Үйлчилгээ — Government Template Platform V3.0' };

export default async function MeServicesPage() {
  const me = await fetchMe();
  if (!me) redirect('/');
  return (
    <>
      <PageHead eyebrowKey="group.govServices" titleKey="nav.govServices" subKey="gov.services.sub" />
      <GovServicesView />
    </>
  );
}
