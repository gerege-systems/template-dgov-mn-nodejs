import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import EidDevicesView from '@/components/me/eid/EidDevicesView';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Төхөөрөмж — Government Template Platform V3.0' };

export default async function EidDevicesPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/me/eid/devices');
  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="eid.devices.title" subKey="eid.devices.sub" />
      <EidDevicesView show={!!me.eid || !!me.eidProxy} />
    </>
  );
}
