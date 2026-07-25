import PageHead from '@/components/PageHead';
import RelayConfigView from '@/components/relay/RelayConfigView';
import { usePageTitle } from '@/lib/usePageTitle';


export default function Page() {
  usePageTitle('Чиглүүлэлт — SLA хяналт');
  return (
    <>
      <PageHead eyebrowKey="group.relay" titleKey="nav.relayConfig" subKey="relay.config.sub" />
      <RelayConfigView />
    </>
  );
}
