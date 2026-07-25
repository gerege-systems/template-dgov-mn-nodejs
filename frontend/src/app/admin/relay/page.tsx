import React from 'react';
import PageHead from '@/components/PageHead';
import RelayDashboardView from '@/components/relay/RelayDashboardView';
import { requireRelayAccess } from './guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'SLA хяналт — Хүсэлт дамжуулах' };

export default async function Page() {
  await requireRelayAccess();
  return (
    <>
      <PageHead eyebrowKey="group.relay" titleKey="nav.relayDashboard" subKey="relay.dashboard.sub" />
      <RelayDashboardView />
    </>
  );
}
