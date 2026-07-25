import React from 'react';
import PageHead from '@/components/PageHead';
import RelayConfigView from '@/components/relay/RelayConfigView';
import { requireRelayAccess } from '../guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Чиглүүлэлт — SLA хяналт' };

export default async function Page() {
  await requireRelayAccess();
  return (
    <>
      <PageHead eyebrowKey="group.relay" titleKey="nav.relayConfig" subKey="relay.config.sub" />
      <RelayConfigView />
    </>
  );
}
