import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import OrgDetail from '@/components/me/OrgDetail';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Байгууллага — Government Template Platform V3.0' };

export default async function MeOrganizationDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const me = await fetchMe();
  if (!me) redirect(`/login?next=/me/organizations/${params.id}`);

  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="org.title" subKey="org.detail" />
      <OrgDetail orgId={params.id} currentUserId={me.id} />
    </>
  );
}
