import React from 'react';
import PageHead from '@/components/PageHead';
import GatewayLogsView from '@/components/gateway/GatewayLogsView';
import { requireGatewayAccess } from '../guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'API Gateway — Хүсэлтийн лог' };

export default async function Page() {
  await requireGatewayAccess();
  return (
    <>
      <PageHead eyebrowKey="group.gateway" titleKey="nav.gwLogs" subKey="gateway.logs.sub" />
      <GatewayLogsView />
    </>
  );
}
