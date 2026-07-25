import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import OrgManageView from '@/components/me/OrgManageView';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Байгууллага — Government Template Platform V3.0' };

// eID-д бүртгэлтэй, төлөөлдөг байгууллагын удирдах дэлгэц (гарын үсэг зурагч + салгах).
export default async function MeEidOrgManagePage(props: { params: Promise<{ regNo: string }> }) {
  const params = await props.params;
  const me = await fetchMe();
  if (!me) redirect(`/login?next=/me/organizations/eid/${params.regNo}`);

  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="org.title" subKey="org.detail" />
      <OrgManageView regNo={decodeURIComponent(params.regNo)} />
    </>
  );
}
