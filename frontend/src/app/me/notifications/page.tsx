import PageHead from '@/components/PageHead';
import GovNotificationsView from '@/components/gov/GovNotificationsView';

import { usePageTitle } from '@/lib/usePageTitle';


export default function MeNotificationsPage() {
  usePageTitle('Мэдэгдэл');
  return (
    <>
      <PageHead eyebrowKey="group.govServices" titleKey="nav.govNotifications" subKey="gov.notifications.sub" />
      <GovNotificationsView />
    </>
  );
}
