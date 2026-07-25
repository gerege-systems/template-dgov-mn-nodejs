import PageHead from '@/components/PageHead';
import GatewayOverviewView from '@/components/gateway/GatewayOverviewView';
import { usePageTitle } from '@/lib/usePageTitle';


export default function Page() {
  usePageTitle('API Gateway — Тойм');
  return (
    <>
      <PageHead eyebrowKey="group.gateway" titleKey="nav.gwOverview" subKey="gateway.overview.sub" />
      <GatewayOverviewView />
    </>
  );
}
