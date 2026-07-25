import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import EidIdView from '@/components/me/eid/EidIdView';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'eID үнэмлэх — Government Template Platform V3.0' };

export default async function EidIdPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/me/eid/id');
  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="eid.id.title" subKey="eid.id.sub" />
      <EidIdView me={me} />
    </>
  );
}
