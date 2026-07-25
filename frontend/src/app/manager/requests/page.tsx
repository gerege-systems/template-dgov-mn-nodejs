import PageHead from '@/components/PageHead';
import GovQueueView from '@/components/gov/GovQueueView';

import { usePageTitle } from '@/lib/usePageTitle';


export default function ManagerRequestsPage() {
  usePageTitle('Менежер — Иргэний хүсэлт');
  // Backend мөн адил gov.review эрхийг шаарддаг — энэ нь UI түвшний хаалт.

  return (
    <>
      <PageHead eyebrowKey="sys.manager" titleKey="nav.govQueue" subKey="gov.queue.sub" />
      <GovQueueView />
    </>
  );
}
