import PageHead from '@/components/PageHead';
import GatewayLogsView from '@/components/gateway/GatewayLogsView';
import { usePageTitle } from '@/lib/usePageTitle';


export default function Page() {
  usePageTitle('API Gateway — Хүсэлтийн лог');
  return (
    <>
      <PageHead eyebrowKey="group.gateway" titleKey="nav.gwLogs" subKey="gateway.logs.sub" />
      <GatewayLogsView />
    </>
  );
}
