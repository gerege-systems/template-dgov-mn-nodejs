import PageHead from '@/components/PageHead';
import RelayRequestDetailView from '@/components/relay/RelayRequestDetailView';
import { usePageTitle } from '@/lib/usePageTitle';
import { useParams } from 'react-router-dom';


export default function Page() {
  usePageTitle('Хүсэлтийн дэлгэрэнгүй — SLA хяналт');
  const { id = '' } = useParams();
  return (
    <>
      <PageHead eyebrowKey="group.relay" titleKey="nav.relayRequests" subKey="relay.detail.sub" />
      <RelayRequestDetailView id={id} />
    </>
  );
}
