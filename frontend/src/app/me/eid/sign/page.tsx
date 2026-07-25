import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import EidSignView from '@/components/me/eid/EidSignView';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Гарын үсэг зурах — Government Template Platform V3.0' };

export default async function EidSignPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/me/eid/sign');
  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="eid.sign.title" subKey="eid.sign.sub" />
      <EidSignView />
    </>
  );
}
