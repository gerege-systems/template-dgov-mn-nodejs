import React from 'react';
import PageHead from '@/components/PageHead';
import ApplicationsView from '@/components/applications/ApplicationsView';
import { requireGatewayAccess } from '../gateway/guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Applications' };

export default async function Page() {
  await requireGatewayAccess();
  return (
    <>
      <PageHead eyebrowKey="group.gateway" titleKey="nav.applications" subKey="apps.sub" />
      <ApplicationsView />
    </>
  );
}
