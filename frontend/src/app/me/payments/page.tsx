import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import GovPaymentsView from '@/components/gov/GovPaymentsView';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Төлбөр — Government Template Platform V3.0' };

export default async function MePaymentsPage() {
  const me = await fetchMe();
  if (!me) redirect('/');
  return (
    <>
      <PageHead eyebrowKey="group.govServices" titleKey="nav.govPayments" subKey="gov.payments.sub" />
      <GovPaymentsView />
    </>
  );
}
