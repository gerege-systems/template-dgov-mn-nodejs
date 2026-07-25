import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import EidLogsView from '@/components/me/eid/EidLogsView';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Үйл ажиллагаа — Government Template Platform V3.0' };

export default async function EidLogsPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/me/eid/logs');
  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="eid.logs.title" subKey="eid.logs.sub" />
      <EidLogsView show={!!me.eid || !!me.eidProxy} />
    </>
  );
}
