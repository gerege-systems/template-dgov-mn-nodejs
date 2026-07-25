import PageHead from '@/components/PageHead';
import GovApplicationsView from '@/components/gov/GovApplicationsView';

import { usePageTitle } from '@/lib/usePageTitle';


export default function MeApplicationsPage() {
  usePageTitle('Миний хүсэлт');
  return (
    <>
      <PageHead eyebrowKey="group.govServices" titleKey="nav.govApplications" subKey="gov.applications.sub" />
      <GovApplicationsView />
    </>
  );
}
