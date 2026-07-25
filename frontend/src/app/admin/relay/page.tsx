import PageHead from '@/components/PageHead';
import RelayDashboardView from '@/components/relay/RelayDashboardView';
import { usePageTitle } from '@/lib/usePageTitle';


export default function Page() {
  usePageTitle('SLA хяналт — Хүсэлт дамжуулах');
  return (
    <>
      <PageHead eyebrowKey="group.relay" titleKey="nav.relayDashboard" subKey="relay.dashboard.sub" />
      <RelayDashboardView />
    </>
  );
}
