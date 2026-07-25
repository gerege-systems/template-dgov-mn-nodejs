import PageHead from '@/components/PageHead';
import GatewayServicesView from '@/components/gateway/GatewayServicesView';
import { usePageTitle } from '@/lib/usePageTitle';


export default function Page() {
  usePageTitle('API Gateway — Сервисүүд');
  return (
    <>
      <PageHead eyebrowKey="group.gateway" titleKey="nav.gwServices" subKey="gateway.services.sub" />
      <GatewayServicesView />
    </>
  );
}
