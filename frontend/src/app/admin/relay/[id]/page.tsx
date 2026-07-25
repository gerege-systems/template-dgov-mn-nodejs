import React from 'react';
import PageHead from '@/components/PageHead';
import RelayRequestDetailView from '@/components/relay/RelayRequestDetailView';
import { requireRelayAccess } from '../guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Хүсэлтийн дэлгэрэнгүй — SLA хяналт' };

export default async function Page(props: { params: Promise<{ id: string }> }) {
  await requireRelayAccess();
  const { id } = await props.params;
  return (
    <>
      <PageHead eyebrowKey="group.relay" titleKey="nav.relayRequests" subKey="relay.detail.sub" />
      <RelayRequestDetailView id={id} />
    </>
  );
}
